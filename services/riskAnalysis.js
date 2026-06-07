function calculateRisk(data) {

    let score = 0;

    const findings = [];

    // ==================================================
    // WEIGHT CONFIG
    // ==================================================

    const weights = {

        wildfires: 25,
        drought: 10,
        airQuality: 10,
        floodZones: 35,
        superfundSites: 40,
        brownfields: 20,
        waterPollution: 20,
        hazardousWaste: 35,
        thermalHotspots: 20,
    };

    // ==================================================
    // PARKS
    // Positive environmental factor
    // ==================================================

    if (
        data.parks?.length
    ) {

        findings.push({

            category:
                "Parks",

            severity:
                "Low",

            message:
                `${data.parks.length} nearby park(s) detected`
        });
    }

    // ==================================================
    // WILDFIRES
    // ==================================================

    if (
        data.wildfires?.length
    ) {

        const wildfireCount =
            data.wildfires.length;

        score += Math.min(
            weights.wildfires +
            wildfireCount * 2,
            40
        );

        findings.push({

            category:
                "Wildfire Risk",

            severity:
                wildfireCount >= 5
                    ? "High"
                    : "Moderate",

            message:
                `${wildfireCount} wildfire incident(s) detected within 50 miles`
        });
    }

    // ==================================================
    // DROUGHT
    // ==================================================

    if (
        data.drought?.length
    ) {

        const severeDrought =
            data.drought.some(
                d => d.intensity >= 3
            );

        score += severeDrought
            ? 20
            : weights.drought;

        findings.push({

            category:
                "Drought Conditions",

            severity:
                severeDrought
                    ? "High"
                    : "Moderate",

            message:
                `${data.drought.length} drought-related area(s) detected`
        });
    }

    // ==================================================
    // AIR QUALITY
    // ==================================================

    if (
        data.airQuality?.length
    ) {

        const highPm =
            data.airQuality.some(
                a => a.pm25 >= 35
            );

        score += highPm
            ? 20
            : weights.airQuality;

        findings.push({

            category:
                "Air Quality",

            severity:
                highPm
                    ? "High"
                    : "Moderate",

            message:
                `Elevated PM2.5 air quality observations nearby`
        });
    }

    // ==================================================
    // FLOOD ZONES
    // ==================================================

    if (
        data.floodZones?.length
    ) {

        const highRiskFlood =
            data.floodZones.some(
                z =>
                    ["A", "AE", "VE"]
                        .includes(z.zone)
            );

        score += highRiskFlood
            ? 45
            : weights.floodZones;

        findings.push({

            category:
                "Flood Zone",

            severity:
                highRiskFlood
                    ? "High"
                    : "Moderate",

            message:
                `${data.floodZones.length} FEMA flood zone feature(s) detected`
        });
    }

    // ==================================================
    // SUPERFUND SITES
    // ==================================================

    if (
        data.superfundSites?.length
    ) {

        const count =
            data.superfundSites.length;

        score += Math.min(
            weights.superfundSites +
            count * 3,
            55
        );

        findings.push({

            category:
                "Superfund Site",

            severity:
                count >= 3
                    ? "High"
                    : "Moderate",

            message:
                `${count} EPA Superfund site(s) nearby`
        });
    }

    // ==================================================
    // BROWNFIELDS
    // ==================================================

    if (
        data.brownfields?.length
    ) {

        score += Math.min(
            weights.brownfields +
            data.brownfields.length,
            30
        );

        findings.push({

            category:
                "Brownfields",

            severity:
                "Moderate",

            message:
                `${data.brownfields.length} brownfield site(s) nearby`
        });
    }

    // ==================================================
    // WATER POLLUTION
    // ==================================================

    if (
        data.waterPollution?.length
    ) {

        score += Math.min(
            weights.waterPollution +
            data.waterPollution.length,
            35
        );

        findings.push({

            category:
                "Water Pollution",

            severity:
                "Moderate",

            message:
                `${data.waterPollution.length} permitted discharge facility(s) nearby`
        });
    }

    // ==================================================
    // HAZARDOUS WASTE
    // ==================================================

    if (
        data.hazardousWaste?.length
    ) {

        const count =
            data.hazardousWaste.length;

        score += Math.min(
            weights.hazardousWaste +
            count * 2,
            50
        );

        findings.push({

            category:
                "Hazardous Waste",

            severity:
                count >= 3
                    ? "High"
                    : "Moderate",

            message:
                `${count} hazardous waste facility(s) nearby`
        });
    }

    // ==================================================
    // THERMAL HOTSPOTS
    // ==================================================

    if (
        data.thermalHotspots?.length
    ) {

        const highConfidence =
            data.thermalHotspots.some(
                t =>
                    String(
                        t.confidence
                    ).toLowerCase() === "high"
            );

        score += highConfidence
            ? 30
            : weights.thermalHotspots;

        findings.push({

            category:
                "Thermal Hotspots",

            severity:
                highConfidence
                    ? "High"
                    : "Moderate",

            message:
                `${data.thermalHotspots.length} satellite thermal hotspot(s) detected`
        });
    }


    // ==================================================
    // CLIMATE RESILIENCE
    // ==================================================

    if (
        data.climateResilience?.length
    ) {

        const resilience =
            data.climateResilience[0];

        findings.push({

            category:
                "Climate Resilience",

            severity:
                "Low",

            message:
                resilience.score
                    ? `Climate resilience score: ${resilience.score}`
                    : "Climate resilience planning data available"
        });
    }

    // ==================================================
    // RIVERS / STREAMS
    // ==================================================

    if (
        data.riversStreams?.length
    ) {

        findings.push({

            category:
                "Water Features",

            severity:
                "Low",

            message:
                `${data.riversStreams.length} river/stream feature(s) nearby`
        });
    }

    // ==================================================
    // EV INFRASTRUCTURE
    // ==================================================

    if (
        data.alternateFuelStations?.length
    ) {

        findings.push({

            category:
                "EV Infrastructure",

            severity:
                "Low",

            message:
                `${data.alternateFuelStations.length} alternative fuel station(s) nearby`
        });
    }

    // ==================================================
    // COUNTY HEALTH
    // ==================================================

    if (
        data.countyHealth?.length
    ) {

        findings.push({

            category:
                "Community Health",

            severity:
                "Low",

            message:
                `County health ranking data available`
        });
    }


    // ==================================================
    // NORMALIZE SCORE
    // ==================================================

    score = Math.max(
        0,
        Math.min(score, 100)
    );

    // ==================================================
    // FINAL RATING
    // ==================================================

    let rating = "Low";

    if (score >= 70) {

        rating = "High";

    } else if (score >= 35) {

        rating = "Moderate";
    }

    // ==================================================
    // SORT FINDINGS
    // ==================================================

    findings.sort((a, b) => {

        const severityRank = {

            High: 3,
            Moderate: 2,
            Low: 1
        };

        return (
            severityRank[b.severity] -
            severityRank[a.severity]
        );
    });

    return {

        score,

        rating,

        findings
    };
}

module.exports = {
    calculateRisk
};
