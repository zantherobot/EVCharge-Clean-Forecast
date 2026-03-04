# SPEC.md — EcoCharge CAISO Product Specification

EcoCharge CAISO is a web dashboard that helps EV owners in California charge their vehicles when the electrical grid is cleanest. It uses real-time and forecasted marginal carbon emissions data from the WattTime API (CAISO_NORTH region) to recommend optimal charging windows.

## Architecture

- **Backend:** Express server (`server.ts`) providing REST API endpoints, with Vite dev middleware in development and static file serving in production.
- **Frontend:** Single-page React app (`src/App.tsx`) with Recharts visualizations and Tailwind CSS styling.
- **Data Source:** WattTime API v3 — marginal operating emissions rate (MOER) for CAISO_NORTH.

## Data Flow

1. Server authenticates with WattTime using Basic Auth (username/password from env vars).
2. WattTime returns a bearer token, cached for 25 minutes.
3. API routes fetch forecast and historical data using that token.
4. Frontend fetches from the Express API and renders charts and recommendations.

---

## Backend API

### Authentication: WattTime Token Management

- Credentials are read from `WATTTIME_USER` and `WATTTIME_PASSWORD` environment variables.
- If either is missing, requests fail with a descriptive error (never exposes credentials).
- Token is cached in memory. A new token is fetched only when the cached one is expired (25-minute TTL).
- Auth endpoint: `GET https://api.watttime.org/login` with Basic Auth header.

### `GET /api/emissions`

Returns combined historical + forecast marginal emissions data for CAISO_NORTH.

**Response shape:**
```json
{
  "data": [
    {
      "timestamp": "2024-03-15T08:00:00Z",
      "intensity": 350,
      "marginalFuel": "Natural Gas",
      "type": "history"
    }
  ],
  "source": "watttime"
}
```

**Behavior:**
1. Fetches 24-hour forecast from `GET /v3/forecast?region=CAISO_NORTH&signal_type=co2_moer`.
2. Fetches 6-day history from `GET /v3/historical?region=CAISO_NORTH&signal_type=co2_moer&start=...&end=...`.
3. Each data point is enriched with a `marginalFuel` label (see Fuel Estimation below).
4. History points are tagged `type: "history"`, forecast points `type: "forecast"`.
5. Combined data is sorted by timestamp ascending.
6. Data is filtered to only include points from the current hour onward (using server local time, minutes/seconds zeroed).

**Error handling:** Returns `{ "error": "<message>" }` with HTTP 500.

### `GET /api/monthly-averages`

Returns typical hourly emissions profiles for each month, based on a representative mid-month day from 2024 WattTime historical data.

**Response shape:**
```json
[
  {
    "month": "January",
    "hours": [
      { "hour": 0, "intensity": 450.5 },
      { "hour": 1, "intensity": 440.2 }
    ]
  }
]
```

**Behavior:**
1. For each of the 12 months, fetches historical data for the 15th of that month (2024).
2. Converts UTC timestamps to Pacific Time hours.
3. Groups data points by Pacific Time hour and averages the intensity values.
4. Returns hours sorted ascending (0–23).
5. If a month's fetch fails, it returns `{ month, hours: [] }` for that month (does not fail the entire request).

**Error handling:** Returns `{ "error": "<message>" }` with HTTP 500.

### Fuel Estimation: `getEstimatedFuel(intensity)`

Maps a MOER intensity value (lbs CO₂/MWh) to a human-readable marginal fuel label:

| Intensity Range     | Label          |
|---------------------|----------------|
| < 100               | Solar/Wind     |
| 100–399             | Hydro/Mix      |
| 400–699             | Natural Gas    |
| ≥ 700               | Peaker Plant   |

---

## Frontend

### View Modes

The app has two view modes, toggled via header buttons:

1. **Forecast** (default) — Real-time emissions data with charging recommendations.
2. **Monthly Averages** — Historical typical daily emissions profile by month.

