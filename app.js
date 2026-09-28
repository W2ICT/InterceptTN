/* UI wiring: GIS-style workspace — sortie tabs, live map, detail panel, KML/GPX/print export. */

const state = {
  difficulty: "easy",
  turnMode: "right",
  stationMode: "single",
  fixToFix: false,
  ending: "hold",
  trainingAreas: ["area1"],
  profiles: [],
  currentIndex: -1,
  currentMap: null,
  mapRequestId: 0,
};

function turnLabel(t) { return t === "right" ? "Right (standard)" : "Left (non-standard)"; }
function fmtLeg(leg) { return leg.kind === "dme" ? `${leg.value} NM legs` : `${leg.value} min legs`; }

function entryLabel(entry, standard) {
  if (standard === "both") return `${ENTRY_LABEL.faa[entry.key]} <span class="note">(ICAO: ${ENTRY_LABEL.icao[entry.key]})</span>`;
  return ENTRY_LABEL[standard][entry.key];
}

const AIRPORT_SHORT_NAME = {
  VTBL: "Lop Buri",
  VTPI: "Takhli",
  VTPP: "Phitsanulok",
  VTCC: "Chiang Mai",
  VTUN: "Korat",
  VTUU: "Ubon Ratchathani",
  VTBK: "Kamphaeng Saen",
  VTBD: "Don Mueang",
};

function initAirportSelects() {
  [document.getElementById("selDeparture"), document.getElementById("selSecond")].forEach((sel) => {
    AIRPORT_LIST.forEach((icao) => {
      const a = AIRPORTS[icao];
      const o = document.createElement("option");
      o.value = icao;
      o.textContent = `${icao} — ${AIRPORT_SHORT_NAME[icao] || a.name}`;
      o.title = `${icao} — ${a.name}`;
      sel.appendChild(o);
    });
  });
  document.getElementById("selDeparture").value = "VTBL";
  document.getElementById("selSecond").value = AIRPORT_LIST[1];
}

function wireChipGroup(id, onPick) {
  const group = document.getElementById(id);
  group.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      group.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      onPick(chip.dataset.val);
    });
  });
}

// Multi-select chip group: any number of chips can be active at once (at least one).
function wireMultiChipGroup(id, onChange) {
  const group = document.getElementById(id);
  group.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const active = group.querySelectorAll(".chip.active");
      if (active.length === 1 && chip.classList.contains("active")) return; // keep at least one selected
      chip.classList.toggle("active");
      onChange(Array.from(group.querySelectorAll(".chip.active")).map((c) => c.dataset.val));
    });
  });
}

function updateSecondAirportVisibility() {
  document.getElementById("fieldSecondAirport").style.display = state.stationMode === "dual" ? "" : "none";
  updateTrainingAreaVisibility();
}
function updateHoldOptionsVisibility() {
  document.getElementById("fieldTurnMode").style.display = state.ending === "hold" ? "" : "none";
}
function updateTrainingAreaVisibility() {
  const depIcao = document.getElementById("selDeparture").value;
  const secondIcao = document.getElementById("selSecond").value;
  const hasArea = !!(AIRPORTS[depIcao] && AIRPORTS[depIcao].trainingArea) ||
    (state.stationMode === "dual" && AIRPORTS[secondIcao] && AIRPORTS[secondIcao].trainingArea);
  document.getElementById("fieldTrainingArea").style.display = hasArea ? "" : "none";
}

function readConfig() {
  return {
    departureIcao: document.getElementById("selDeparture").value,
    stationMode: state.stationMode,
    fixToFix: state.fixToFix,
    secondIcao: document.getElementById("selSecond").value,
    legCount: Math.max(2, Math.min(10, parseInt(document.getElementById("numLegs").value, 10) || 4)),
    interceptAngle: parseInt(document.getElementById("selAngle").value, 10),
    difficulty: state.difficulty,
    ending: state.ending,
    turnMode: state.turnMode,
    trainingAreas: document.getElementById("fieldTrainingArea").style.display !== "none" ? state.trainingAreas : [],
    standard: document.getElementById("selStandard").value,
  };
}

/* ---------------- Text builders (English) ---------------- */

function legGivenText(L, i) {
  const st = L.station;
  const stLabel = `${st.id || st.type} ${st.type}${st.freq ? " " + st.freq : ""}`;
  if (L.kind === "fixToFix") {
    return `<b>Leg ${i + 1} (Fix-to-Fix):</b> FIX ${i + 1} is R${pad3(L.course)}°/${L.dme} DME from ${stLabel}. `
      + `From your current position, compute the direct course and distance to FIX ${i + 1} and fly it.`;
  }
  return `<b>Leg ${i + 1}:</b> from your current position (${L.bearingFromStation.toFixed(0)}°/${L.distanceNm} NM from ${stLabel}), `
    + `intercept course <b>${pad3(L.course)}°</b> and track it to <b>${L.dme} DME</b> from ${st.id || st.type} — this is FIX ${i + 1}.`;
}

