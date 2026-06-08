// ======================================================
// CONFIGURATION
// ======================================================

const API_URL = "http://localhost:3000/api/report";
let map, propertyMarker, layerGroups = {}, legendControl, layerControl;

const LAYER_STYLES = {
    superfundSites:       { label: "Superfund Sites",       color: "#6a1b9a", fillColor: "#ab47bc", radius: 8,  fillOpacity: 0.85, weight: 1.5, type: "point" },
    hazardousWaste:       { label: "Hazardous Waste",       color: "#ef6c00", fillColor: "#ffa726", radius: 8,  fillOpacity: 0.85, weight: 1.5, type: "point" },
    brownfields:          { label: "Brownfields",           color: "#6d4c41", fillColor: "#8d6e63", radius: 7,  fillOpacity: 0.8,  weight: 1,   type: "point" },
    waterPollution:       { label: "Water Pollution",       color: "#0277bd", fillColor: "#29b6f6", radius: 7,  fillOpacity: 0.85, weight: 1.5, type: "point" },
    wildfires:            { label: "Wildfires",             color: "#b71c1c", fillColor: "#ef5350", radius: 8,  fillOpacity: 0.9,  weight: 1.5, type: "point" },
    thermalHotspots:      { label: "Thermal Hotspots",      color: "#d84315", fillColor: "#ff7043", radius: 9,  fillOpacity: 0.95, weight: 1.5, type: "point" },
    alternateFuelStations:{ label: "Fuel Stations",         color: "#3949ab", fillColor: "#5c6bc0", radius: 6,  fillOpacity: 0.85, weight: 1,   type: "point" },
    airQuality:           { label: "Air Quality (PM2.5)",   color: "#546e7a", fillColor: "#90a4ae", radius: 7,  fillOpacity: 0.8,  weight: 1.5, type: "point" },
    floodZones:           { label: "Flood Zones",           color: "#00838f", fillColor: "#4dd0e1", fillOpacity: 0.35, weight: 1.5, type: "polygon" },
    parks:                { label: "Parks",                 color: "#1b5e20", fillColor: "#66bb6a", fillOpacity: 0.7,  weight: 1,   type: "polygon" },
    climateResilience:    { label: "Climate Resilience",    color: "#00796b", fillColor: "#4db6ac", fillOpacity: 0.3,  weight: 1.5, type: "polygon" },
    wetlands:             { label: "Wetlands",              color: "#1565c0", fillColor: "#4c81cd", fillOpacity: 0.45, weight: 1,   type: "polygon" },
    trails:               { label: "Trails",                color: "#8e24aa", weight: 3, opacity: 0.9, dashArray: "6 4", type: "line" },
    riversStreams:         { label: "Rivers & Streams",      color: "#1e88e5", weight: 3, opacity: 0.85, type: "line" },
    contours:             { label: "USGS Contour Lines",    color: "#8b6432", weight: 1.5, opacity: 0.7, dashArray: "4 3", type: "line" },
    countyHealth:         { label: "Population Information" },
    congressionalDistricts:{ label: "Congressional District" },
    nrhpPoints:   { label: "NRHP Historic Sites (Points)",   color: "#7b1a1a", fillColor: "#c0392b", radius: 7, fillOpacity: 0.85, weight: 1.5, type: "point" },
    nrhpPolygons: { label: "NRHP Historic Districts (Polygons)", color: "#7b1a1a", fillColor: "#e8b4a0", fillOpacity: 0.45, weight: 1.5, type: "polygon" },
};

const DEFAULT_VISIBLE_LAYERS = [
    "parks", "trails", "wetlands", "riversStreams", "floodZones",
    "wildfires", "thermalHotspots", "superfundSites", "hazardousWaste",
    "brownfields", "waterPollution", "alternateFuelStations", "airQuality", "contours"
];

// ======================================================
// INITIALIZATION
// ======================================================

document.getElementById("generateBtn").addEventListener("click", generateReport);
document.getElementById("exportPdfBtn")?.addEventListener("click", exportToPDF);
initSplash();



// ======================================================
// RISK INDICATOR CARD
// ======================================================

/**
 * Derives six risk indicator objects from the already-fetched report data.
 * Each indicator: { label, value, severity: "high"|"moderate"|"low"|"unknown" }
 *
 * Indicators:
 *   1. Flood Exposure        — FEMA NFHL flood zone classification
 *   2. Contamination Proximity — EPA Superfund, RCRA, Brownfields, NPDES
 *   3. Air Quality (PM2.5)   — EPA AirNow monitor network
 *   4. Wildfire Risk         — Active incidents + USFS tract risk score; drought as context
 *   5. Social Vulnerability  — ArcGIS Living Atlas population vulnerability index (percentile)
 *   6. Community Health      — County Health Rankings life expectancy + uninsured rate
 */
