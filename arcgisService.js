const axios = require("axios");

// ======================================================
// GEOMETRY HELPERS
// ======================================================

const extractGeometry  = (f) => f.geometry || null;
const calculateCenter  = (coords) => coords?.length
    ? { longitude: coords.reduce((a, c) => a + c[0], 0) / coords.length, latitude: coords.reduce((a, c) => a + c[1], 0) / coords.length }
    : { latitude: null, longitude: null };
const calculateCentroid = (geo) => {
    if (!geo) return { latitude: null, longitude: null };
    if (geo.x != null && geo.y != null) return { latitude: geo.y, longitude: geo.x };
    const coords = geo.rings?.[0] || geo.paths?.[0];
    return coords ? calculateCenter(coords) : { latitude: null, longitude: null };
};

// ======================================================
// NORMALIZATION FACTORY
// ======================================================

const normalizeFeatures = (features, builder) =>
    features.map(f => {
        const geo = extractGeometry(f);
        return { ...builder(f.attributes || {}), ...calculateCentroid(geo), geometry: geo, rawAttributes: f.attributes || {} };
    });

// ======================================================
// DATASET CONFIGURATION
// ======================================================

const num = (v, fallback = 0) => Number(v ?? fallback);

const SERVICES = {
    floodZones: {
        url: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
        radius: 1, queryType: "distance",
        // Remove the floodway-only where clause — query all meaningful flood zones,
        // excluding only open water and minimal hazard (unshaded X zones)
        where: "FLD_ZONE NOT IN ('OPEN WATER') AND NOT (FLD_ZONE = 'X' AND ZONE_SUBTY = 'AREA OF MINIMAL FLOOD HAZARD')",
        outFields: ["FLD_ZONE", "ZONE_SUBTY", "SFHA_TF"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "floodZones",
            zone: a.FLD_ZONE || "Unknown",
            subtype: a.ZONE_SUBTY || null,
            isFloodway: a.ZONE_SUBTY?.includes("FLOODWAY") || false,
            sfha: a.SFHA_TF || null
        }))
    },
    parks: {
        url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/USA_Detailed_Parks/FeatureServer/0",
        radius: 3, queryType: "distance",
        outFields: ["OBJECTID", "NAME", "FEATTYPE", "SQMI"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "parks", id: a.OBJECTID, name: a.NAME || "Unnamed Park",
            type: a.FEATTYPE || "Unknown", areaSqMi: num(a.SQMI)
        }))
    },
    wildfires: {
        url: "https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/USA_Wildfires_v1/FeatureServer/0",
        radius: 50, queryType: "distance",
        outFields: ["IncidentName", "FireCause", "FireCauseGeneral", "FireDiscoveryDateTime", "DailyAcres", "PercentContained", "POOState", "POOCounty", "ResidencesDestroyed", "OtherStructuresDestroyed", "Injuries", "Fatalities"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "wildfires", incidentName: a.IncidentName || "Unnamed Fire",
            fireCause: a.FireCause || a.FireCauseGeneral || "Unknown",
            percentContained: num(a.PercentContained), acres: num(a.DailyAcres),
            state: a.POOState || "Unknown", county: a.POOCounty || null,
            discoveryDate: a.FireDiscoveryDateTime || null,
            residencesDestroyed: num(a.ResidencesDestroyed), structuresDestroyed: num(a.OtherStructuresDestroyed),
            injuries: num(a.Injuries), fatalities: num(a.Fatalities)
        }))
    },
    drought: {
        url: "https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/US_Drought_Intensity_v1/FeatureServer/3",
        radius: 1, queryType: "intersects",
        outFields: ["period", "dm", "endyear", "endmonth", "endday", "ddate"],
        returnGeometry: false,
        normalize: (features) => {
            const labels = ["Abnormally Dry", "Moderate Drought", "Severe Drought", "Extreme Drought", "Exceptional Drought"];
            return normalizeFeatures(features, (a) => ({
                dataset: "drought", intensity: Number(a.dm), label: labels[a.dm] || "Unknown",
                period: a.period || null, droughtDate: a.ddate || null,
                endYear: a.endyear || null, endMonth: a.endmonth || null, endDay: a.endday || null
            }));
        }
    },
    airQuality: {
        url: "https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/Air_Quality_PM25_Latest_Results/FeatureServer/0",
        radius: 25, queryType: "distance",
        outFields: ["value", "unit", "value_2", "unit_2", "location", "city", "instrument_name", "url", "lastUpdated"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "airQuality", pm25: num(a.value), unit: a.unit || "µg/m³",
            pm25_24h: num(a.value_2), unit2: a.unit_2 || null,
            location: a.location || null, city: a.city || null,
            instrument: a.instrument_name || null, url: a.url || null, lastUpdated: a.lastUpdated || null
        }))
    },
    superfundSites: {
        url: "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/FRS_INTERESTS_SEMS_NPL/FeatureServer/0",
        radius: 2, queryType: "distance",
        outFields: ["PRIMARY_NAME", "CITY_NAME", "STATE_CODE", "COUNTY_NAME", "FAC_URL", "PGM_REPORT_URL", "ACTIVE_STATUS", "INTEREST_TYPE"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "superfundSites", name: a.PRIMARY_NAME || "Unknown Site",
            city: a.CITY_NAME || "Unknown", county: a.COUNTY_NAME || null, state: a.STATE_CODE || null,
            activeStatus: a.ACTIVE_STATUS || null, interestType: a.INTEREST_TYPE || null,
            facilityUrl: a.FAC_URL || null, reportUrl: a.PGM_REPORT_URL || null
        }))
    },
    brownfields: {
        url: "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/FRS_INTERESTS_ACRES/FeatureServer/0",
        radius: 3, queryType: "distance",
        outFields: ["PRIMARY_NAME", "CITY_NAME", "STATE_CODE", "COUNTY_NAME", "INTEREST_TYPE", "FAC_URL", "PROGRAM_URL", "PGM_REPORT_URL", "ACTIVE_STATUS"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "brownfields", name: a.PRIMARY_NAME || "Unknown Brownfield",
            city: a.CITY_NAME || "Unknown", county: a.COUNTY_NAME || null, state: a.STATE_CODE || null,
            interestType: a.INTEREST_TYPE || null, activeStatus: a.ACTIVE_STATUS || null,
            facilityUrl: a.FAC_URL || null, programUrl: a.PROGRAM_URL || null, reportUrl: a.PGM_REPORT_URL || null
        }))
    },
    waterPollution: {
        url: "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/FRS_INTERESTS_NPDES/FeatureServer/0",
        radius: 3, queryType: "distance",
        outFields: ["PRIMARY_NAME", "CITY_NAME", "STATE_CODE", "COUNTY_NAME", "INTEREST_TYPE", "FAC_URL", "PGM_REPORT_URL", "ACTIVE_STATUS"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "waterPollution", name: a.PRIMARY_NAME || "Unknown Facility",
            city: a.CITY_NAME || null, county: a.COUNTY_NAME || null, state: a.STATE_CODE || null,
            interestType: a.INTEREST_TYPE || null, activeStatus: a.ACTIVE_STATUS || null,
            facilityUrl: a.FAC_URL || null, reportUrl: a.PGM_REPORT_URL || null
        }))
    },
    hazardousWaste: {
        url: "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/FRS_INTERESTS_RCRA_ACTIVE/FeatureServer/0",
        radius: 3, queryType: "distance",
        outFields: ["PRIMARY_NAME", "CITY_NAME", "STATE_CODE", "COUNTY_NAME", "INTEREST_TYPE", "FAC_URL", "PGM_REPORT_URL", "ACTIVE_STATUS"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "hazardousWaste", facility: a.PRIMARY_NAME || "Unknown Facility",
            city: a.CITY_NAME || "Unknown", county: a.COUNTY_NAME || null, state: a.STATE_CODE || null,
            interestType: a.INTEREST_TYPE || null, activeStatus: a.ACTIVE_STATUS || null,
            facilityUrl: a.FAC_URL || null, reportUrl: a.PGM_REPORT_URL || null
        }))
    },
    thermalHotspots: {
        url: "https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0",
        radius: 5, queryType: "distance",
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "thermalHotspots", brightness: num(a.BRIGHTNESS),
            confidence: a.CONFIDENCE || "Unknown", scanDate: a.ACQ_DATE || null
        }))
    },
    alternateFuelStations: {
        url: "https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/Alternate_Fuel/FeatureServer/0",
        radius: 3, queryType: "distance",
        outFields: ["Station_Name", "Fuel_Type", "Accessability", "Address", "City", "State", "Current_Status", "Access_Hours", "EV_Network"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "alternateFuelStations", station: a.Station_Name || "Unknown Station",
            fuelType: a.Fuel_Type || "Unknown", access: a.Accessability || null,
            address: a.Address || null, city: a.City || null, state: a.State || null,
            status: a.Current_Status || null, hours: a.Access_Hours || null, evNetwork: a.EV_Network || null
        }))
    },
