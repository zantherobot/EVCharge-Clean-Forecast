import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  getEstimatedFuel,
  processWattTimeData,
  combineAndFilterData,
  averageByPTHour,
} from "./src/shared.ts";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000");

let wattTimeToken: string | null = null;
let tokenExpiry: number = 0;

async function getWattTimeToken() {
  const user = process.env.WATTTIME_USER;
  const pass = process.env.WATTTIME_PASSWORD;

  if (!user || !pass) {
    throw new Error("WATTTIME_USER or WATTTIME_PASSWORD not set in environment");
  }

  if (wattTimeToken && Date.now() < tokenExpiry) {
    return wattTimeToken;
  }

  console.log("Authenticating with WattTime...");
  const response = await fetch("https://api.watttime.org/login", {
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
    },
  });

  if (!response.ok) {
    throw new Error(`WattTime auth failed: ${response.statusText}`);
  }

  const data = await response.json();
  wattTimeToken = data.token;
  // Tokens usually last 30 mins, let's refresh every 25
  tokenExpiry = Date.now() + 25 * 60 * 1000;
  return wattTimeToken;
}

app.get("/api/monthly-averages", async (req, res) => {
  try {
    const token = await getWattTimeToken();
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const monthlyAverages = await Promise.all(months.map(async (month, idx) => {
      const monthNum = (idx + 1).toString().padStart(2, '0');
      const start = `2024-${monthNum}-15T00:00:00Z`;
      const end = `2024-${monthNum}-16T00:00:00Z`;

      const response = await fetch(
        `https://api.watttime.org/v3/historical?region=CAISO_NORTH&signal_type=co2_moer&start=${start}&end=${end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return { month, hours: [] };

      const json = await response.json();
      const hours = averageByPTHour(json.data);

      return { month, hours };
    }));

    res.json(monthlyAverages);
  } catch (error: any) {
    console.error("Error fetching monthly averages:", error);
    res.status(500).json({ error: error.message || "Failed to fetch monthly averages" });
  }
});

app.get("/api/emissions", async (req, res) => {
  try {
    const token = await getWattTimeToken();

    const forecastRes = await fetch(
      "https://api.watttime.org/v3/forecast?region=CAISO_NORTH&signal_type=co2_moer",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const forecastJson = await forecastRes.json();

    const now = new Date();
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const historyRes = await fetch(
      `https://api.watttime.org/v3/historical?region=CAISO_NORTH&signal_type=co2_moer&start=${sixDaysAgo.toISOString()}&end=${now.toISOString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const historyJson = await historyRes.json();

    const historyData = processWattTimeData(historyJson.data || [], 'history');
    const forecastData = processWattTimeData(forecastJson.data || [], 'forecast');
    const combinedData = combineAndFilterData(historyData, forecastData, now);

    res.json({
      data: combinedData,
      source: "watttime"
    });
  } catch (error: any) {
    console.error("Error fetching emissions:", error);
    res.status(500).json({ error: error.message || "Failed to fetch emissions" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