function computeRiskIndicators(data) {
    const indicators = [];

    // ── 1. Flood Exposure (FEMA NFHL) ──────────────────────────────────────
    const floods = data.floodZones || [];
    if (floods.length) {
        const sfha      = floods.filter(f => f.sfha === "T");
        const floodways = floods.filter(f => f.isFloodway);
        const zones     = [...new Set(floods.map(f => f.zone))].join(", ");
        indicators.push({
            label:    "Flood Exposure",
            severity: floodways.length ? "high" : sfha.length ? "moderate" : "low",
            value:    floodways.length
                ? `Floodway present — Zone(s): ${zones}`
                : sfha.length
                    ? `Within SFHA — Zone(s): ${zones}`
                    : `Low-risk zone(s): ${zones}`
        });
    } else {
        indicators.push({
            label:    "Flood Exposure",
            severity: "unknown",
            value:    "No FEMA flood zone data returned"
        });
    }

    // ── 2. Contamination Proximity (EPA FRS) ───────────────────────────────
    const superfund = (data.superfundSites || []).length;
    const hazWaste  = (data.hazardousWaste || []).length;
    const brown     = (data.brownfields    || []).length;
    const water     = (data.waterPollution || []).length;

    if (superfund || hazWaste || brown || water) {
        const parts = [
            superfund && `${superfund} Superfund`,
            hazWaste  && `${hazWaste} hazardous waste`,
            brown     && `${brown} brownfield`,
            water     && `${water} NPDES discharge`
        ].filter(Boolean);

        // Superfund or active hazardous waste = high; brownfields or multiple
        // discharge permits = moderate (brownfields are lower severity than NPL sites)
        const severity = (superfund || hazWaste)
            ? "high"
            : (brown >= 1 || water >= 3)
                ? "moderate"
                : "low";

        indicators.push({
            label:    "Contamination Proximity",
            severity,
            value:    parts.join(", ") + (parts.length === 1 ? " site nearby" : " sites nearby")
        });
    } else {
        indicators.push({
            label:    "Contamination Proximity",
            severity: "low",
            value:    "No EPA-listed sites within search radius"
        });
    }

    // ── 3. Air Quality (PM2.5) ─────────────────────────────────────────────
    const airMonitors = data.airQuality || [];
    if (airMonitors.length) {
        const avg = airMonitors.reduce((s, m) => s + m.pm25, 0) / airMonitors.length;
        // EPA PM2.5 breakpoints: Good <12, Moderate 12–35.4, USG 35.5–55.4, Unhealthy >55.4
        const severity = avg >= 35.5 ? "high" : avg >= 12 ? "moderate" : "low";
        const aqiLabel = avg >= 55.4
            ? "Unhealthy"
            : avg >= 35.5
                ? "Unhealthy for Sensitive Groups"
                : avg >= 12
                    ? "Moderate"
                    : "Good";
        indicators.push({
            label:    "Air Quality (PM2.5)",
            severity,
            value:    `${avg.toFixed(1)} µg/m³ avg — ${aqiLabel} (${airMonitors.length} monitor${airMonitors.length > 1 ? "s" : ""})`
        });
    } else {
        indicators.push({
            label:    "Air Quality (PM2.5)",
            severity: "unknown",
            value:    "No monitor data within 25 mi"
        });
    }

    // ── 4. Wildfire Risk ───────────────────────────────────────────────────
    // Primary signal: active incidents within 50 mi + USFS tract risk score.
    // Drought is shown as supporting context in the value string since it
    // compounds fire risk but is not a standalone property hazard for most areas.
    const fires    = data.wildfires || [];
    const droughts = data.drought   || [];
    const worst    = droughts.length
        ? droughts.reduce((a, b) => a.intensity >= b.intensity ? a : b)
        : null;
    const cr       = data.climateResilience?.[0];
    const wfScore  = cr?.wildfireRiskToHome ?? 0;

    // Drought context string appended to value when present
    const droughtStr = worst?.intensity >= 1
        ? worst.label                   // e.g. "Moderate Drought (D2)"
        : "No active drought";

    if (fires.length) {
        const severity = fires.length >= 3 || worst?.intensity >= 3 ? "high" : "moderate";
        indicators.push({
            label:    "Wildfire Risk",
            severity,
            value:    `${fires.length} active wildfire${fires.length > 1 ? "s" : ""} within 50 mi · ${droughtStr}`
        });
    } else if (wfScore > 0) {
        // No active incidents — use USFS tract-level risk score as the signal
        const severity = wfScore >= 0.6 ? "high" : wfScore >= 0.3 ? "moderate" : "low";
        indicators.push({
            label:    "Wildfire Risk",
            severity,
            value:    `Risk score ${wfScore.toFixed(2)} (USFS) · ${droughtStr}`
        });
    } else {
        // No incidents and no tract score — drought alone at D2+ warrants moderate
        const severity = worst?.intensity >= 2 ? "moderate" : "low";
        indicators.push({
            label:    "Wildfire Risk",
            severity,
            value:    `No active wildfires · ${droughtStr}`
        });
    }

    // ── 5. Social Vulnerability ────────────────────────────────────────────
    // Renamed from "Climate Resilience" — the data shown is the ArcGIS Living
    // Atlas population vulnerability index, where a HIGH percentile means a MORE
    // vulnerable population. The old label implied the opposite.
    if (cr) {
        const pctile   = cr.vulPopIndexPctile ?? 0;
        const severity = pctile >= 75 ? "high" : pctile >= 40 ? "moderate" : "low";
        const parts    = [
            pctile > 0           && `${pctile.toFixed(0)}th percentile vulnerability`,
            cr.pctPoverty > 0    && `${cr.pctPoverty.toFixed(1)}% poverty rate`,
            cr.pctOldHousing > 0 && `${cr.pctOldHousing.toFixed(0)}% pre-1970 housing`
        ].filter(Boolean);
        indicators.push({
            label:    "Social Vulnerability",
            severity,
            value:    parts.length
                ? parts.join(" · ")
                : "Tract vulnerability data available — see Climate & Resilience card"
        });
    } else {
        indicators.push({
            label:    "Social Vulnerability",
            severity: "unknown",
            value:    "No tract-level vulnerability data returned"
        });
    }

    // ── 6. Community Health ────────────────────────────────────────────────
    // Life expectancy is the primary severity driver (most comprehensive single
    // health outcome indicator). Uninsured rate replaces unemployment as a
    // health-specific secondary metric — unemployment is economic, not health.
    const health    = data.countyHealth?.[0];
    const uninsured = health?.pctUninsured ?? health?.uninsured ?? null;

    if (health) {
        const le       = health.lifeExpectancy;
        // National avg ~77y; below 74 = high concern, 74–77 = moderate
        const severity = le != null
            ? (le < 74 ? "high" : le < 77 ? "moderate" : "low")
            : "unknown";
        const parts    = [
            le != null         && `Life expectancy ${Number(le).toFixed(1)} yrs`,
            uninsured != null  && `${Number(uninsured).toFixed(1)}% uninsured`
        ].filter(Boolean);
        indicators.push({
            label:    "Community Health",
            severity,
            value:    parts.length
                ? parts.join(" · ")
                : `${health.county || "County"} health data available`
        });
    } else {
        indicators.push({
            label:    "Community Health",
            severity: "unknown",
            value:    "County health data unavailable"
        });
    }

    return indicators;
}


/**
 * Renders the risk indicator card and inserts it into the report section.
 * Call this from renderReport() before renderDatasetSummary().
 */
