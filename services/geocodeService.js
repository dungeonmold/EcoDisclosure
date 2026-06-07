const axios = require("axios");

async function geocodeAddress(address) {

    const url =
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

    const response =
        await axios.get(url, {

            params: {
                f: "json",

                singleLine:
                    address,

                maxLocations: 1,

                outFields: "*"
            }
        });

    const candidate =
        response.data.candidates[0];

    if (!candidate) {

        throw new Error(
            "Address not found"
        );
    }

    return {

        address:
            candidate.address,

        lat:
            candidate.location.y,

        lon:
            candidate.location.x
    };
}

module.exports = {
    geocodeAddress
};
