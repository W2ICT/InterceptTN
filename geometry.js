/* Pure geometry for a flight profile — NO rendering here.
 * Everything is computed in a local flat-earth NM plane (x = east, y = north,
 * real nautical miles) anchored at the departure airport, then callers convert
 * points to lat/lon (fromNM, for the map / KML / GPX) as needed.
 * This is the single source of truth shared by map.js and export.js so the
 * picture on the map always matches the coordinates in the exported files. */

function polarNM(origin, bearingDeg, dist) {
  const r = (bearingDeg * Math.PI) / 180;
  return { x: origin.x + dist * Math.sin(r), y: origin.y + dist * Math.cos(r) };
}
function arcPointsNM(center, radius, startBearing, sweepSigned, steps) {
  steps = steps || 24;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(polarNM(center, startBearing + sweepSigned * t, radius));
  }
  return pts;
}
function lineIntersect(p, dirDeg, a, aDirDeg) {
  const dr = (dirDeg * Math.PI) / 180, ar = (aDirDeg * Math.PI) / 180;
  const d = { x: Math.sin(dr), y: Math.cos(dr) };
  const ad = { x: Math.sin(ar), y: Math.cos(ar) };
  const denom = d.x * -ad.y - d.y * -ad.x;
  if (Math.abs(denom) < 1e-9) return null;
  const rhsX = a.x - p.x, rhsY = a.y - p.y;
  const t = (rhsX * -ad.y - rhsY * -ad.x) / denom;
  if (t < 0) return null;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

// Assumed holding airspeed for time-based legs and turn radius — this is a
// helicopter/training-aircraft tool, holding speed is briefed around 80-100 KIAS,
// so 90 KIAS (the midpoint) stands in since no real airspeed is modelled elsewhere.
const HOLD_IAS_KT = 90;

/** Racetrack (holding pattern) outline + entry-maneuver kink, in NM-plane,
 * anchored at `atNM` (the fix). The outbound leg is drawn to scale from the
 * actual briefed leg (DME leg: that many NM; time leg: minutes converted via
 * HOLD_IAS_KT). Turn radius comes from a standard-rate (3°/sec, 2 min/360°)
 * turn at HOLD_IAS_KT — r(NM) = V(kt) / 188.5 — instead of the departure's
 * outbound leg length, since radius only depends on speed and turn rate. */
function computeRacetrackXY(atNM, ending) {
  const IC = ending.inboundCourse;
  const O = norm360(IC + 180);
  const turn = ending.turn;
  const turnSide = turn === "right" ? 90 : -90;
  const sweep = turn === "right" ? 180 : -180;
  const L = ending.leg.kind === "dme" ? ending.leg.value : ending.leg.value * (HOLD_IAS_KT / 60);
  const r = HOLD_IAS_KT / 188.5;

  const F = atNM;
  const A = polarNM(F, O, L);
  const C1 = polarNM(F, IC + turnSide, r);
  const F2 = { x: 2 * C1.x - F.x, y: 2 * C1.y - F.y };
  const B = polarNM(F2, O, L);
  const C2 = polarNM(B, O + turnSide, r);
  const arc1 = arcPointsNM(C1, r, norm360(IC + turnSide + 180), sweep);
  const arc2 = arcPointsNM(C2, r, norm360(O + turnSide + 180), sweep);
  const loop = [A, ...arc1, B, ...arc2.slice(1)];

  let kink = null;
  if (ending.entry.key === "teardrop") {
    const tdHeading = norm360(O - (turn === "right" ? 30 : -30));
    const P1 = polarNM(F, tdHeading, L * 0.5);
    kink = [F, P1, F];
  } else if (ending.entry.key === "parallel") {
    const P1 = polarNM(F, O, L * 0.5);
    const Cp = polarNM(P1, O + turnSide, r * 0.8);
    const arcP = arcPointsNM(Cp, r * 0.8, norm360(O + turnSide + 180), turn === "right" ? 210 : -210, 20);
    kink = [F, P1, ...arcP, F];
  }
  return { F, A, B, loop, kink };
}

/**
 * Compute every point of a flight profile in the local NM plane.
 * Returns { origin, toNM, toLL, depXY, legs:[{leg, stationXY, fixXY, fromXY, interceptXY}], ending }
 */
function computeProfileGeometry(profile) {
  const origin = profile.departure.arp;
  const originLatRad = (origin.lat * Math.PI) / 180;
  const toNM = (latlon) => ({
    x: (latlon.lon - origin.lon) * 60 * Math.cos(originLatRad),
    y: (latlon.lat - origin.lat) * 60,
  });
  const toLL = (pt) => fromNM(origin, pt);

  const depXY = { x: 0, y: 0 };
  const legs = profile.legs.map((leg) => ({ leg, stationXY: toNM(leg.station.pos), fixXY: toNM(leg.fixPos) }));

  let prevXY = depXY;
  legs.forEach((L) => {
    L.fromXY = prevXY;
    // Fix-to-fix legs have no intercept maneuver — the whole leg is one direct
    // segment from the previous fix, so collapse the intercept point onto it.
    L.interceptXY = L.leg.kind === "fixToFix"
      ? L.fromXY
      : (lineIntersect(prevXY, L.leg.interceptHeading, L.stationXY, L.leg.course) || L.fixXY);
    prevXY = L.fixXY;
  });

  const ending = { type: profile.ending.type, fromXY: prevXY };
  if (profile.ending.type === "hold") {
    ending.stationXY = toNM(profile.ending.navaid.pos);
    ending.racetrack = computeRacetrackXY(prevXY, profile.ending);
  } else if (profile.ending.type === "approach") {
    ending.stationXY = toNM(profile.ending.navaid.pos);
    ending.interceptXY = lineIntersect(prevXY, profile.ending.interceptHeading, ending.stationXY, profile.ending.course) || prevXY;
  }

  return { origin, toNM, toLL, depXY, legs, ending };
}

function pad3(n) {
  return Math.round(n).toString().padStart(3, "0");
}