function renderRiskCard(data) {
    // Remove any existing card from a previous report generation
    document.getElementById("riskCard")?.remove();

    const indicators = computeRiskIndicators(data);

    const indicatorsHTML = indicators.map(ind => `
        <div class="risk-indicator ${ind.severity}">
            <div class="risk-indicator-label">${ind.label}</div>
            <span class="risk-badge ${ind.severity}">${
                ind.severity === "unknown" ? "No Data" :
                ind.severity === "high"    ? "Elevated" :
                ind.severity === "moderate"? "Moderate" : "Low"
            }</span>
            <div class="risk-indicator-value">${ind.value}</div>
        </div>`).join("");

    const card = document.createElement("div");
    card.id        = "riskCard";
    card.className = "risk-card";
    card.innerHTML = `
        <div class="risk-card-header">
            <h3 class="risk-card-title">Environmental Risk Indicators</h3>
        </div>
        <p class="risk-card-source">
            Automatically derived from live federal and authoritative datasets queried at time of report generation —
            <a href="https://msc.fema.gov/" target="_blank" rel="noopener">FEMA NFHL</a>,
            <a href="https://www.epa.gov/frs" target="_blank" rel="noopener">EPA FRS</a>,
            <a href="https://www.airnow.gov/" target="_blank" rel="noopener">EPA AirNow</a>,
            <a href="https://www.arcgis.com/home/item.html?id=6d8a3c4c4e4848c5a82d71c6a3d48d3f" target="_blank" rel="noopener">ArcGIS Living Atlas</a>,
            and <a href="https://www.countyhealthrankings.org/" target="_blank" rel="noopener">County Health Rankings</a>.
        </p>
        <div class="risk-indicators">${indicatorsHTML}</div>
        <button class="risk-disclaimer-toggle" id="riskDisclaimerToggle" aria-expanded="false">
            <span class="risk-disclaimer-toggle-icon">i</span>
            About these indicators &amp; limitations
        </button>
        <div class="risk-disclaimer-body" id="riskDisclaimerBody">
            <p><strong>What these indicators are:</strong> Each indicator is automatically computed from the same live federal and ArcGIS Living Atlas datasets displayed in this report. They summarize what authoritative public data sources show about the area surrounding this address — they are not original analysis or professional assessments.</p>
            <p><strong>What they are not:</strong> These indicators are <strong>not</strong> a Phase I or Phase II Environmental Site Assessment, engineering opinion, legal determination, or professional environmental review. "Low" does not mean "no risk," and "Elevated" does not mean a property is unsuitable — it means federal data shows conditions worth investigating further.</p>
            <p><strong>Data limitations:</strong> Federal datasets may lag real-world conditions. Flood maps may not reflect recent remapping. EPA facility records may include historical sites with completed remediation. Air quality monitors may not exist near every location. Always verify findings directly with the relevant agency.</p>
            <p><strong>Before making real estate or financial decisions:</strong> Consult a licensed environmental professional, certified floodplain manager, or attorney. This report is a starting point for due diligence, not a substitute for it.</p>
        </div>`;

    // Wire up the disclaimer toggle
    card.querySelector("#riskDisclaimerToggle").addEventListener("click", function () {
        const body     = card.querySelector("#riskDisclaimerBody");
        const expanded = this.getAttribute("aria-expanded") === "true";
        this.setAttribute("aria-expanded", !expanded);
        body.classList.toggle("open", !expanded);
        this.querySelector(".risk-disclaimer-toggle-icon").textContent = expanded ? "i" : "×";
    });

    // Insert after the report header, before everything else
    const reportSection = document.getElementById("reportSection");
    const reportHeader  = reportSection.querySelector(".report-header");
    reportHeader.insertAdjacentElement("afterend", card);
}

// ======================================================
// CORE FUNCTIONS
// ======================================================

async function generateReport() {
    const address = document.getElementById("addressInput").value.trim();

    // If a pin is placed, use its coordinates directly
    if (pinnedLocation) {
        toggleLoading(true);
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    address: pinnedLocation.label,
                    lat: pinnedLocation.lat,
                    lon: pinnedLocation.lon
                })
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error || "Unknown error");
            renderReport(result.report);
        } catch (err) {
            console.error(err);
            alert("Error generating report:\n\n" + err.message);
        } finally {
            toggleLoading(false);
        }
        return;
    }

    // Otherwise fall back to address geocoding as before
    if (!address) return alert("Please enter an address or drop a pin.");
    toggleLoading(true);
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error || "Unknown error");
        renderReport(result.report);
    } catch (err) {
        console.error(err);
        alert("Error generating report:\n\n" + err.message);
    } finally {
        toggleLoading(false);
    }
}

function renderReport(report) {
    document.getElementById("reportSection").classList.remove("hidden");
    const { address, location, data } = report;

    document.getElementById("reportAddress").innerText = address;
    document.getElementById("reportCoords").innerText = `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`;

    // Show partial failure banner if any datasets failed
    renderFailureBanner(data._failures || []);

    renderDatasetSummary(data);
    renderRiskCard(data);
    renderParks(data.parks);
    renderElevation(data.contours?.[0] ?? null);
    renderClimate(data);
    renderCommunity(data);
    renderHazards(data);
    renderMap(location, data);
}

function renderFailureBanner(failures) {
    // Remove any existing banner
    document.getElementById("dataFailureBanner")?.remove();
    if (!failures.length) return;

    const isTimeout = (msg) => msg?.toLowerCase().includes("timeout") || msg?.toLowerCase().includes("econnreset");
    const timeouts = failures.filter(f => isTimeout(f.message));
    const errors   = failures.filter(f => !isTimeout(f.message));

    const lines = [];
    if (timeouts.length) lines.push(`${timeouts.length} dataset(s) timed out: ${timeouts.map(f => f.key).join(", ")}`);
    if (errors.length)   lines.push(`${errors.length} dataset(s) failed: ${errors.map(f => f.key).join(", ")}`);

    const banner = document.createElement("div");
    banner.id = "dataFailureBanner";
    banner.style.cssText = `
        display: flex; align-items: flex-start; gap: 12px;
        padding: 12px 16px; margin-bottom: 20px;
        background: var(--amber-bg); border: 1px solid #fcd34d;
        border-left: 4px solid var(--amber); border-radius: var(--r-md);
        font-size: 13px; color: var(--i700); animation: fadein .3s ease both;
    `;
    banner.innerHTML = `
        <div style="font-weight:600;color:#92400e;white-space:nowrap">Partial results</div>
        <div>${lines.join(" · ")} — data may be incomplete. Try regenerating the report.</div>
    `;

    document.getElementById("reportSection").insertBefore(
        banner,
        document.querySelector(".report-header").nextSibling
    );
}

// ======================================================
// RENDER FUNCTIONS
// ======================================================

function renderDatasetSummary(data) {
    const items = [
        { key: "floodZones",         label: "Flood Zones",               fmt: v => v.length ? `${v.length} zone feature(s) nearby` : "No flood zones detected" },
        { key: "superfundSites",     label: "Superfund Sites",           fmt: v => v.length ? `${v.length} site(s) within 2 mi` : "None within 2 mi" },
        { key: "brownfields",        label: "Brownfields",               fmt: v => v.length ? `${v.length} site(s) within 3 mi` : "None within 3 mi" },
        { key: "hazardousWaste",     label: "Hazardous Waste",           fmt: v => v.length ? `${v.length} facility(s) within 3 mi` : "None within 3 mi" },
        { key: "waterPollution",     label: "Water Pollution (NPDES)",   fmt: v => v.length ? `${v.length} permitted discharge site(s)` : "None within 3 mi" },
        { key: "wildfires",          label: "Active Wildfires",          fmt: v => v.length ? `${v.length} active incident(s) within 50 mi` : "No active wildfires nearby" },
        { key: "drought",            label: "Drought Conditions",        fmt: v => v.length ? v.reduce((a, b) => a.intensity >= b.intensity ? a : b).label : "No drought conditions" },
        { key: "airQuality",         label: "Air Quality Monitors",      fmt: v => v.length ? `${(v.reduce((s, x) => s + x.pm25, 0) / v.length).toFixed(1)} µg/m³ avg PM2.5 (${v.length} monitor(s))` : "No monitor data nearby" },
        { key: "parks",              label: "Nearby Parks",              fmt: v => v.length ? `${v.length} park(s) within 3 mi` : "No parks found" },
        { key: "trails",             label: "Trails",                    fmt: v => v.length ? `${v.length} trail(s) within 10 mi` : "No trails found" },
        { key: "alternateFuelStations", label: "Alt. Fuel Stations",     fmt: v => v.length ? `${v.length} station(s) within 3 mi` : "None within 3 mi" },
        { key: "wetlands",           label: "Wetlands",                  fmt: v => { if (!v.length) return "No wetlands within 1 mi"; const t = [...new Set(v.map(w => w.system).filter(Boolean))].join(", "); return `${v.length} wetland feature(s) — ${t || "various types"}`; } },
        { key: "nrhpPoints",   label: "NRHP Sites (Points)",    fmt: v => v.length ? `${v.length} listed site(s) within 2 mi${v.some(s=>s.isNHL) ? " — incl. National Historic Landmark(s)" : ""}` : "None within 2 mi" },
        { key: "nrhpPolygons", label: "NRHP Districts (Polygons)", fmt: v => v.length ? `${v.length} listed district(s) within 2 mi` : "None within 2 mi" }    ];

    document.getElementById("datasetSummary").innerHTML = items.map(({ key, label, fmt }) => {
        const v = data[key] || [];
        return `<div class="dataset-item">
            <div class="dataset-item-label">${label}</div>
            <div class="dataset-item-value${!v.length ? " none" : ""}">${fmt(v)}</div>
        </div>`;
    }).join("");
}