### Forecast View

#### Status Card
- Displays current grid intensity (lbs/MWh) from the most recent past data point.
- Shows a charge recommendation:
  - **"Good time to charge"** (green) — if current intensity ≤ 110% of the optimal window's average intensity.
  - **"Wait if you can"** (amber) — otherwise.
- Includes contextual explanation text.

#### Charge Duration Selector
- Options: 2h, 4h, 8h, 12h (default: 4h).
- Changes the window size used for optimal window calculation.

#### Optimal Charging Window (`bestWindow`)
- Uses a sliding window algorithm over future data points only (timestamp ≥ now).
- Window size = selected charge duration.
- Finds the contiguous window with the lowest average intensity.
- Displays: start time (day + time in PT), average intensity, and percentage cleaner than current intensity.
- If insufficient future data points (fewer than charge duration), no recommendation is shown.

#### Emissions Forecast Chart
- Recharts `AreaChart` showing intensity over time for the selected day.
- X-axis: time of day in Pacific Time (e.g., "3 PM").
- Y-axis: lbs CO₂/MWh.
- Green area fill with gradient.
- Tooltip shows: time (PT), intensity, and marginal fuel type.
- If the optimal window starts on the selected day, a dashed reference line marks the best start time.

#### Day Selector
- Tabs for each available day in the dataset.
- Defaults to today (if data exists for today), otherwise the last available day.
- Days are derived from data timestamps converted to Pacific Time.

#### Hourly Breakdown
- Table showing the first 12 hourly data points for the selected day.
- Each row displays: time (PT), fuel type badge (color-coded), and intensity value.
- Fuel badge colors: Solar → amber, Wind → blue, Natural Gas → zinc, other → emerald.

### Monthly Averages View

#### Month Selector
- 12 buttons (Jan–Dec), defaults to current month.
- Clicking a month loads that month's hourly profile chart.

#### Monthly Profile Chart
- Recharts `AreaChart` showing typical 24-hour emissions pattern.
- X-axis: hour of day (12am–11pm).
- Y-axis: lbs CO₂/MWh.
- Tooltip shows hour and intensity.

#### Seasonal Insight
- Text block with season-specific commentary:
  - **Spring (Mar–May):** Solar production dominance, near-zero mid-day emissions.
  - **Summer (Jun–Sep):** AC-driven peaks, steep evening ramp.
  - **Fall/Winter (Oct–Feb):** Higher morning/evening peaks, shorter solar hours.

#### Month Stats
- **Daily Avg:** Average intensity across all 24 hours.
- **Best Hour:** The hour with the lowest average intensity.

### App States

1. **Loading** — Spinner with "Analyzing grid patterns..." text.
2. **Error** — Red alert card with error message and "Try Again" button that re-fetches.
3. **Empty Data** — Info card with "No data available" message and "Refresh" button.
4. **Normal** — Full dashboard with forecast or monthly view.

### Time Zone Handling

All user-facing times are displayed in **Pacific Time (America/Los_Angeles)**, regardless of the user's local time zone. The `toPT()` helper converts UTC timestamps to PT-relative `Date` objects for formatting.

### Data Source Badge

Header shows a badge indicating data source:
- **"Live Grid"** (green) — when `source === "watttime"`.
- **"Simulated"** (gray) — otherwise.

---

## Environment Variables

| Variable            | Required | Description                          |
|---------------------|----------|--------------------------------------|
| `GEMINI_API_KEY`    | Yes      | Google Gemini AI API key             |
| `WATTTIME_USER`     | Yes      | WattTime API username                |
| `WATTTIME_PASSWORD` | Yes      | WattTime API password                |
| `APP_URL`           | No       | App's public URL (for self-referential links) |
| `PORT`              | No       | Server port (default: 3000)          |
| `NODE_ENV`          | No       | `"production"` for static serving    |
