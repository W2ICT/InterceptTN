/*
 * Navaid database — real published data extracted from the Thailand AIP
 * (CAAT eAIP, aip.caat.or.th, AIRAC cycle 2024-09-05 for the military fields,
 * various cycles for the civil fields as indexed). AD 2.19 "RADIO NAVIGATION
 * AND LANDING AIDS" tables, cross-checked against AD 2.2 ARP coordinates.
 *
 * Coordinates are stored as the raw AIP string (DMS) plus a parsed decimal
 * value for schematic plotting. This is a TRAINING tool — diagrams are
 * schematic, not to scale for real navigation. Always verify against the
 * current AIP / NOTAMs before real-world use.
 */

// Parse a coordinate token like "184617N", "135451.74N", "1846.2N" (lat)
// or "0985746E", "1003620.49E", "9858.2E" (lon) into decimal degrees.
function parseCoord(token) {
  const hemi = token.slice(-1);
  const digits = token.slice(0, -1);
  const sign = (hemi === "S" || hemi === "W") ? -1 : 1;
  const isLat = (hemi === "N" || hemi === "S");
  const intLen = isLat ? 2 : 3; // degrees digits before minutes
  const degStr = digits.slice(0, intLen);
  const rest = digits.slice(intLen);
  let deg = parseFloat(degStr || "0");
  let minutes = 0;
  if (rest.length <= 2) {
    // DD MM (no seconds) e.g. leftover "46" -> minutes only, rare
    minutes = parseFloat(rest || "0");
  } else if (rest.indexOf(".") !== -1 && rest.indexOf(".") <= 2) {
    // DD MM.m form e.g. "46.2" -> minutes.minutes
    minutes = parseFloat(rest);
  } else {
    // DD MM SS(.ss) form e.g. "1738" or "1738.35"
    const mm = rest.slice(0, 2);
    const ss = rest.slice(2);
    minutes = parseFloat(mm || "0") + parseFloat(ss || "0") / 60;
  }
  return sign * (deg + minutes / 60);
}

function coord(latToken, lonToken) {
  return {
    raw: `${latToken} ${lonToken}`,
    lat: parseCoord(latToken),
    lon: parseCoord(lonToken),
  };
}