function renderParks(parks) {
    document.getElementById("parksContainer").innerHTML = parks?.length
        ? parks.slice(0, 10).map(p => `
            <div class="park-item">
                <strong>${p.name}</strong>
                <div>Type: ${p.type}</div>
                <div>Area: ${Number(p.areaSqMi || 0).toFixed(2)} sq mi</div>
            </div>`).join("")
        : "<p>No nearby parks found.</p>";
}

function renderElevation(elevation) {
    const container = document.getElementById("elevationContainer");
    if (!elevation?.elevation) { container.innerHTML = ""; container.style.display = "none"; return; }
    container.style.display = "";
    const isFeet = elevation.units === "Feet";
    const feet   = isFeet ? elevation.elevation : elevation.elevation * 3.28084;
    const meters = isFeet ? elevation.elevation / 3.28084 : elevation.elevation;
    container.innerHTML = `
        <div class="climate-row low" style="margin-bottom:0">
            <div class="climate-row-text">
                <div class="climate-row-label">Elevation</div>
                <div class="climate-row-value">${Math.round(feet)} ft <span style="font-weight:400;color:var(--ink-500);font-size:12px">(${meters.toFixed(1)} m above sea level)</span></div>
                ${elevation.type ? `<div class="climate-row-note">${elevation.type}${elevation.interval ? ` · ${elevation.interval} ${elevation.units.toLowerCase()} contour interval` : ""}</div>` : ""}
            </div>
        </div>`;
}

function renderClimate(data) {
    const rows = [];
    const push = (severity, label, value, note = null) => rows.push({ severity, label, value, note });

    // Drought
    const droughts = data.drought || [];
    const worst = droughts.length ? droughts.reduce((a, b) => a.intensity >= b.intensity ? a : b) : null;
    worst
        ? push(worst.intensity >= 3 ? "high" : worst.intensity >= 1 ? "moderate" : "low", "Drought Condition", worst.label, worst.period ? `Period: ${worst.period}` : null)
        : push("low", "Drought Condition", "No drought detected");

    // Flood zones
    const floods = data.floodZones || [];
    if (floods.length) {
        const floodways = floods.filter(f => f.isFloodway);
        const sfha = floods.filter(f => f.sfha === "T");
        const zones = [...new Set(floods.map(f => f.zone))].join(", ");
        push(floodways.length ? "high" : sfha.length ? "moderate" : "low", "Flood Zone", `Zone(s): ${zones}`,
            floodways.length ? `${floodways.length} floodway feature(s) nearby` : sfha.length ? "Within Special Flood Hazard Area" : "Low flood risk designation");
    } else {
        push("low", "Flood Zone", "No flood zone data found");
    }

    // Wildfires
    const fires = data.wildfires || [];
    if (fires.length) {
        const named = fires.filter(f => f.incidentName && f.incidentName !== "Unnamed Fire");
        const acres = fires.reduce((s, f) => s + (f.acres || 0), 0);
        const parts = [...(named.length ? [`Incidents: ${named.slice(0,2).map(f=>f.incidentName).join(", ")}`] : []), ...(acres > 0 ? [`~${acres.toLocaleString()} total acres`] : [])];
        push("high", "Nearby Wildfires", `${fires.length} active incident(s) within 50 mi`, parts.join(" · ") || null);
    } else {
        push("low", "Nearby Wildfires", "No active wildfires nearby");
    }

    // Thermal hotspots
    const hotspots = data.thermalHotspots || [];
    if (hotspots.length) {
        const highConf = hotspots.filter(h => { const c = String(h.confidence || "").toLowerCase(); return c === "high" || c === "h" || Number(h.confidence) >= 80; });
        push(highConf.length ? "high" : "moderate", "Thermal Hotspots", `${hotspots.length} satellite detection(s)`,
            highConf.length ? `${highConf.length} high-confidence detection(s)` : "Low/nominal confidence detections only");
    } else {
        push("low", "Thermal Hotspots", "No thermal hotspot activity");
    }

    // Climate Resilience tract-level
    const cr = data.climateResilience?.[0];
    if (cr) {
        const sev = (v, hi, md) => v >= hi ? "high" : v >= md ? "moderate" : "low";
        if (cr.summerHeatF > 0)                push(sev(cr.summerHeatF, 100, 90), "Summer Heat (Mean LST)", `${cr.summerHeatF.toFixed(1)}°F avg land surface`, cr.pctImpervious > 0 ? `${cr.pctImpervious.toFixed(0)}% impervious surfaces (urban heat factor)` : null);
        if (cr.pctTreeCanopy > 0 || cr.pctLackingCanopy > 0) push(cr.pctLackingCanopy >= 60 ? "moderate" : "low", "Tree Canopy Cover", `${cr.pctTreeCanopy.toFixed(1)}% canopy coverage`, cr.pctLackingCanopy > 0 ? `${cr.pctLackingCanopy.toFixed(0)}% of tract lacks canopy` : null);
        if (cr.wildfireRiskToHome > 0)         push(sev(cr.wildfireRiskToHome, 0.6, 0.3), "Wildfire Risk to Homes", `Risk score: ${cr.wildfireRiskToHome.toFixed(2)}`, cr.wildfireHazardPotential > 0 ? `Hazard potential: ${cr.wildfireHazardPotential.toFixed(2)}` : null);
        if (cr.floodRiskCurrent > 0 || cr.floodRisk2030 > 0) {
            const delta = cr.floodRisk2030 - cr.floodRiskCurrent;
            push(sev(cr.floodRisk2030, 20, 5), "Projected Flood Risk", `${cr.floodRiskCurrent.toFixed(1)}% of properties at risk now`,
                delta > 0 ? `Rising to ${cr.floodRisk2030.toFixed(1)}% by 2030 (+${delta.toFixed(1)}%)` : `Stable at ${cr.floodRisk2030.toFixed(1)}% by 2030`);
        }
        if (cr.vulPopIndexPctile > 0)          push(sev(cr.vulPopIndexPctile, 75, 40), "Population Vulnerability", `${cr.vulPopIndexPctile.toFixed(0)}th national percentile`, cr.pctPoverty > 0 ? `${cr.pctPoverty.toFixed(1)}% in poverty · ${cr.pctMinority.toFixed(0)}% minority population` : null);
        if (cr.pctOldHousing > 0)              push(sev(cr.pctOldHousing, 50, 25), "Pre-1970 Housing Stock", `${cr.pctOldHousing.toFixed(1)}% of units`, "Older housing may contain lead paint or asbestos");
        if (cr.egressScore > 0)                push(cr.egressScore < 5 ? "high" : cr.egressScore < 15 ? "moderate" : "low", "Evacuation Egress Score", `${cr.egressScore.toFixed(1)} road intersections/km²`, cr.egressScore < 5 ? "Low road density — limited evacuation routes" : null);
        if (cr.asthmaPrevalence > 0)           push(sev(cr.asthmaPrevalence, 12, 9), "Asthma Prevalence", `${cr.asthmaPrevalence.toFixed(1)}% crude prevalence`, "Current asthma among adults in this tract");
        if (cr.pctBelowSeaLevel2050 > 0)       push(sev(cr.pctBelowSeaLevel2050, 10, 1), "Below Sea Level by 2050", `${cr.pctBelowSeaLevel2050.toFixed(1)}% of tract area`);
        if (cr.disadvantagedCount > 0)         push(sev(cr.disadvantagedCount, 5, 2), "Disadvantaged Categories", `${cr.disadvantagedCount} of possible categories exceeded`, "Based on climate & socioeconomic thresholds");
        if (cr.homeHardeningIndexPctile > 0)   push(sev(cr.homeHardeningIndexPctile, 75, 40), "Home Hardening Priority", `${cr.homeHardeningIndexPctile.toFixed(0)}th national percentile`, "Need for structural improvements against climate hazards");
        if (cr.treesIndexPctile > 0)           push(sev(cr.treesIndexPctile, 75, 40), "Tree Planting Priority", `${cr.treesIndexPctile.toFixed(0)}th national percentile`, "Priority for urban tree canopy expansion");
        if (cr.floodAwarenessIndexPctile > 0)  push(sev(cr.floodAwarenessIndexPctile, 75, 40), "Flood Awareness Priority", `${cr.floodAwarenessIndexPctile.toFixed(0)}th national percentile`, "Priority for inland flood awareness outreach");
    }

    document.getElementById("climateContainer").innerHTML = rows.map(r => `
        <div class="climate-row ${r.severity}">
            <div class="climate-row-header">
                <div class="climate-row-text">
                    <div class="climate-row-label">${r.label}</div>
                    <div class="climate-row-value">${r.value}</div>
                    ${r.note ? `<div class="climate-row-note">${r.note}</div>` : ""}
                </div>
                <span class="climate-badge ${r.severity}">${r.severity.toUpperCase()}</span>
            </div>
        </div>`).join("");
}

