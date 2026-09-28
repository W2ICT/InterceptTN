/* Core generation engine: holding-entry classification + flight-profile (sortie) builder. */

function norm360(x) {
  return ((x % 360) + 360) % 360;
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function roundTo(v, step) {
  return Math.round(v / step) * step;
}

/**
 * Classify a holding-pattern entry.
 * inboundCourse: published inbound course (deg, the course flown TOWARD the fix)
 * arrivalHeading: heading/track the aircraft is flying as it approaches the fix
 * turn: "right" (standard) | "left" (non-standard)
 * Returns { key: 'direct'|'teardrop'|'parallel', delta }
 *
 * Verified against the sector construction in ICAO Doc 8168 Vol I §6
 * (Direct 180°, Teardrop/Offset 70°, Parallel 110°) and cross-checked
 * numerically against a reference implementation (holdingentrycalculator.com).
 */
function classifyEntry(inboundCourse, arrivalHeading, turn) {
  const delta = norm360(arrivalHeading - inboundCourse);
  let key;
  if (turn === "right") {
    if (delta >= 290 || delta < 110) key = "direct";
    else if (delta < 180) key = "teardrop";
    else key = "parallel";
  } else {
    if (delta < 70 || delta >= 250) key = "direct";
    else if (delta <= 180) key = "parallel";
    else key = "teardrop";
  }
  return { key, delta };
}

const ENTRY_LABEL = {
  icao: { direct: "Sector 3 — Direct entry", teardrop: "Sector 2 — Offset entry", parallel: "Sector 1 — Parallel entry" },
  faa: { direct: "Direct entry", teardrop: "Teardrop entry", parallel: "Parallel entry" },
};

function entryDistanceToBoundary(delta, turn) {
  const bounds = turn === "right" ? [110, 180, 290, 360, 0] : [70, 180, 250, 360, 0];
  let min = 360;
  for (const b of bounds) {
    let d = Math.abs(delta - b);
    d = Math.min(d, 360 - d);
    if (d < min) min = d;
  }
  return min;
}

/** Given where the aircraft is (bearing/distance from a station) and the course
 * it must join, work out which side it's on and the heading to intercept it. */
function solveIntercept(bearingFromStation, establishedCourse, interceptAngle) {
  const delta = norm360(bearingFromStation - establishedCourse);
  const side = delta > 0 && delta < 180 ? "right" : "left";
  const interceptHeading = norm360(side === "right" ? establishedCourse - interceptAngle : establishedCourse + interceptAngle);
  return { side, interceptHeading, delta };
}

function navaidsUsableAsFix(airport) {
  const list = airport.navaids.filter((n) => n.type === "NDB" || n.type === "VOR/DME" || n.type === "TACAN");
  return list.length ? list : airport.navaids;
}

function runwayIlsCourse(rw) {
  const parts = rw.id.split("/");
  const idx = parts.indexOf(rw.ils);
  return rw.hdgs[idx];
}

/** Resolve an airport's briefed training-area boundary/areas into real lat/lon
 * polygons (radial/DME are given relative to a named reference navaid, "CTR"). */
function computeTrainingAreaPolygons(airport) {
  const ta = airport.trainingArea;
  if (!ta) return null;
  const station = airport.navaids.find((n) => n.id === ta.refNavaidId);
  if (!station) return null;
  const pts = { CTR: station.pos };
  Object.keys(ta.points).forEach((k) => {
    const p = ta.points[k];
    pts[k] = destPoint(station.pos, p.radial, p.dme);
  });
  const areas = {};
  Object.keys(ta.areas).forEach((k) => { areas[k] = ta.areas[k].map((name) => pts[name]); });
  const boundary = ta.boundary.map((name) => pts[name]);
  return { refStation: station, points: pts, areas, boundary };
}

/** Uniformly-ish sample a lat/lon point inside one of the given polygons
 * (rejection sampling against each polygon's bounding box). */
function samplePointInPolygons(polys) {
  for (let tries = 0; tries < 400; tries++) {
    const poly = pick(polys);
    const lats = poly.map((p) => p.lat), lons = poly.map((p) => p.lon);
    const cand = { lat: rand(Math.min(...lats), Math.max(...lats)), lon: rand(Math.min(...lons), Math.max(...lons)) };
    if (pointInPolygon(cand, poly)) return cand;
  }
  return null;
}

/* ---------------- Flight-profile (sortie) generator ---------------- */

function generateFlightProfile(config) {
  const dep = AIRPORTS[config.departureIcao];
  const pool = [];
  navaidsUsableAsFix(dep).forEach((n) => pool.push({ airport: dep, navaid: n }));
  if (config.stationMode === "dual" && config.secondIcao && AIRPORTS[config.secondIcao]) {
    const second = AIRPORTS[config.secondIcao];
    navaidsUsableAsFix(second).forEach((n) => pool.push({ airport: second, navaid: n }));
  }

  const courseStep = config.difficulty === "easy" ? 30 : config.difficulty === "medium" ? 10 : 1;
  const interceptAngle = config.interceptAngle || 45;

  let currentPos = { lat: dep.arp.lat, lon: dep.arp.lon };
  const legs = [];
  for (let i = 0; i < config.legCount; i++) {
    const ref = pick(pool);
    const station = ref.navaid;
    // Fix-to-Fix legs are point-to-point (compute direct course/distance between two
    // fixes) instead of intercepting a radial off the station and tracking it outbound.
    const isFixToFix = !!config.fixToFix && Math.random() < 0.5;

    // If this station's airport has a briefed training area and the instructor
    // picked which sub-area(s) to use, sample the fix from inside those areas
    // instead of a fully random radial/DME.
    let course, dme, fixPos;
    const taPolys = computeTrainingAreaPolygons(ref.airport);
    if (taPolys && config.trainingAreas && config.trainingAreas.length) {
      const selectedPolys = config.trainingAreas.map((k) => taPolys.areas[k]).filter(Boolean);
      // Sampling only constrains the FIX (leg endpoint) to be inside the area — the
      // intercept turn (or, for fix-to-fix, the direct leg itself) leading up to it
      // could still swing outside the boundary before reaching it. Retry candidates
      // until the whole leg checks out inside the overall boundary, so the sortie
      // never strays out.
      for (let tries = 0; tries < 40 && course === undefined; tries++) {
        const point = selectedPolys.length ? samplePointInPolygons(selectedPolys) : null;
        if (!point) break;
        const bd = bearingDistance(station.pos, point);
        const cCourse = Math.round(bd.bearing);
        const cDme = Math.round(bd.distNm * 10) / 10;
        const cFixPos = destPoint(station.pos, cCourse, cDme);
        let ok;
        if (isFixToFix) {
          const mid = { lat: (currentPos.lat + cFixPos.lat) / 2, lon: (currentPos.lon + cFixPos.lon) / 2 };
          ok = pointInPolygon(cFixPos, taPolys.boundary) && pointInPolygon(mid, taPolys.boundary);
        } else {
          const curBearing = bearingDistance(station.pos, currentPos).bearing;
          const cInterceptHeading = solveIntercept(curBearing, cCourse, interceptAngle).interceptHeading;
          const interceptPt = intersectCourses(currentPos, cInterceptHeading, station.pos, cCourse);
          ok = interceptPt && pointInPolygon(interceptPt, taPolys.boundary) && pointInPolygon(cFixPos, taPolys.boundary);
        }
        if (ok) { course = cCourse; dme = cDme; fixPos = cFixPos; }
      }
    }
    if (course === undefined) {
      course = roundTo(randInt(0, 359), courseStep) % 360 || (courseStep === 30 ? 360 : 0);
      dme = roundTo(rand(6, 25), 1);
      fixPos = destPoint(station.pos, course, dme);
    }

    if (isFixToFix) {
      const { bearing: directCourse, distNm: directDistNm } = bearingDistance(currentPos, fixPos);
      legs.push({
        index: i + 1,
        kind: "fixToFix",
        stationAirport: ref.airport,
        station,
        course,
        dme,
        fromPos: currentPos,
        directCourse: Math.round(directCourse),
        directDistNm: Math.round(directDistNm * 10) / 10,
        fixPos,
        headingAtFix: Math.round(directCourse),
      });
    } else {
      // bearingFromStation = the radial the aircraft is currently on, i.e. bearing FROM
      // the station TO the aircraft's current position (not the reciprocal).
      const { bearing, distNm } = bearingDistance(station.pos, currentPos);
      const { side, interceptHeading } = solveIntercept(bearing, course, interceptAngle);
      legs.push({
        index: i + 1,
        kind: "intercept",
        stationAirport: ref.airport,
        station,
        course,
        dme,
        fromPos: currentPos,
        bearingFromStation: Math.round(bearing * 10) / 10,
        distanceNm: Math.round(distNm * 10) / 10,
        side,
        interceptAngle,
        interceptHeading: Math.round(interceptHeading),
        fixPos,
        headingAtFix: course,
      });
    }
    currentPos = fixPos;
  }

  const lastCourse = legs[legs.length - 1].headingAtFix;
  let ending;
  if (config.ending === "hold") {
    const inboundCourse = roundTo(randInt(0, 359), courseStep) % 360 || (courseStep === 30 ? 360 : 0);
    const turn = config.turnMode === "mixed" ? pick(["right", "right", "right", "left"]) : config.turnMode;
    const entry = classifyEntry(inboundCourse, lastCourse, turn);
    const legIsDme = legs[legs.length - 1].station.type === "VOR/DME" || legs[legs.length - 1].station.type === "TACAN";
    const holdLeg = legIsDme && Math.random() < 0.5 ? { kind: "dme", value: roundTo(rand(4, 12), 0.5) } : { kind: "time", value: pick([1, 1, 1.5]) };
    ending = {
      type: "hold",
      navaid: legs[legs.length - 1].station,
      atPos: currentPos,
      inboundCourse,
      turn,
      arrivalHeading: lastCourse,
      entry,
      leg: holdLeg,
      marginToBoundary: entryDistanceToBoundary(norm360(lastCourse - inboundCourse), turn),
    };
  } else if (config.ending === "approach") {
    const rw = (dep.runways || []).find((r) => r.ils) || (dep.runways || [])[0];
    const finalCourse = rw ? runwayIlsCourse(rw) : lastCourse;
    const locNavaid = dep.navaids.find((n) => n.type === "ILS/LOC") || dep.navaids[0];
    const { bearing, distNm } = bearingDistance(locNavaid.pos, currentPos);
    const { side, interceptHeading } = solveIntercept(bearing, finalCourse, interceptAngle);
    ending = {
      type: "approach",
      navaid: locNavaid,
      runway: rw,
      course: finalCourse,
      fromPos: currentPos,
      bearingFromStation: Math.round(bearing * 10) / 10,
      distanceNm: Math.round(distNm * 10) / 10,
      side,
      interceptAngle,
      interceptHeading: Math.round(interceptHeading),
    };
  } else {
    ending = { type: "plain", atPos: currentPos };
  }

  const altitude = roundTo(randInt(20, 90) * 100, 500);

  return { departure: dep, legs, ending, altitude, config, id: 0 };
}

function generateProfiles(config, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const p = generateFlightProfile(config);
    p.id = i + 1;
    list.push(p);
  }
  return list;
}
