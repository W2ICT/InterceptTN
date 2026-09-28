/* Real GIS map rendering of a flight profile, using Leaflet + OpenStreetMap tiles.
 * Pulls all coordinates from geometry.js's computeProfileGeometry() so the map
 * always matches the KML/GPX export exactly. */

function llArr(ll) { return [ll.lat, ll.lon]; }

async function renderProfileMap(container, profile) {
  const geo = computeProfileGeometry(profile);
  const map = L.map(container, { scrollWheelZoom: true, zoomControl: false });
  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Free basemap only — no API key/billing account needed, unlike Google's tile API.
  // Esri's World_Imagery only has z19 native resolution over developed/urban areas;
  // rural regions (like most of these training areas) serve a literal "Map data not
  // yet available" placeholder tile past their real coverage. maxNativeZoom caps real
  // tile requests at a level Esri reliably has everywhere, and Leaflet upscales the
  // last good tile for zoom beyond that instead of ever fetching the placeholder.
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    maxNativeZoom: 16,
    attribution: "Tiles &copy; Esri",
  }).addTo(map);
  addLegend(map);

  const bounds = [];
  const addBounds = (ll) => bounds.push(llArr(ll));

  // Symbology (kept consistent with the on-map legend, see addLegend()):
  //   amber dashed  = maneuvering to intercept a course (not yet established)
  //   navy solid    = established, tracking a course / holding pattern
  //   numbered pin  = a fix/waypoint, in the order the sortie visits it
  const INTERCEPT_STYLE = { color: "#e0a02c", weight: 3, dashArray: "7 6" };
  const TRACK_STYLE = { color: "#1d4f91", weight: 4 };

  const navIcon = L.divIcon({ className: "navaid-marker", html: '<div class="pin pin-nav" title="Navaid"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
  const depIcon = L.divIcon({ className: "dep-marker", html: '<div class="pin pin-dep">&#9992;</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
  const fixIcon = (n) => L.divIcon({ className: "fix-marker", html: `<div class="pin pin-fix">${n}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
  const holdIcon = L.divIcon({ className: "fix-marker", html: '<div class="pin pin-hold">H</div>', iconSize: [22, 22], iconAnchor: [11, 11] });

  // Departure
  const depLL = geo.origin;
  addBounds(depLL);
  L.marker(llArr(depLL), { icon: depIcon }).addTo(map).bindTooltip(`Takeoff — ${profile.departure.icao}`, { direction: "top" });

  // Stations (dedup)
  const drawnStations = new Set();
  function ensureStation(xy, navaid) {
    const key = (navaid.id || "") + navaid.type + navaid.freq;
    if (drawnStations.has(key)) return;
    drawnStations.add(key);
    const ll = geo.toLL(xy);
    addBounds(ll);
    L.marker(llArr(ll), { icon: navIcon }).addTo(map).bindTooltip(
      `${navaid.id || navaid.type} — ${navaid.type}${navaid.freq ? " " + navaid.freq : ""}${navaid.chan ? " / " + navaid.chan : ""}`
    );
  }

  // Legs
  geo.legs.forEach((L_, i) => {
    ensureStation(L_.stationXY, L_.leg.station);
    const fromLL = geo.toLL(L_.fromXY);
    const interceptLL = geo.toLL(L_.interceptXY);
    const fixLL = geo.toLL(L_.fixXY);
    addBounds(fixLL);
    if (L_.leg.kind === "fixToFix") {
      L.polyline([llArr(fromLL), llArr(fixLL)], TRACK_STYLE).addTo(map)
        .bindTooltip(`Direct ${pad3(L_.leg.directCourse)}° / ${L_.leg.directDistNm} NM`, { sticky: true });
    } else {
      L.polyline([llArr(fromLL), llArr(interceptLL)], INTERCEPT_STYLE).addTo(map);
      L.polyline([llArr(interceptLL), llArr(fixLL)], TRACK_STYLE).addTo(map)
        .bindTooltip(`Track ${pad3(L_.leg.course)}° to ${L_.leg.dme} DME`, { sticky: true });
    }
    L.marker(llArr(fixLL), { icon: fixIcon(i + 1) }).addTo(map).bindTooltip(
      `FIX ${i + 1} — R${pad3(L_.leg.course)}°/${L_.leg.dme} DME from ${L_.leg.station.id || L_.leg.station.type}`
    );
  });

  // Ending
  if (geo.ending.type === "hold") {
    ensureStation(geo.ending.stationXY, profile.ending.navaid);
    const rt = geo.ending.racetrack;
    const loopPts = rt.loop.map((p) => geo.toLL(p));
    loopPts.forEach(addBounds);
    L.polyline(loopPts.map(llArr), TRACK_STYLE).addTo(map);
    if (rt.kink) {
      const kinkLL = rt.kink.map((p) => llArr(geo.toLL(p)));
      L.polyline(kinkLL, INTERCEPT_STYLE).addTo(map);
    }
    const fLL = geo.toLL(rt.F);
    L.marker(llArr(fLL), { icon: holdIcon }).addTo(map).bindTooltip(`Hold — ${profile.ending.navaid.id || profile.ending.navaid.type}, inbound ${pad3(profile.ending.inboundCourse)}°, ${profile.ending.turn} turns`);
  } else if (geo.ending.type === "approach") {
    ensureStation(geo.ending.stationXY, profile.ending.navaid);
    const fromLL = geo.toLL(geo.ending.fromXY);
    const interceptLL = geo.toLL(geo.ending.interceptXY);
    const stationLL = geo.toLL(geo.ending.stationXY);
    addBounds(stationLL);
    L.polyline([llArr(fromLL), llArr(interceptLL)], INTERCEPT_STYLE).addTo(map);
    L.polyline([llArr(interceptLL), llArr(stationLL)], TRACK_STYLE).addTo(map)
      .bindTooltip(`Final approach course ${pad3(profile.ending.course)}°`, { sticky: true });
  }

  // Training-area overlay (VTBL etc.) — drawn last, under everything visually but
  // added after so it can still be toggled; low-key styling keeps it out of the way.
  drawTrainingAreaOverlay(map, profile);

  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
  return map;
}

/* Draw the briefed local training-area boundary (if the departure or any station
 * airport has one) as a low-key reference overlay: one clean outer boundary line,
 * plus a borderless fill wash over just the sub-area(s) this sortie actually used
 * (their edges share the CTR vertex, so stroking every one of them at once drew a
 * tangle of overlapping lines through the middle — fill-only avoids that). */
function drawTrainingAreaOverlay(map, profile) {
  const airports = new Set([profile.departure, ...profile.legs.map((l) => l.stationAirport)]);
  const usedKeys = new Set(profile.config.trainingAreas || []);
  airports.forEach((airport) => {
    const polys = computeTrainingAreaPolygons(airport);
    if (!polys) return;
    L.polyline(polys.boundary.map(llArr), { color: "#8b96a8", weight: 2, dashArray: "4 5", opacity: .8 }).addTo(map);
    Object.keys(polys.areas).forEach((key) => {
      if (usedKeys.size && !usedKeys.has(key)) return;
      const ring = polys.areas[key].map(llArr);
      const poly = L.polygon(ring, { stroke: false, fillColor: "#3ecfab", fillOpacity: .08 }).addTo(map);
      poly.bindTooltip(key.replace("area", "Area "), { sticky: true });
    });
  });
}

/* Small fixed legend explaining the line/marker symbology used on the map. */
function addLegend(map) {
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML = `
      <div class="lg-row"><span class="lg-swatch lg-dep"></span>Departure</div>
      <div class="lg-row"><span class="lg-swatch lg-nav"></span>Navaid station</div>
      <div class="lg-row"><span class="lg-swatch lg-fix">1</span>Fix (in order flown)</div>
      <div class="lg-row"><span class="lg-line lg-intercept"></span>Intercepting course</div>
      <div class="lg-row"><span class="lg-line lg-track"></span>Established / holding</div>
      <div class="lg-row"><span class="lg-line lg-area"></span>Training area</div>`;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legend.addTo(map);
}