// AIRPORTS = { ICAO: { name, arp, navaids: [...] , reportingPoints: [...] } }
const AIRPORTS = {
  VTBD: {
    icao: "VTBD",
    name: "Bangkok / Don Mueang International Airport",
    nameTh: "ดอนเมือง",
    arp: coord("135451.74N", "1003620.49E"),
    runways: [{ id: "03L/21R", hdgs: [29, 209], ils: "21R" }],
    navaids: [
      { type: "VOR/DME", id: "BKK", freq: "117.7 MHz", chan: "CH124X", pos: coord("135336.8N", "1003546.3E"), remarks: "DVOR/DME — restrictions apply beyond 40NM on several radials (mountainous/obstacle shielding), see AIP." },
      { type: "ILS/LOC", id: "IBKK", freq: "109.3 MHz", chan: null, pos: coord("135340.6N", "1003540.6E"), remarks: "ILS CAT II, RWY 21R" },
      { type: "ILS/LOC", id: "IDMG", freq: "110.3 MHz", chan: null, pos: coord("135351.83N", "1003601.85E"), remarks: "ILS CAT I, RWY 21L" },
      { type: "ILS/LOC", id: "IBKD", freq: "109.7 MHz", chan: "CH34X", pos: coord("135543.71N", "1003649.60E"), remarks: "ILS CAT I, RWY 03L" },
    ],
    reportingPoints: [],
  },
  VTCC: {
    icao: "VTCC",
    name: "Chiang Mai International Airport",
    nameTh: "เชียงใหม่",
    arp: coord("184617N", "0985746E"),
    runways: [{ id: "18/36", hdgs: [180, 360], ils: "36" }],
    navaids: [
      { type: "VOR/DME", id: "CMA", freq: "116.9 MHz", chan: "CH116X", pos: coord("184558.06N", "0985740.38E"), remarks: "DVOR/DME — restricted signal beyond 20-40NM various radials/altitudes, mountainous terrain." },
      { type: "ILS/LOC", id: "ICMA", freq: "109.9 MHz", chan: "CH36X", pos: coord("184707.42N", "0985746.56E"), remarks: "ILS CAT I, RWY 36" },
      { type: "TACAN", id: "CHM", freq: null, chan: "CH109", pos: coord("184602N", "0985812E"), remarks: "PN to ATC" },
    ],
    reportingPoints: [
      { name: "MAE RIM", radial: 354, dme: 9.0 },
      { name: "MAE JO", radial: 21, dme: 8.1 },
      { name: "PA LAN", radial: 39, dme: 8.3 },
      { name: "SAN NA MENG", radial: 55, dme: 6.4 },
      { name: "SAN KLANG", radial: 88, dme: 5.2 },
      { name: "BO SANG", radial: 92, dme: 6.8 },
      { name: "TOT", radial: 131, dme: 6.7 },
      { name: "DOI TI", radial: 159, dme: 13.9 },
      { name: "TON TONG", radial: 185, dme: 13.6 },
      { name: "THA WANG PRAO", radial: 203, dme: 15.1 },
      { name: "NAM PRAE", radial: 228, dme: 6.8 },
      { name: "ROYAL FLORA", radial: 242, dme: 2.3 },
    ],
  },
  VTUU: {
    icao: "VTUU",
    name: "Ubon Ratchathani Airport",
    nameTh: "อุบลราชธานี",
    arp: coord("151504.59N", "1045212.82E"),
    runways: [{ id: "05/23", hdgs: [50, 230], ils: "23" }],
    navaids: [
      { type: "NDB", id: "UB", freq: "373 kHz", chan: null, pos: coord("151425.83N", "1045148.77E"), remarks: null },
      { type: "VOR/DME", id: "UBL", freq: "112.7 MHz", chan: "CH74", pos: coord("151442.71N", "1045157.30E"), remarks: "DVOR/DME" },
      { type: "ILS/LOC", id: "IUBL", freq: "110.1 MHz", chan: "CH38", pos: coord("151423.85N", "1045120.10E"), remarks: "ILS CAT I, RWY 23" },
      { type: "TACAN", id: "UBL", freq: "114.6 MHz", chan: "CH93", pos: coord("151544.79N", "1045300.00E"), remarks: null },
    ],
    reportingPoints: [],
  },
  VTPP: {
    icao: "VTPP",
    name: "Phitsanulok Airport",
    nameTh: "พิษณุโลก",
    arp: coord("164658.56N", "1001644.85E"),
    runways: [{ id: "14/32", hdgs: [140, 320], ils: "32" }],
    navaids: [
      { type: "NDB", id: "PLT", freq: "263 kHz", chan: null, pos: coord("164745.44N", "1001632.62E"), remarks: null },
      { type: "VOR/DME", id: "PSL", freq: "114.1 MHz", chan: "CH88X", pos: coord("164613.34N", "1001728.70E"), remarks: "DVOR/DME — restriction, mountainous terrain." },
      { type: "ILS/LOC", id: "IPL", freq: "110.1 MHz", chan: null, pos: coord("164746.19N", "1001608.82E"), remarks: "ILS CAT I, RWY 32" },
      { type: "TACAN", id: null, freq: null, chan: "CH99", pos: coord("164736N", "1001642E"), remarks: "Military facility, on request" },
    ],
    reportingPoints: [],
  },
  VTBL: {
    icao: "VTBL",
    name: "Lop Buri / Khok Kathiam (Wing 2, RTAF)",
    nameTh: "ลพบุรี / โคกกระเทียม",
    arp: coord("145228.7N", "1003948.2E"),
    runways: [
      { id: "16/34", hdgs: [160, 340], ils: null },
      { id: "05/23", hdgs: [50, 230], ils: "05" },
    ],
    // Local flying training area (พท.การฝึก บน.2), radial/DME from the LB NDB
    // (treated as CTR). Cross-checked against the unit's own boundary KML
    // (ผนวก ก / รปป.บน.๒-๐๗-๐๐๔ — VT D2 GND-6,000ft / VT P4 GND-FL240 / TRA 2 GND-5,000ft).
    // VTP4 (small notch NE of A8/A9/A7) is a neighbouring unit's restricted zone
    // (CHNDY1-4 rectangle) and is intentionally left out of our own training area.
    trainingArea: {
      refNavaidId: "LB",
      points: {
        A1: { radial: 230, dme: 24.0 },
        A2: { radial: 243, dme: 33.5 },
        A3: { radial: 271, dme: 29.0 },
        A4: { radial: 165, dme: 16.3 },
        A5: { radial: 123, dme: 29.6 },
        A6: { radial: 95, dme: 25.1 },
        A7: { radial: 85, dme: 25.1 },
        A8: { radial: 77, dme: 10.4 },
        A9: { radial: 36, dme: 17.5 },
        A10: { radial: 321, dme: 18.9 },
        A11: { radial: 298, dme: 32.0 },
      },
      boundary: ["A11", "A10", "A9", "A8", "A7", "A6", "A5", "A4", "A1", "A2", "A3", "A11"],
      areas: {
        area1: ["A3", "A2", "A1", "CTR"],
        area2: ["CTR", "A1", "A4"],
        area3: ["CTR", "A4", "A5", "A6"],
        area4: ["A3", "A11", "A10", "A9", "A8", "A7", "A6"],
      },
    },
    navaids: [
      { type: "NDB", id: "LB", freq: "280 kHz", chan: null, pos: coord("145236.27N", "1003926.45E"), remarks: null },
      { type: "TACAN", id: "LOB", freq: null, chan: "CH115X", pos: coord("145234.33N", "1003935.49E"), remarks: "EXC SAT-SUN and public holiday, or on request" },
      { type: "ILS/LOC", id: "ILOB", freq: "108.3 MHz", chan: null, pos: coord("145246.56N", "1004007.78E"), remarks: "ILS CAT I, RWY 05" },
    ],
    reportingPoints: [
      { name: "BRAVO", radial: 324, dme: 12.12, refNavaid: "LB NDB" },
      { name: "KILO", bearing: 290, dme: 4.3, refNavaid: "LB NDB" },
      { name: "PAPA", bearing: 142, dme: 11.8, refNavaid: "LB NDB" },
      { name: "LIMA", bearing: 200, dme: 4.8, refNavaid: "LB NDB" },
    ],
  },
  VTPI: {
    icao: "VTPI",
    name: "Nakhon Sawan / Takhli (Wing 4, RTAF)",
    nameTh: "นครสวรรค์ / ตาคลี",
    arp: coord("151638.35N", "1001745.10E"),
    runways: [{ id: "18/36", hdgs: [181, 1], ils: "18" }],
    navaids: [
      { type: "NDB", id: "TL", freq: "350 kHz", chan: null, pos: coord("151633.45N", "1001751.11E"), remarks: "Military use / civil aircraft used in military services only" },
      { type: "TACAN", id: "TKL", freq: null, chan: "CH95X", pos: coord("151629.13N", "1001756.62E"), remarks: null },
      { type: "ILS/LOC", id: "ITKL", freq: "108.7 MHz", chan: null, pos: coord("151539.28N", "1001743.75E"), remarks: "ILS CAT I, RWY 18" },
    ],
    reportingPoints: [],
  },
  VTUN: {
    icao: "VTUN",
    name: "Nakhon Ratchasima / Korat (Wing 1, RTAF)",
    nameTh: "นครราชสีมา / โคราช",
    arp: coord("145604N", "1020444E"),
    runways: [{ id: "06/24", hdgs: [63, 243], ils: "24" }],
    navaids: [
      { type: "TACAN", id: "KRT", freq: null, chan: "CH125X", pos: coord("145606.0N", "1020421.8E"), remarks: null },
      { type: "VOR/DME", id: "KRT", freq: "113.7 MHz", chan: "CH84X", pos: coord("145502.35N", "1020823.32E"), remarks: "DVOR/DME — restriction, mountainous terrain." },
      { type: "ILS/LOC", id: "IKRT", freq: "109.9 MHz", chan: "CH36X", pos: coord("145535.31N", "1020346.04E"), remarks: "ILS CAT I, RWY 24" },
    ],
    reportingPoints: [
      { name: "NOVEMBER", radial: 355, dme: 8, refNavaid: "KRT TACAN" },
      { name: "SIERRA", radial: 180, dme: 10, refNavaid: "KRT TACAN" },
    ],
  },
  VTBK: {
    icao: "VTBK",
    name: "Nakhon Pathom / Kamphaeng Saen (Flying Training School, RTAF)",
    nameTh: "นครปฐม / กำแพงแสน",
    arp: coord("140607.23N", "0995502.13E"),
    runways: [{ id: "03/21", hdgs: [30, 210], ils: "21" }],
    navaids: [
      { type: "VOR/DME", id: "KPS", freq: "114.5 MHz", chan: "CH92X", pos: coord("140956.71N", "0995715.52E"), remarks: "Operation MON-FRI except public holiday" },
      { type: "NDB", id: "KPS", freq: "251 kHz", chan: null, pos: coord("141013.24N", "0995724.71E"), remarks: null },
      { type: "ILS/LOC", id: "IKPS", freq: "109.9 MHz", chan: "CH36X", pos: coord("140519.82N", "0995434.59E"), remarks: "ILS CAT I, RWY 21" },
      { type: "TACAN", id: "KPS", freq: null, chan: "CH98X", pos: coord("140600.82N", "0995443.77E"), remarks: null },
    ],
    reportingPoints: [],
  },
};

// Explicit display/default order (not object insertion order): VTBL is the
// default departure field, matching this program's primary training base.
const AIRPORT_LIST = ["VTBL", "VTPI", "VTPP", "VTCC", "VTUN", "VTUU", "VTBK", "VTBD"];