function endingGivenText(profile) {
  const e = profile.ending;
  if (e.type === "hold") {
    return `<b>Ending — Hold:</b> at FIX ${profile.legs.length}, hold at ${e.navaid.id || e.navaid.type}, `
      + `inbound course <b>${pad3(e.inboundCourse)}°</b>, ${e.turn.toUpperCase()} TURNS, ${fmtLeg(e.leg)}, maintain ${profile.altitude} ft.`;
  }
  if (e.type === "approach") {
    return `<b>Ending — Approach:</b> from FIX ${profile.legs.length} (${e.bearingFromStation.toFixed(0)}°/${e.distanceNm} NM from ${e.navaid.id}), `
      + `intercept the final approach course <b>${pad3(e.course)}°</b> (RWY ${e.runway ? e.runway.ils : "-"}) into ${profile.departure.icao}.`;
  }
  return `<b>Ending:</b> sortie ends at FIX ${profile.legs.length} — report field in sight, rejoin the traffic pattern at ${profile.departure.icao}.`;
}

function buildScenarioHtml(profile) {
  const rwy = profile.departure.runways && profile.departure.runways[0];
  let html = `<p>Takeoff ${profile.departure.icao}${rwy ? " RWY " + rwy.id : ""}, climb and maintain ${profile.altitude} ft.</p>`;
  profile.legs.forEach((L, i) => (html += `<p>${legGivenText(L, i)}</p>`));
  html += `<p>${endingGivenText(profile)}</p>`;
  return html;
}

function buildSetupHtml(profile) {
  const rows = [
    ["Departure", `${profile.departure.icao} — ${profile.departure.name}${profile.departure.runways && profile.departure.runways[0] ? " (RWY " + profile.departure.runways[0].id + ")" : ""}`],
    ["Altitude", `${profile.altitude} ft`],
    ["Intercept angle used", `${profile.config.interceptAngle}°`],
  ];
  profile.legs.forEach((L, i) => {
    const st = L.station;
    rows.push([`Leg ${i + 1} station`, `${st.id || "-"} (${st.type}${st.freq ? ", " + st.freq : ""}${st.chan ? " / " + st.chan : ""}) — ${L.stationAirport.icao}`]);
    if (L.kind === "fixToFix") {
      rows.push([`Leg ${i + 1} type`, "Fix-to-Fix (direct)"]);
      rows.push([`Leg ${i + 1} FIX definition`, `R${pad3(L.course)}° / ${L.dme} NM from station`]);
    } else {
      rows.push([`Leg ${i + 1} course / DME`, `${pad3(L.course)}° / ${L.dme} NM`]);
      rows.push([`Leg ${i + 1} start position`, `${L.bearingFromStation.toFixed(0)}° / ${L.distanceNm} NM from station`]);
    }
  });
  const e = profile.ending;
  if (e.type === "hold") {
    rows.push(["Hold navaid", `${e.navaid.id || e.navaid.type}`]);
    rows.push(["Hold inbound / turn", `${pad3(e.inboundCourse)}° / ${turnLabel(e.turn)}`]);
    rows.push(["Hold leg", fmtLeg(e.leg)]);
  } else if (e.type === "approach") {
    rows.push(["Final approach course", `${pad3(e.course)}° (RWY ${e.runway ? e.runway.ils : "-"})`]);
  }
  return `<table>${rows.map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join("")}</table>`;
}

function buildAnswerHtml(profile) {
  let html = "";
  profile.legs.forEach((L, i) => {
    if (L.kind === "fixToFix") {
      html += `<div class="result">Leg ${i + 1}: fly direct <b>${pad3(L.directCourse)}°</b> for <b>${L.directDistNm} NM</b></div>`
        + `<p class="note">Direct course/distance computed from your position to FIX ${i + 1} (R${pad3(L.course)}°/${L.dme} DME from station).</p>`;
    } else {
      html += `<div class="result">Leg ${i + 1}: fly <b>${pad3(L.interceptHeading)}°</b> to intercept</div>`
        + `<p class="note">Aircraft is on the ${L.side} side of course ${pad3(L.course)}° → turn ${L.side === "right" ? "left" : "right"}, `
        + `${L.interceptAngle}° off course. Once established, track ${pad3(L.course)}° to ${L.dme} DME.</p>`;
    }
  });
  const e = profile.ending;
  if (e.type === "hold") {
    html += `<div class="result">Holding entry: ${entryLabel(e.entry, profile.config.standard)}</div>`
      + `<p class="note">Arrival heading ${pad3(e.arrivalHeading)}° is ${e.entry.delta}° (clockwise) from inbound course ${pad3(e.inboundCourse)}° `
      + `→ ${e.entry.key} sector for ${e.turn}-hand turns (margin ${e.marginToBoundary.toFixed(0)}°).</p>`;
  } else if (e.type === "approach") {
    html += `<div class="result">Final intercept: fly <b>${pad3(e.interceptHeading)}°</b></div>`
      + `<p class="note">Aircraft is on the ${e.side} side of final course ${pad3(e.course)}° → turn ${e.side === "right" ? "left" : "right"}, ${e.interceptAngle}° off course to join final.</p>`;
  }
  return html;
}

