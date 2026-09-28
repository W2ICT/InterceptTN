/* KML / GPX export — built from the exact same geometry as the map (geometry.js),
 * so the exported file always matches what's shown on screen. */

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function kmlCoord(ll) { return `${ll.lon.toFixed(6)},${ll.lat.toFixed(6)},0`; }

function downloadText(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function buildKML(profile) {
  const geo = computeProfileGeometry(profile);
  const placemarks = [];
  const lines = [];

  placemarks.push(kmlPoint(`${profile.departure.icao} (T/O)`, "Departure / takeoff point", geo.origin));

  const drawnStations = new Set();
  function stationPlacemark(xy, navaid) {
    const key = (navaid.id || "") + navaid.type + navaid.freq;
    if (drawnStations.has(key)) return;
    drawnStations.add(key);
    const ll = geo.toLL(xy);
    placemarks.push(kmlPoint(navaid.id || navaid.type, `${navaid.type}${navaid.freq ? " " + navaid.freq : ""}${navaid.chan ? " / " + navaid.chan : ""}`, ll));
  }

  geo.legs.forEach((L, i) => {
    stationPlacemark(L.stationXY, L.leg.station);
    const fromLL = geo.toLL(L.fromXY), interceptLL = geo.toLL(L.interceptXY), fixLL = geo.toLL(L.fixXY);
    if (L.leg.kind === "fixToFix") {
      lines.push(kmlLine(`Leg ${i + 1} — direct ${pad3(L.leg.directCourse)}°/${L.leg.directDistNm}NM`, "trackStyle", [fromLL, fixLL]));
    } else {
      lines.push(kmlLine(`Leg ${i + 1} — intercept`, "interceptStyle", [fromLL, interceptLL]));
      lines.push(kmlLine(`Leg ${i + 1} — track ${pad3(L.leg.course)}°`, "trackStyle", [interceptLL, fixLL]));
    }
    placemarks.push(kmlPoint(`FIX ${i + 1}`, `R${pad3(L.leg.course)}°/${L.leg.dme}DME from ${L.leg.station.id || L.leg.station.type}`, fixLL));
  });

  if (geo.ending.type === "hold") {
    stationPlacemark(geo.ending.stationXY, profile.ending.navaid);
    const rt = geo.ending.racetrack;
    lines.push(kmlLine("Holding pattern", "trackStyle", rt.loop.map(geo.toLL)));
    if (rt.kink) lines.push(kmlLine("Entry maneuver", "interceptStyle", rt.kink.map(geo.toLL)));
    placemarks.push(kmlPoint("HOLD FIX", `Inbound course ${pad3(profile.ending.inboundCourse)}°, ${profile.ending.turn} turns`, geo.toLL(rt.F)));
  } else if (geo.ending.type === "approach") {
    stationPlacemark(geo.ending.stationXY, profile.ending.navaid);
    const fromLL = geo.toLL(geo.ending.fromXY), interceptLL = geo.toLL(geo.ending.interceptXY), stLL = geo.toLL(geo.ending.stationXY);
    lines.push(kmlLine("Final — intercept", "interceptStyle", [fromLL, interceptLL]));
    lines.push(kmlLine("Final approach course", "trackStyle", [interceptLL, stLL]));
  }

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${escapeXml("Sortie #" + profile.id + " - " + profile.departure.icao)}</name>
<Style id="trackStyle"><LineStyle><color>ff45250b</color><width>3</width></LineStyle></Style>
<Style id="interceptStyle"><LineStyle><color>ff1d27a5</color><width>2</width></LineStyle></Style>
${placemarks.join("\n")}
${lines.join("\n")}
</Document>
</kml>`;
  return kml;
}

function kmlPoint(name, desc, ll) {
  return `<Placemark><name>${escapeXml(name)}</name><description>${escapeXml(desc || "")}</description><Point><coordinates>${kmlCoord(ll)}</coordinates></Point></Placemark>`;
}
function kmlLine(name, styleId, llList) {
  return `<Placemark><name>${escapeXml(name)}</name><styleUrl>#${styleId}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${llList.map(kmlCoord).join(" ")}</coordinates></LineString></Placemark>`;
}

function buildGPX(profile) {
  const geo = computeProfileGeometry(profile);
  const wpts = [];
  const rtepts = [];

  wpts.push(gpxWpt(geo.origin, `${profile.departure.icao}`, "Departure / takeoff"));
  rtepts.push(gpxRtept(geo.origin, "DEP"));

  const drawnStations = new Set();
  geo.legs.forEach((L, i) => {
    const key = (L.leg.station.id || "") + L.leg.station.type + L.leg.station.freq;
    if (!drawnStations.has(key)) {
      drawnStations.add(key);
      const ll = geo.toLL(L.stationXY);
      wpts.push(gpxWpt(ll, L.leg.station.id || L.leg.station.type, `${L.leg.station.type}${L.leg.station.freq ? " " + L.leg.station.freq : ""}`));
    }
    const fixLL = geo.toLL(L.fixXY);
    wpts.push(gpxWpt(fixLL, `FIX${i + 1}`, `R${pad3(L.leg.course)}°/${L.leg.dme}DME`));
    rtepts.push(gpxRtept(fixLL, `FIX${i + 1}`));
  });

  if (geo.ending.type === "hold") {
    const fLL = geo.toLL(geo.ending.racetrack.F);
    wpts.push(gpxWpt(fLL, "HOLD", `IC ${pad3(profile.ending.inboundCourse)}° ${profile.ending.turn} turns`));
    rtepts.push(gpxRtept(fLL, "HOLD"));
  } else if (geo.ending.type === "approach") {
    const stLL = geo.toLL(geo.ending.stationXY);
    wpts.push(gpxWpt(stLL, "FINAL", `Approach course ${pad3(profile.ending.course)}°`));
    rtepts.push(gpxRtept(stLL, "FINAL"));
  }

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="INST Sortie Builder" xmlns="http://www.topografix.com/GPX/1/1">
${wpts.join("\n")}
<rte>
<name>${escapeXml("Sortie #" + profile.id + " - " + profile.departure.icao)}</name>
${rtepts.join("\n")}
</rte>
</gpx>`;
  return gpx;
}

function gpxWpt(ll, name, desc) {
  return `<wpt lat="${ll.lat.toFixed(6)}" lon="${ll.lon.toFixed(6)}"><name>${escapeXml(name)}</name><desc>${escapeXml(desc || "")}</desc></wpt>`;
}
function gpxRtept(ll, name) {
  return `<rtept lat="${ll.lat.toFixed(6)}" lon="${ll.lon.toFixed(6)}"><name>${escapeXml(name)}</name></rtept>`;
}

function exportProfileKML(profile) {
  downloadText(`sortie-${profile.id}-${profile.departure.icao}.kml`, "application/vnd.google-earth.kml+xml", buildKML(profile));
}
function exportProfileGPX(profile) {
  downloadText(`sortie-${profile.id}-${profile.departure.icao}.gpx`, "application/gpx+xml", buildGPX(profile));
}