wetlands: {
    url: "https://services5.arcgis.com/7weheFjxuNkGGiZi/ArcGIS/rest/services/USA_Wetlands/FeatureServer/0",
    radius: 1, queryType: "intersects",
    outFields: ["WETLAND_TYPE", "SYSTEM_NAME", "SUBSYSTEM_NAME", "CLASS_NAME", "SUBCLASS_NAME", "WATER_REGIME_NAME", "WATER_REGIME_SUBGROUP", "Shape__Area"],
    normalize: (features) => normalizeFeatures(features, (a) => ({
        dataset: "wetlands",
        name: a.WETLAND_TYPE || "Unknown Wetland",
        system: a.SYSTEM_NAME || null,
        subsystem: a.SUBSYSTEM_NAME || null,
        className: a.CLASS_NAME || null,
        subclassName: a.SUBCLASS_NAME || null,
        waterRegime: a.WATER_REGIME_NAME || null,
        waterRegimeSubgroup: a.WATER_REGIME_SUBGROUP || null,
        areaSqM: num(a.Shape__Area)
    }))
},
nrhpPoints: {
    url: "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/0",
    radius: 2, queryType: "distance",
    where: "STATUS = 'Listed'",
    outFields: ["RESNAME", "ResType", "Address", "City", "County", "State", "CertDate", "Is_NHL", "IS_EXTANT", "MultiName", "NumCBldg", "NumCSite", "NumCStru", "NRIS_Refnum", "NARA_URL", "STATUS"],
    normalize: (features) => normalizeFeatures(features, (a) => ({
        dataset: "nrhpPoints",
        name: a.RESNAME || "Unknown Site",
        resourceType: a.ResType || null,
        address: a.Address || null,
        city: a.City || null, county: a.County || null, state: a.State || null,
        certDate: a.CertDate || null,
        isNHL: a.Is_NHL === "X",
        isExtant: a.IS_EXTANT || null,
        multiName: a.MultiName || null,
        contributingBuildings: num(a.NumCBldg),
        contributingSites: num(a.NumCSite),
        contributingStructures: num(a.NumCStru),
        refNum: a.NRIS_Refnum || null,
        naraUrl: a.NARA_URL || null,
        status: a.STATUS || null
    }))
},
nrhpPolygons: {
    url: "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/1",
    radius: 2, queryType: "distance",
    where: "STATUS = 'Listed'",
    outFields: ["RESNAME", "ResType", "Address", "City", "County", "State", "CertDate", "Is_NHL", "IS_EXTANT", "MultiName", "NumCBldg", "NumCSite", "NumCStru", "NRIS_Refnum", "NARA_URL", "STATUS", "Shape_Area"],
    normalize: (features) => normalizeFeatures(features, (a) => ({
        dataset: "nrhpPolygons",
        name: a.RESNAME || "Unknown Site",
        resourceType: a.ResType || null,
        address: a.Address || null,
        city: a.City || null, county: a.County || null, state: a.State || null,
        certDate: a.CertDate || null,
        isNHL: a.Is_NHL === "X",
        isExtant: a.IS_EXTANT || null,
        multiName: a.MultiName || null,
        contributingBuildings: num(a.NumCBldg),
        contributingSites: num(a.NumCSite),
        contributingStructures: num(a.NumCStru),
        refNum: a.NRIS_Refnum || null,
        naraUrl: a.NARA_URL || null,
        status: a.STATUS || null,
        areaSqM: num(a.Shape_Area)
    }))
},
    riversStreams: {
        url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Rivers_and_Streams/FeatureServer/4",
        radius: 2, queryType: "distance",
        outFields: ["GNIS_NAME", "FTYPE", "LENGTHKM", "REACHCODE"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "riversStreams", name: a.GNIS_NAME || "Unnamed Waterbody",
            type: a.FTYPE || "Unknown", lengthKm: num(a.LENGTHKM), reachCode: a.REACHCODE || null
        }))
    },
    trails: {
        url: "https://partnerships.nationalmap.gov/arcgis/rest/services/USGSTrails/MapServer/0",
        radius: 10, queryType: "distance",
        outFields: ["name", "trailtype", "nationaltraildesignation", "lengthmiles", "hikerpedestrian", "bicycle", "atv", "motorcycle", "snowmobile", "nonmotorizedwatercraft", "motorizedwatercraft"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "trails", name: a.name || "Unnamed Trail", trailType: a.trailtype || "Unknown",
            designation: a.nationaltraildesignation || null, lengthMiles: num(a.lengthmiles),
            hiking: a.hikerpedestrian === "Y", bicycle: a.bicycle === "Y", atv: a.atv === "Y",
            motorcycle: a.motorcycle === "Y", snowmobile: a.snowmobile === "Y",
            nonMotorizedWatercraft: a.nonmotorizedwatercraft === "Y", motorizedWatercraft: a.motorizedwatercraft === "Y"
        }))
    },
    countyHealth: {
        url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/County%20Health%20Rankings%202025/FeatureServer/2",
        radius: 1, queryType: "intersects",
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "countyHealth", county: a.county, state: a.state || null,
            prematureDeathRate: a.v001_rawvalue, poorHealth: a.v002_rawvalue, uninsured: a.v003_rawvalue,
            primaryCarePhysicians: a.v004_rawvalue, smoking: a.v009_rawvalue, obesity: a.v011_rawvalue,
            teenBirthRate: a.v014_rawvalue, homicideRate: a.v015_rawvalue, graduationRate: a.v021_rawvalue,
            unemployment: a.v023_rawvalue, childPoverty: a.v024_rawvalue, poorPhysicalHealthDays: a.v036_rawvalue,
            lowBirthWeight: a.v037_rawvalue, motorVehicleDeaths: a.v039_rawvalue, poorMentalHealthDays: a.v042_rawvalue,
            incomeInequality: a.v044_rawvalue, chlamydiaRate: a.v045_rawvalue, excessiveDrinking: a.v049_rawvalue,
            mammogramScreening: a.v050_rawvalue, diabetes: a.v060_rawvalue, hivRate: a.v061_rawvalue,
            mentalHealthProviders: a.v062_rawvalue, medianIncome: a.v063_rawvalue, freeLunchEligible: a.v065_rawvalue,
            postSecondaryEducation: a.v069_rawvalue, noPhysicalActivity: a.v070_rawvalue,
            singleParentHouseholds: a.v082_rawvalue, under65Uninsured: a.v085_rawvalue, dentists: a.v088_rawvalue,
            fineParticulateMatter: a.v125_rawvalue, ageAdjustedDeathRate: a.v127_rawvalue,
            infantMortality: a.v129_rawvalue, accessToExercise: a.v132_rawvalue, healthyFoodAccess: a.v133_rawvalue,
            injuryDeathRate: a.v135_rawvalue, severeHousingProblems: a.v136_rawvalue, drugOverdoseRate: a.v138_rawvalue,
            foodInsecurity: a.v139_rawvalue, shortSleep: a.v143_rawvalue, lifeExpectancy: a.v147_rawvalue,
            firearmDeaths: a.v148_rawvalue, disconnectedYouth: a.v149_rawvalue, genderPayGap: a.v151_rawvalue,
            homeownership: a.v153_rawvalue, severeHousingCostBurden: a.v154_rawvalue, suicideRate: a.v161_rawvalue,
            broadbandAccess: a.v166_rawvalue, highSchoolGraduation: a.v168_rawvalue, livingWage: a.v170_rawvalue,
            parkAccess: a.v179_rawvalue, loneliness: a.v183_rawvalue, lackOfSupport: a.v184_rawvalue
        }))
    },
    climateResilience: {
        url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/Climate_Resilience_Planning_Census_Tracts/FeatureServer/0",
        radius: 1, queryType: "intersects",
        outFields: [
            "GEOID", "NAME", "State", "County",
            "B01001_001E", "B01001_calc_pctGE65E", "B18101_calc_pctDE",
            "PCT_Pop_Minority", "B17020_calc_pctPovE", "Pop_Density_PPL_SqKm",
            "B25002_calc_pctTotalRentE", "B25002_calc_pctVacE", "B25002_calc_pctTotalOwnE",
            "PCT_HU_Built_Prior_1970", "B08201_calc_pctNoVehE", "B28002_calc_pctNoIntE", "B16004_calc_pctGE18LEAE",
            "Mean_Annual_Est_PM2_5_μg_m3", "CASTHMA_CrudePrev",
            "High_Summer_Mean_LST_F", "PCT_TreeCanopy", "PCT_LackingCanopy", "PCT_ImperviousSurfaces",
            "WF_RiskToHome_Mean", "WF_HazardPotential_Mean", "Cnt_Rd_Inter_Per_Sqkm",
            "pct_fs_risk_100_year00", "pct_fs_risk_100_year30",
            "Pct_Tract_Blw_SL_2050", "Pct_Tract_Undev", "Pct_Riparian", "MAX_CC",
            "Vul_Pop_Index_Nat_Pctl", "In_Flood_Aware_Index_Nat_Pctl",
            "Home_Hardening_Index_Nat_Pctl", "Trees_Index_Nat_Pctl", "intervention_score"
        ],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "climateResilience",
            geoid: a.GEOID || null, tractName: a.NAME || null, county: a.County || null, state: a.State || null,
            totalPopulation: num(a.B01001_001E),    pctOver65: num(a.B01001_calc_pctGE65E),
            pctDisability: num(a.B18101_calc_pctDE), pctMinority: num(a.PCT_Pop_Minority),
            pctPoverty: num(a.B17020_calc_pctPovE),  popDensity: num(a.Pop_Density_PPL_SqKm),
            pctRenters: num(a.B25002_calc_pctTotalRentE), pctOwners: num(a.B25002_calc_pctTotalOwnE),
            pctVacant: num(a.B25002_calc_pctVacE),   pctOldHousing: num(a.PCT_HU_Built_Prior_1970),
            pctNoVehicle: num(a.B08201_calc_pctNoVehE), pctNoInternet: num(a.B28002_calc_pctNoIntE),
            pctLimitedEnglish: num(a.B16004_calc_pctGE18LEAE),
            pm25: num(a["Mean_Annual_Est_PM2_5_μg_m3"]), asthmaPrevalence: num(a.CASTHMA_CrudePrev),
            summerHeatF: num(a.High_Summer_Mean_LST_F), pctTreeCanopy: num(a.PCT_TreeCanopy),
            pctLackingCanopy: num(a.PCT_LackingCanopy), pctImpervious: num(a.PCT_ImperviousSurfaces),
            wildfireRiskToHome: num(a.WF_RiskToHome_Mean), wildfireHazardPotential: num(a.WF_HazardPotential_Mean),
            egressScore: num(a.Cnt_Rd_Inter_Per_Sqkm),
            floodRiskCurrent: num(a.pct_fs_risk_100_year00), floodRisk2030: num(a.pct_fs_risk_100_year30),
            pctBelowSeaLevel2050: num(a.Pct_Tract_Blw_SL_2050), pctUndeveloped: num(a.Pct_Tract_Undev),
            pctRiparian: num(a.Pct_Riparian), disadvantagedCount: num(a.MAX_CC),
            vulPopIndexPctile: num(a.Vul_Pop_Index_Nat_Pctl),
            floodAwarenessIndexPctile: num(a.In_Flood_Aware_Index_Nat_Pctl),
            homeHardeningIndexPctile: num(a.Home_Hardening_Index_Nat_Pctl),
            treesIndexPctile: num(a.Trees_Index_Nat_Pctl), interventionScore: num(a.intervention_score)
        }))
    },
    unemployment: {
        url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/BLS_Monthly_Unemployment/FeatureServer/2",
        radius: 1, queryType: "intersects",
        outFields: ["NAME", "State", "LaborForce_CurrentMonth", "Employed_CurrentMonth", "Unemployed_CurrentMonth", "PctUnemployed_CurrentMonth", "CurrentMonth"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "unemployment", county: a.NAME || null, state: a.State || null,
            laborForce: num(a.LaborForce_CurrentMonth), employed: num(a.Employed_CurrentMonth),
            unemployed: num(a.Unemployed_CurrentMonth), pctUnemployed: num(a.PctUnemployed_CurrentMonth),
            reportingMonth: a.CurrentMonth || null
        }))
    },
    congressionalDistricts: {
        url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/USA_119th_Congressional_Districts/FeatureServer/0",
        radius: 1, queryType: "intersects",
        outFields: ["*"],
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "congressionalDistricts",
            district: a.DISTRICT || a.DISTRICTID?.slice(-2) || "Unknown",
            state: a.STATE_ABBR || a.STATE || "Unknown",
            party: a.PARTY || null, lastName: a.LAST_NAME || null
        }))
    },
    contours: {
        url: "https://cartowfs.nationalmap.gov/arcgis/rest/services/contours/MapServer/5",
        radius: 0.1, queryType: "distance",
        outFields: ["contourelevation", "contourunits", "contourinterval", "fcode"],
        where: "contourelevation > 0",
        resultRecordCount: 5,
        orderByFields: "contourelevation DESC",
        normalize: (features) => normalizeFeatures(features, (a) => ({
            dataset: "contours",
            elevation: num(a.contourelevation),
            units: a.contourunits === 1 ? "Feet" : a.contourunits === 2 ? "Meters" : "Unknown",
            interval: num(a.contourinterval),
            type: { 10101: "Normal Intermediate", 10102: "Normal Index", 10103: "Normal Supplemental" }[a.fcode] || "Contour"
        }))
    }
};

