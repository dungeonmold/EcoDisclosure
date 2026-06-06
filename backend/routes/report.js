const express = require("express");
const router = express.Router();
const { geocodeAddress } = require("../services/geocodeService");
const { getEnvironmentalData } = require("../services/arcgisService");

router.post("/", async (req, res) => {
    try {
        const { address, lat, lon } = req.body;

        let location;
        if (lat != null && lon != null) {
            // Pin mode — coordinates provided directly, skip geocoding
            location = { lat: Number(lat), lon: Number(lon), address: address || `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}` };
            console.log("Using pinned location:", location);
        } else {
            if (!address) return res.status(400).json({ success: false, error: "Address or coordinates required" });
            console.log("Geocoding address...");
            location = await geocodeAddress(address);
            console.log("Location:", location);
        }

        console.log("Querying environmental layers...");
        const data = await getEnvironmentalData(location.lat, location.lon);
        console.log("Environmental report generated.");

    res.json({
        success: true,
        report: {
            address: location.address,
            location,
            generatedAt: new Date().toISOString(),
            data  // _failures is already inside data from getEnvironmentalData
        }
    });
    } catch (err) {
        console.error("REPORT ERROR:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;