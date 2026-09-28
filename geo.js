/* Simple flat-earth geo helpers — accurate enough at regional (<200NM) scale
 * for a schematic training diagram. Not for real navigation. */

const NM_PER_DEG_LAT = 60;

function destPoint(latlon, bearingDeg, distNm) {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distNm / NM_PER_DEG_LAT) * Math.cos(rad);
  const latRad = (latlon.lat * Math.PI) / 180;
  const dLon = (distNm / NM_PER_DEG_LAT) * Math.sin(rad) / Math.cos(latRad);
  return { lat: latlon.lat + dLat, lon: latlon.lon + dLon };
}

// Inverse of the local flat-earth NM projection used by geometry.js: turns a local
// {x: eastNm, y: northNm} point back into real lat/lon.
function fromNM(origin, pt) {
  const originLatRad = (origin.lat * Math.PI) / 180;
  return {
    lat: origin.lat + pt.y / NM_PER_DEG_LAT,
    lon: origin.lon + pt.x / (NM_PER_DEG_LAT * Math.cos(originLatRad)),
  };
}

// Ray-casting point-in-polygon test. `pt` is {lat,lon}, `poly` an array of {lat,lon}
// (need not be explicitly closed — first/last point repeating is fine either way).
function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon, yi = poly[i].lat;
    const xj = poly[j].lon, yj = poly[j].lat;
    const intersect = (yi > pt.lat) !== (yj > pt.lat) &&
      pt.lon < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Where a course flown from `fromPos` on heading `fromHeading` first crosses the
// radial/course `throughHeading` drawn through `throughPos`. Used to find the actual
// intercept point of a leg, e.g. to check it doesn't leave a training-area boundary.
// Local flat-earth plane anchored at fromPos (accurate enough at this scale).
function intersectCourses(fromPos, fromHeading, throughPos, throughHeading) {
  const originLatRad = (fromPos.lat * Math.PI) / 180;
  const bx = (throughPos.lon - fromPos.lon) * NM_PER_DEG_LAT * Math.cos(originLatRad);
  const by = (throughPos.lat - fromPos.lat) * NM_PER_DEG_LAT;
  const dr = (fromHeading * Math.PI) / 180, ar = (throughHeading * Math.PI) / 180;
  const dx = Math.sin(dr), dy = Math.cos(dr);
  const adx = Math.sin(ar), ady = Math.cos(ar);
  const denom = dx * -ady - dy * -adx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = (bx * -ady - by * -adx) / denom;
  if (t < 0) return null;
  const x = dx * t, y = dy * t;
  return { lat: fromPos.lat + y / NM_PER_DEG_LAT, lon: fromPos.lon + x / (NM_PER_DEG_LAT * Math.cos(originLatRad)) };
}

function bearingDistance(from, to) {
  const dLat = to.lat - from.lat;
  const avgLatRad = ((from.lat + to.lat) / 2 * Math.PI) / 180;
  const dLon = to.lon - from.lon;
  const yNm = dLat * NM_PER_DEG_LAT;
  const xNm = dLon * NM_PER_DEG_LAT * Math.cos(avgLatRad);
  const distNm = Math.sqrt(xNm * xNm + yNm * yNm);
  let bearing = (Math.atan2(xNm, yNm) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return { bearing, distNm };
}