// ======================================================
// QUERY ENGINE
// ======================================================

async function queryLayer(config, lat, lon) {
    const { url, radius = 2, queryType = "distance", outFields = ["*"], where = "1=1" } = config;
    const radiusMeters = radius * 1609.34;

    const base = {
        f: "json", where, outSR: 4326,
        returnGeometry: config.returnGeometry !== false, // default true, false if explicitly set
        outFields: Array.isArray(outFields) ? outFields.join(",") : outFields,
        ...(config.resultRecordCount && { resultRecordCount: config.resultRecordCount }),
        ...(config.orderByFields    && { orderByFields: config.orderByFields }),
    };

    const spatial = {
        distance:   { geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: 4326, spatialRel: "esriSpatialRelIntersects", distance: radiusMeters, units: "esriSRUnit_Meter" },
        intersects: { geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: 4326, outSR: 4326, spatialRel: "esriSpatialRelIntersects" },
        bbox: (() => { const o = radius / 69; return { geometry: `${lon-o},${lat-o},${lon+o},${lat+o}`, geometryType: "esriGeometryEnvelope", inSR: 4326, spatialRel: "esriSpatialRelIntersects" }; })()
    };

    const params = { ...base, ...spatial[queryType] };

    try {
        // If multiLayer is defined, query each sublayer and merge results
        if (config.multiLayer) {
            const results = await Promise.all(
                config.multiLayer.map(layerId =>
                    axios.get(`${url}/${layerId}/query`, { params })
                        .then(r => r.data.features || [])
                        .catch(() => [])
                )
            );
            return results.flat();
        }

        const res = await axios.get(`${url}/query`, { params });
        return res.data.features || [];
    } catch (err) {
        console.error(`Query failed: ${url}`, err.message);
        return [];
    }
}
// ======================================================
// MAIN ENGINE
// ======================================================

async function getEnvironmentalData(lat, lon) {
    const results = {};
    await Promise.all(Object.entries(SERVICES).map(async ([key, config]) => {
        try {
            console.log(`Querying ${key}...`);
            const raw = await queryLayer(config, lat, lon);
            results[key] = config.normalize(raw);
            console.log(`${key}: ${results[key].length} results`);
        } catch (err) {
            console.error(`Failed ${key}:`, err.message);
            results[key] = [];
        }
    }));
    return results;
}

module.exports = { getEnvironmentalData };