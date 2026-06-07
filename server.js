const express = require("express");
const cors = require("cors");

const reportRoute =
    require("./routes/report");

const app = express();

app.use(cors());

app.use(express.json());

app.use(
    "/api/report",
    reportRoute
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );
});


const path = require("path");
   app.use(express.static(path.join(__dirname, "client")));