function renderCommunity(data) {
    const health   = data.countyHealth?.[0];
    const district = data.congressionalDistricts?.[0];
    const unemp    = data.unemployment?.[0];
    const cr       = data.climateResilience?.[0];
    const rows     = [];
    const row      = (label, value) => rows.push({ label, value });

    if (health) {
        const pct = (v, d = 1) => v != null ? `${Number(v).toFixed(d)}%` : "N/A";
        const raw = (v, d = 0) => v != null ? Number(v).toFixed(d) : "N/A";
        row("County", `${health.county || "Unknown"}${health.state ? `, ${health.state}` : ""}`);
        if (health.lifeExpectancy != null)        row("Life Expectancy",      `${raw(health.lifeExpectancy, 1)} years`);
        if (health.uninsured != null)             row("Uninsured Rate",        pct(health.uninsured));
        if (health.childPoverty != null)          row("Child Poverty",         pct(health.childPoverty));
        if (health.medianIncome != null)          row("Median Income",         `$${Number(health.medianIncome).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
        if (health.obesity != null)               row("Obesity Rate",          pct(health.obesity));
        if (health.smoking != null)               row("Smoking Rate",          pct(health.smoking));
        if (health.fineParticulateMatter != null) row("Air Quality (PM2.5)",   `${raw(health.fineParticulateMatter, 1)} µg/m³`);
        if (health.drugOverdoseRate != null)      row("Drug Overdose Rate",    `${raw(health.drugOverdoseRate, 1)} per 100k`);
        if (health.accessToExercise != null)      row("Exercise Access",       pct(health.accessToExercise));
        if (health.parkAccess != null)            row("Park Access",           pct(health.parkAccess));
        if (health.broadbandAccess != null)       row("Broadband Access",      pct(health.broadbandAccess));
        if (health.foodInsecurity != null)        row("Food Insecurity",       pct(health.foodInsecurity));
    } else if (district) {
        row("Congressional District", `${district.state}-${district.district} (119th Congress)`);
    }

    if (unemp) {
        row(`Unemployment Rate${unemp.reportingMonth ? ` (${unemp.reportingMonth})` : ""}`, `${Number(unemp.pctUnemployed).toFixed(1)}%`);
        if (unemp.laborForce > 0) row("Labor Force", `${Number(unemp.laborForce).toLocaleString()} workers in ${unemp.county || "county"}`);
    } else if (health?.unemployment != null) {
        row("Unemployment (County Health)", `${Number(health.unemployment).toFixed(1)}%`);
    }

    if (cr) {
        if (cr.popDensity > 0)        row("Population Density",        `${Math.round(cr.popDensity).toLocaleString()} people/km²`);
        if (cr.pctMinority > 0)       row("Minority Population",        `${cr.pctMinority.toFixed(1)}%`);
        if (cr.pctPoverty > 0)  row("Below Poverty Line", `${cr.pctPoverty.toFixed(1)}%`);
        if (cr.pctRenters > 0)  row("Renter-Occupied",    `${cr.pctRenters.toFixed(1)}%`);
        if (cr.pm25 > 0)              row("Tract PM2.5 (Annual)",       `${cr.pm25.toFixed(1)} µg/m³`);
        if (cr.interventionScore > 0) row("Climate Intervention Score", `${cr.interventionScore.toFixed(2)}`);
        if (cr.pctOver65 > 0)         row("Population 65+",             `${cr.pctOver65.toFixed(1)}%`);
        if (cr.pctDisability > 0)     row("Population w/ Disability",   `${cr.pctDisability.toFixed(1)}%`);
        if (cr.pctVacant > 0)         row("Vacant Housing Units",       `${cr.pctVacant.toFixed(1)}%`);
        if (cr.pctNoVehicle > 0)      row("No Vehicle Access",          `${cr.pctNoVehicle.toFixed(1)}%`);
        if (cr.pctNoInternet > 0)     row("No Internet Access",         `${cr.pctNoInternet.toFixed(1)}%`);
        if (cr.pctUndeveloped > 0)    row("Undeveloped Land",           `${cr.pctUndeveloped.toFixed(1)}%`);
        if (cr.pctRiparian > 0)       row("Riparian Area",              `${cr.pctRiparian.toFixed(1)}%`);
    }

    if (district) {
        const partyLabel = district.party ? ` · ${district.party}` : "";
        const repLabel   = district.lastName ? ` (Rep. ${district.lastName})` : "";
        row("Congressional District", `${district.state}-${district.district}${partyLabel}${repLabel} (119th Congress)`);
    }

    document.getElementById("communityContainer").innerHTML = rows.map(r => `
        <div class="community-row">
            <div class="community-text">
                <div class="community-label">${r.label}</div>
                <div class="community-value">${r.value}</div>
            </div>
        </div>`).join("");
}

function renderHazards(data) {
    const findings = [];

    const hazardLinks = (item) => {
        const links = [
            item.facilityUrl ? `<a href="${item.facilityUrl}" target="_blank" rel="noopener">Facility ↗</a>` : null,
            item.reportUrl   ? `<a href="${item.reportUrl}"   target="_blank" rel="noopener">Report ↗</a>`   : null
        ].filter(Boolean).join(" · ");
        return links ? ` <span class="hazard-links">${links}</span>` : "";
    };

    const superfund = data.superfundSites || [];
    if (superfund.length) findings.push({ severity: "high", title: `${superfund.length} Superfund Site(s) Within 2 Miles`,
        details: superfund.slice(0,5).map(s => `<div class="hazard-site"><strong>${s.name}</strong>${[s.city, s.county, s.state].filter(Boolean).length ? ` — ${[s.city, s.county, s.state].filter(Boolean).join(", ")}` : ""}${hazardLinks(s)}</div>`).join("") });

    const hazWaste = data.hazardousWaste || [];
    if (hazWaste.length) findings.push({ severity: "high", title: `${hazWaste.length} Active Hazardous Waste Facility(ies) Within 3 Miles`,
        details: hazWaste.slice(0,5).map(h => `<div class="hazard-site"><strong>${h.facility}</strong> — ${h.city || ""}${hazardLinks(h)}</div>`).join("") });

    const brown = data.brownfields || [];
    if (brown.length) findings.push({ severity: "moderate", title: `${brown.length} Brownfield Site(s) Within 3 Miles`,
        details: brown.slice(0,5).map(b => `<div class="hazard-site"><strong>${b.name}</strong> — ${b.city || ""}${hazardLinks(b)}</div>`).join("") });

    const water = data.waterPollution || [];
    if (water.length) findings.push({ severity: water.length >= 3 ? "high" : "moderate", title: `${water.length} Water Discharge Permit(s) (NPDES) Within 3 Miles`,
        details: water.slice(0,5).map(w => `<div class="hazard-site"><strong>${w.name}</strong> — ${w.city || ""}${hazardLinks(w)}</div>`).join("") });

    const air = data.airQuality || [];
    if (air.length) {
        const pm25Category = v => v <= 12 ? ["Good","low"] : v <= 35.4 ? ["Moderate","moderate"] : v <= 55.4 ? ["Unhealthy for Sensitive Groups","moderate"] : v <= 150 ? ["Unhealthy","high"] : ["Very Unhealthy / Hazardous","high"];
        const nearest = air.reduce((a, b) => a.pm25 >= b.pm25 ? a : b);
        const [label, severity] = pm25Category(nearest.pm25);
        const updated = nearest.lastUpdated ? ` · Updated: ${new Date(nearest.lastUpdated).toLocaleDateString()}` : "";
        const stationLink = nearest.url ? ` <span class="hazard-links"><a href="${nearest.url}" target="_blank" rel="noopener">Station ↗</a></span>` : "";
        findings.push({ severity, title: `Air Quality (PM2.5) — ${label}`,
            details: `<div class="hazard-site"><strong>${nearest.location || nearest.city || "Nearest station"}</strong>: ${nearest.pm25.toFixed(1)} ${nearest.unit || "µg/m³"}${updated}${stationLink}</div>` });
    }

    document.getElementById("hazardsContainer").innerHTML = findings.length
        ? findings.map(f => `<div class="finding ${f.severity}"><div class="finding-title">${f.title}</div><div class="hazard-sites">${f.details}</div></div>`).join("")
        : `<div class="finding low"><div class="finding-title">No Significant Hazards Detected</div><p>No EPA-listed contaminated sites, hazardous waste facilities, or pollution sources were found within the search radius.</p></div>`;
}

// ======================================================
// MAP FUNCTIONS
// ======================================================

function renderMap(location, data) {
    const { lat, lon } = location;

    if (!map) {
        map = L.map("map").setView([lat, lon], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(map);
    } else {
        map.setView([lat, lon], 13);
        Object.values(layerGroups).forEach(l => map.removeLayer(l));
        layerGroups = {};
        propertyMarker?.remove();
        [legendControl, layerControl].forEach(c => c && map.removeControl(c));
    }

    propertyMarker = L.marker([lat, lon]).addTo(map)
        .bindPopup("<strong>Property Location</strong>");

    Object.keys(LAYER_STYLES).forEach(key => {
        if (data[key]?.length) addDatasetLayer(key, data[key]);
    });

    addLayerControlPanel();
}

function addDatasetLayer(key, features) {
    if (!features?.length) return;
    const style = LAYER_STYLES[key] || { color: "#333", fillColor: "#777", radius: 6, type: "point" };
    const layer = L.layerGroup();
    if (DEFAULT_VISIBLE_LAYERS.includes(key)) layer.addTo(map);
    layerGroups[key] = layer;

    features.slice(0, 100).forEach(feature => {
        const geo   = feature.geometry;
        const title = feature.name || feature.incidentName || feature.facility || feature.station || feature.tractName || feature.event || feature.county || feature.zone || "Feature";
        const popup = createPopupContent(title, feature);
        if (geo?.x != null && geo?.y != null) {
            L.circleMarker([geo.y, geo.x], { radius: style.radius || 6, color: style.color, fillColor: style.fillColor, fillOpacity: 0.85, weight: 1.5 }).bindPopup(popup).addTo(layer);
        } else if (geo?.paths) {
            geo.paths.forEach(path => L.polyline(path.map(c => [c[1], c[0]]), { color: style.color, weight: style.weight || 3, opacity: 0.9 }).bindPopup(popup).addTo(layer));
        } else if (geo?.rings) {
            L.polygon(geo.rings.map(ring => ring.map(c => [c[1], c[0]])), { color: style.color, fillColor: style.fillColor, fillOpacity: 0.35, weight: style.weight || 2 }).bindPopup(popup).addTo(layer);
        }
    });
}

function addLayerControlPanel() {
    [legendControl, layerControl].forEach(c => c && map.removeControl(c));

    const layerOrder = ["contours", "wetlands", "superfundSites", "hazardousWaste", "brownfields", "waterPollution", "wildfires", "thermalHotspots", "drought", "floodZones", "climateResilience", "airQuality", "alternateFuelStations", "parks", "trails", "riversStreams", "nrhpPoints", "nrhpPolygons"];

    const ControlPanel = L.Control.extend({
        onAdd() {
            const div = L.DomUtil.create("div", "layer-control-panel");
            div.style.cssText = "background:rgba(255,255,255,0.98);backdrop-filter:blur(12px);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);border:1px solid rgba(76,140,76,0.3);font-size:13px;font-family:system-ui,sans-serif;min-width:260px;max-width:300px;max-height:400px;overflow-y:auto";
            div.innerHTML = `
                <div style="padding:14px 16px;border-bottom:1px solid rgba(76,140,76,0.2);font-weight:700;font-size:15px;color:#2c5f2d;background:#f8f9fa;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none" id="panelToggle">
                    <span>Map Layers</span><span style="margin-left:auto;color:#4a8c4a">▼</span>
                </div>
                <div id="panelContent" style="padding:12px 16px;background:#ffffff"><div id="layerList"></div></div>`;
            ["wheel","touchmove"].forEach(e => div.addEventListener(e, ev => ev.stopPropagation(), false));

            const layerList = div.querySelector("#layerList");
            layerOrder.forEach(key => {
                const layer = layerGroups[key];
                const style = LAYER_STYLES[key];
                if (!layer || !style) return;

                const item = document.createElement("div");
                item.style.cssText = "margin-bottom:12px;border-bottom:1px solid rgba(76,140,76,0.1);padding-bottom:10px";

                const cb = document.createElement("input");
                cb.type = "checkbox"; cb.id = `chk_${key}`;
                cb.style.cssText = "margin-right:10px;cursor:pointer;width:16px;height:16px;accent-color:#4a8c4a";
                cb.checked = map.hasLayer(layer);
                cb.onchange = e => { e.stopPropagation(); e.target.checked ? layer.addTo(map) : map.removeLayer(layer); };

                const lbl = document.createElement("label");
                lbl.htmlFor = `chk_${key}`;
                lbl.style.cssText = "cursor:pointer;flex:1;color:#2c3e50;font-weight:600";
                lbl.textContent = style.label;

                const header = document.createElement("div");
                header.style.cssText = "display:flex;align-items:center;margin-bottom:8px";
                header.append(cb, lbl);

                const sym = document.createElement("div");
                sym.style.cssText = style.type === "line"    ? `width:40px;height:${style.weight||3}px;background:${style.color};border-radius:2px;opacity:0.8`
                                  : style.type === "polygon" ? `width:30px;height:20px;background:${style.fillColor};border:2px solid ${style.color};opacity:0.7;border-radius:3px`
                                  :                            `width:14px;height:14px;border-radius:50%;background:${style.fillColor||style.color};border:2px solid ${style.color};flex-shrink:0;opacity:0.8`;

                const symLbl = document.createElement("span");
                symLbl.style.cssText = "color:#6b7c6b;font-size:11px";
                symLbl.textContent = style.type === "line" ? "Line feature" : style.type === "polygon" ? "Area feature" : "Point feature";

                const preview = document.createElement("div");
                preview.style.cssText = "display:flex;align-items:center;gap:10px;margin-left:26px;padding:4px 0";
                preview.append(sym, symLbl);

                item.append(header, preview);
                layerList.appendChild(item);
            });

            const note = document.createElement("div");
            note.style.cssText = "margin-top:12px;padding-top:8px;border-top:1px solid rgba(76,140,76,0.15);font-size:11px;color:#8a9c8a;text-align:center";
            note.textContent = "Click on map features for details";
            layerList.appendChild(note);

            let open = true;
            div.querySelector("#panelToggle").onclick = () => {
                open = !open;
                div.querySelector("#panelContent").style.display = open ? "block" : "none";
                div.querySelector("#panelToggle span:last-child").innerHTML = open ? "▼" : "▶";
            };
            return div;
        }
    });

    legendControl = new ControlPanel();
    legendControl.addTo(map);
}

// ======================================================
// HELPER FUNCTIONS
// ======================================================

function initSplash() {
    // Use sessionStorage so it shows once per tab session,
    // clears automatically when the tab is closed.
    if (sessionStorage.getItem("ecodisclosure_splash_accepted")) {
        document.getElementById("splashOverlay")?.remove();
        return;
    }

    const overlay   = document.getElementById("splashOverlay");
    const acceptBtn = document.getElementById("splashAcceptBtn");
    if (!overlay || !acceptBtn) return;

    // Prevent background scrolling while splash is open
    document.body.style.overflow = "hidden";

    acceptBtn.addEventListener("click", dismissSplash);

    // Also allow Escape key to dismiss
    document.addEventListener("keydown", function onKey(e) {
        if (e.key === "Escape") { dismissSplash(); document.removeEventListener("keydown", onKey); }
    });

    function dismissSplash() {
        sessionStorage.setItem("ecodisclosure_splash_accepted", "1");
        document.body.style.overflow = "";
        overlay.classList.add("dismissing");
        overlay.addEventListener("animationend", () => overlay.remove(), { once: true });
    }
}

function createPopupContent(title, feature) {
    const fields = Object.entries(feature)
        .filter(([k, v]) => !["geometry","rawAttributes","latitude","longitude"].includes(k) && v != null && v !== "")
        .map(([k, v]) => {
            const isUrl = typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"));
            const display = isUrl ? `<a href="${v}" target="_blank" rel="noopener noreferrer" style="color:#4a8c4a;text-decoration:underline">Link</a>` : v;
            return `<div style="margin-bottom:4px"><strong>${formatKey(k)}:</strong> ${display}</div>`;
        }).join("");
    return `<div style="min-width:240px;max-width:320px"><div style="font-size:16px;font-weight:bold;margin-bottom:6px">${title}</div><hr style="margin:8px 0">${fields}</div>`;
}


function formatKey(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
}

function toggleLoading(show) {
    document.getElementById("loading").classList.toggle("hidden", !show);
}

function exportToPDF() {
    const reportSection = document.getElementById("reportSection");
    if (reportSection?.classList.contains("hidden")) {
        return alert("Please generate a report before exporting.");
    }

    const exportBtn = document.getElementById("exportPdfBtn");
    exportBtn.disabled = true;
    exportBtn.textContent = "Preparing PDF…";

    const address = (document.getElementById("reportAddress")?.innerText || "ecodisclosure-report")
        .replace(/[^a-z0-9]/gi, "-")
        .replace(/-+/g, "-")
        .toLowerCase()
        .slice(0, 60);

    const mapDiv     = document.getElementById("map");
    const mapWrapper = document.querySelector(".map-card");

    // Step 1 — snapshot the already-rendered map div with html2canvas.
    // Since preferCanvas:true is set, all vector layers are on a canvas
    // element inside mapDiv and html2canvas can read them directly.
    html2canvas(mapDiv, {
        useCORS:         true,
        allowTaint:      false,
        backgroundColor: "#e8f0e8",
        scale:           2,
        logging:         false,
        // Tell html2canvas to look inside canvas elements
        foreignObjectRendering: false,
    }).then(mapCanvas => {

        // Step 2 — swap live map for static image
        const imgEl = document.createElement("img");
        imgEl.src   = mapCanvas.toDataURL("image/png");
        imgEl.style.cssText = `width:100%;height:${mapDiv.offsetHeight}px;display:block;border-radius:0`;
        mapDiv.style.display = "none";
        mapDiv.parentNode.insertBefore(imgEl, mapDiv);

        // Step 3 — ensure map card wrapper is visible
        const wasHidden = mapWrapper?.style.display === "none";
        if (mapWrapper) mapWrapper.style.removeProperty("display");

        // Step 4 — hide UI chrome
        const toHide = [
            document.querySelector(".hero"),
            document.querySelector(".search-card"),
            document.querySelector(".report-actions"),
            document.querySelector(".layer-control-panel"),
            document.querySelector(".footer"),
            document.querySelector(".dataset-context-section"),
            document.getElementById("loading"),
            document.getElementById("riskCard")?.querySelector(".risk-disclaimer-toggle"),
        ].filter(Boolean);
        toHide.forEach(el => { el.dataset.pdfHide = el.style.display; el.style.display = "none"; });

        // Step 5 — open disclaimer so it renders in the PDF
        const disclaimerBody   = document.getElementById("riskDisclaimerBody");
        const disclaimerWasOpen = disclaimerBody?.classList.contains("open");
        disclaimerBody?.classList.add("open");

        // Step 6 — generate PDF
        const opt = {
            margin:   [14, 10, 14, 10],
            filename: `${address}.pdf`,
            image:    { type: "jpeg", quality: 0.95 },
            html2canvas: {
                scale:           2,
                useCORS:         true,
                allowTaint:      false,
                backgroundColor: "#f7f9f7",
                logging:         false,
                ignoreElements:  el => el.id === "map",
            },
            jsPDF: {
                unit:        "mm",
                format:      "letter",
                orientation: "portrait",
                compress:    true,
            },
            pagebreak: { mode: "css" },
        };


        html2pdf()
            .set(opt)
            .from(reportSection)
            .save()
            .then(() => restore())
            .catch(err => { console.error("PDF export error:", err); restore(); });

        function restore() {
            // Restore live map
            imgEl.remove();
            mapDiv.style.display = "";
            if (mapWrapper && wasHidden) mapWrapper.style.display = "none";

            // Restore hidden chrome
            toHide.forEach(el => {
                el.style.display = el.dataset.pdfHide || "";
                delete el.dataset.pdfHide;
            });

            // Restore disclaimer
            if (!disclaimerWasOpen) disclaimerBody?.classList.remove("open");

            // Restore button
            exportBtn.disabled    = false;
            exportBtn.textContent = "Export PDF";
        }

    }).catch(err => {
        console.error("Map snapshot error:", err);
        exportBtn.disabled    = false;
        exportBtn.textContent = "Export PDF";
    });
}



// ======================================================
// PIN MODE
// ======================================================

let pinMode = false;
let pinMarker = null;
let pinMap = null;
let pinnedLocation = null; // { lat, lon, label }

const pinToggleBtn = document.getElementById("pinToggleBtn");
const pinMapWrap   = document.getElementById("pinMapWrap");
const pinBanner    = document.getElementById("pinModeBanner");
const pinCoordsEl  = document.getElementById("pinCoords");
const addressInput = document.getElementById("addressInput");
const addressWrap  = document.getElementById("addressInputWrap");

pinToggleBtn.addEventListener("click", () => {
    pinMode ? deactivatePinMode() : activatePinMode();
});

document.getElementById("cancelPinBtn").addEventListener("click", () => {
    deactivatePinMode();
    pinnedLocation = null;
    pinCoordsEl.textContent = "";
});

function activatePinMode() {
    pinMode = true;
    pinToggleBtn.classList.add("active");
    pinMapWrap.classList.remove("hidden");
    pinBanner.classList.remove("hidden");
    pinMapWrap.classList.add("crosshair");
    addressInput.disabled = true;
    addressWrap.style.opacity = "0.45";

    if (!pinMap) {
        // Default view — center of US; will update if geolocation available
        pinMap = L.map("pinMap", { zoomControl: true }).setView([39.5, -98.35], 4);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(pinMap);

        // Try to center on user location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                ({ coords }) => pinMap.setView([coords.latitude, coords.longitude], 13),
                () => {} // silently ignore if denied
            );
        }

        pinMap.on("click", (e) => {
            const { lat, lng } = e.latlng;
            placePinMarker(lat, lng);
        });
    }

    // If a pin already exists, re-show it
    if (pinnedLocation) {
        pinCoordsEl.textContent = `${pinnedLocation.lat.toFixed(5)}, ${pinnedLocation.lon.toFixed(5)}`;
    }

    setTimeout(() => pinMap.invalidateSize(), 50);
}

function deactivatePinMode() {
    pinMode = false;
    pinToggleBtn.classList.remove("active");
    pinBanner.classList.add("hidden");
    addressInput.disabled = false;
    addressWrap.style.opacity = "";

    // If a pin was placed, keep the map visible and update the address field hint
    if (pinnedLocation) {
        pinMapWrap.classList.remove("crosshair");
        addressInput.placeholder = `Pin: ${pinnedLocation.lat.toFixed(5)}, ${pinnedLocation.lon.toFixed(5)}`;
    } else {
        pinMapWrap.classList.add("hidden");
        addressInput.placeholder = "search address";
    }
}

function placePinMarker(lat, lng) {
    if (pinMarker) pinMap.removeLayer(pinMarker);

    pinMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: "",
            html: `<div style="width:14px;height:14px;border-radius:50%;background:var(--g800);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        })
    }).addTo(pinMap);

    pinnedLocation = { lat, lon: lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    pinCoordsEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    // Reverse geocode for a human-readable label
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
        .then(r => r.json())
        .then(d => {
            if (d.display_name) {
                pinnedLocation.label = d.display_name;
                pinCoordsEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)} — ${d.display_name.split(",").slice(0,3).join(",")}`;
            }
        })
        .catch(() => {});
}


// ======================================================
// DATASET CONTEXT ACCORDIONS
// ======================================================

document.querySelectorAll(".context-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
        const expanded = btn.getAttribute("aria-expanded") === "true";
        const body     = btn.nextElementSibling;

        btn.setAttribute("aria-expanded", !expanded);
        body.classList.toggle("open", !expanded);
    });
});