/* ---------------- Sortie tabs / map / detail panel ---------------- */

function renderSortieTabs() {
  const wrap = document.getElementById("sortieTabs");
  wrap.innerHTML = "";
  state.profiles.forEach((p, i) => {
    const tab = document.createElement("div");
    tab.className = "sortie-tab" + (i === state.currentIndex ? " active" : "");
    tab.textContent = `Sortie ${p.id} (${p.departure.icao})`;
    tab.addEventListener("click", () => selectProfile(i));
    wrap.appendChild(tab);
  });
}

async function selectProfile(idx) {
  state.currentIndex = idx;
  renderSortieTabs();

  const profile = state.profiles[idx];
  document.getElementById("mapEmptyHint").style.display = "none";
  document.getElementById("detailPanel").style.display = "";
  document.getElementById("detailToggle").style.display = "";
  document.getElementById("btnExportKML").disabled = false;
  document.getElementById("btnExportGPX").disabled = false;
  document.getElementById("btnPrint").disabled = false;

  document.getElementById("paneScenario").innerHTML = buildScenarioHtml(profile);
  document.getElementById("paneSetup").innerHTML = buildSetupHtml(profile);
  document.getElementById("paneAnswer").innerHTML = buildAnswerHtml(profile);

  if (state.currentMap) {
    state.currentMap.remove();
    state.currentMap = null;
  }
  const mapDiv = document.getElementById("mainMap");
  mapDiv.innerHTML = "";
  const requestId = ++state.mapRequestId;
  const map = await renderProfileMap(mapDiv, profile);
  if (requestId !== state.mapRequestId) { map.remove(); return; } // a newer selection started while we were loading
  state.currentMap = map;
  requestAnimationFrame(() => state.currentMap && state.currentMap.invalidateSize());
}

function wireDetailTabs() {
  document.querySelectorAll(".dtab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".dtab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".dpane").forEach((p) => (p.style.display = p.dataset.pane === tab.dataset.tab ? "" : "none"));
    });
  });
}

function main() {
  initAirportSelects();
  document.getElementById("selRounding").addEventListener("change", (e) => (state.difficulty = e.target.value));
  document.getElementById("selTurn").addEventListener("change", (e) => (state.turnMode = e.target.value));
  document.getElementById("chkTwoStations").addEventListener("change", (e) => {
    state.stationMode = e.target.checked ? "dual" : "single";
    updateSecondAirportVisibility();
  });
  document.getElementById("chkFixToFix").addEventListener("change", (e) => (state.fixToFix = e.target.checked));
  wireChipGroup("chipEnding", (v) => { state.ending = v; updateHoldOptionsVisibility(); });
  wireMultiChipGroup("chipTrainingArea", (vals) => (state.trainingAreas = vals));
  document.getElementById("selDeparture").addEventListener("change", updateTrainingAreaVisibility);
  document.getElementById("selSecond").addEventListener("change", updateTrainingAreaVisibility);
  updateSecondAirportVisibility();
  updateHoldOptionsVisibility();
  updateTrainingAreaVisibility();
  wireDetailTabs();

  document.getElementById("btnGenerate").addEventListener("click", () => {
    const cfg = readConfig();
    const count = Math.max(1, Math.min(10, parseInt(document.getElementById("numCount").value, 10) || 1));
    state.profiles = generateProfiles(cfg, count);
    selectProfile(0);
  });

  document.getElementById("btnExportKML").addEventListener("click", () => {
    if (state.currentIndex >= 0) exportProfileKML(state.profiles[state.currentIndex]);
  });
  document.getElementById("btnExportGPX").addEventListener("click", () => {
    if (state.currentIndex >= 0) exportProfileGPX(state.profiles[state.currentIndex]);
  });
  document.getElementById("btnPrint").addEventListener("click", () => {
    const includeAnswers = document.getElementById("chkShowAnswers").checked;
    document.getElementById("paneAnswer").classList.toggle("print-hide", !includeAnswers);
    window.print();
  });

  window.addEventListener("resize", () => { if (state.currentMap) state.currentMap.invalidateSize(); });

  document.getElementById("sidebarToggle").addEventListener("click", () => {
    document.getElementById("layoutRoot").classList.toggle("collapsed");
    setTimeout(() => state.currentMap && state.currentMap.invalidateSize(), 220);
  });

  document.querySelectorAll(".side-section-head").forEach((head) => {
    head.addEventListener("click", () => {
      const section = head.parentElement;
      const open = section.dataset.open !== "false";
      section.dataset.open = open ? "false" : "true";
    });
  });

  document.getElementById("detailToggle").addEventListener("click", () => {
    document.getElementById("gisWorkspace").classList.toggle("detail-collapsed");
    setTimeout(() => state.currentMap && state.currentMap.invalidateSize(), 220);
  });
}

document.addEventListener("DOMContentLoaded", main);
