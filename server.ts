import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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
    
    // We'll fetch 1 representative day for each month from 2024
    // and calculate hourly averages.
    const monthlyAverages = await Promise.all(months.map(async (month, idx) => {
      const monthNum = (idx + 1).toString().padStart(2, '0');
      // Using mid-month representative days from 2024
      const start = `2024-${monthNum}-15T00:00:00Z`;
      const end = `2024-${monthNum}-16T00:00:00Z`;
      
      const response = await fetch(
        `https://api.watttime.org/v3/historical?region=CAISO_NORTH&signal_type=co2_moer&start=${start}&end=${end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) return { month, hours: [] };
      
      const json = await response.json();
      const hourlyData: { [key: number]: number[] } = {};
      
      json.data.forEach((point: any) => {
        // Convert UTC to Pacific Time for the hour
        const date = new Date(point.point_time);
        const ptHour = parseInt(new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          hourCycle: 'h23',
          timeZone: 'America/Los_Angeles'
        }).format(date));
        
        if (!hourlyData[ptHour]) hourlyData[ptHour] = [];
        hourlyData[ptHour].push(point.value);
      });
      
      const hours = Object.keys(hourlyData).map(h => ({
        hour: parseInt(h),
        intensity: hourlyData[parseInt(h)].reduce((a, b) => a + b, 0) / hourlyData[parseInt(h)].length
      })).sort((a, b) => a.hour - b.hour);
      
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
    
    // 1. Fetch Forecast (usually 24h)
    const forecastRes = await fetch(
      "https://api.watttime.org/v3/forecast?region=CAISO_NORTH&signal_type=co2_moer",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const forecastJson = await forecastRes.json();
    
    // 2. Fetch History for the last 6 days
    const now = new Date();
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const historyRes = await fetch(
      `https://api.watttime.org/v3/historical?region=CAISO_NORTH&signal_type=co2_moer&start=${sixDaysAgo.toISOString()}&end=${now.toISOString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const historyJson = await historyRes.json();

    // Map and combine
    const historyData = (historyJson.data || []).map((point: any) => ({
      timestamp: point.point_time,
      intensity: point.value,
      marginalFuel: getEstimatedFuel(point.value),
      type: 'history'
    }));

    const forecastData = (forecastJson.data || []).map((point: any) => ({
      timestamp: point.point_time,
      intensity: point.value,
      marginalFuel: getEstimatedFuel(point.value),
      type: 'forecast'
    }));

    // Combine and sort
    let combinedData = [...historyData, ...forecastData].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Filter to only include data from the current hour onwards (Pacific Time)
    const currentHourStart = new Date();
    currentHourStart.setMinutes(0, 0, 0);
    
    combinedData = combinedData.filter(d => new Date(d.timestamp) >= currentHourStart);

    res.json({
      data: combinedData,
      source: "watttime"
    });
  } catch (error: any) {
    console.error("Error fetching emissions:", error);
    res.status(500).json({ error: error.message || "Failed to fetch emissions" });
  }
});

function getEstimatedFuel(intensity: number): string {
  if (intensity < 100) return "Solar/Wind";
  if (intensity < 400) return "Hydro/Mix";
  if (intensity < 700) return "Natural Gas";
  return "Peaker Plant";
}

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
