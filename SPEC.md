# SPEC.md — EV Charging Clean Forecast Product Specification

EV Charging Clean Forecast is a web dashboard that helps EV owners in California charge their vehicles when the electrical grid is cleanest. It uses forecasted **marginal carbon emissions** data from the [WattTime API](https://watttime.org/) (CAISO_NORTH region) to recommend optimal charging windows.

## Architecture

- **Backend:** Express server (`server.ts`) providing REST API endpoints, with Vite dev middleware in development and static file serving in production.
- **Frontend:** Single-page React app (`src/App.tsx`) with Recharts visualizations and Tailwind CSS styling.
- **Data Source:** WattTime API v3 — marginal operating emissions rate (MOER) for CAISO_NORTH.

## Data Flow

1. Server authenticates with WattTime using Basic Auth (username/password from env vars).
2. WattTime returns a bearer token, cached for 25 minutes.
3. API route fetches 72-hour forecast data using that token.
4. Frontend fetches from the Express API and renders charts and recommendations.

---

## Backend API

### Authentication: WattTime Token Management

- Credentials are read from `WATTTIME_USER` and `WATTTIME_PASSWORD` environment variables.
- If either is missing, requests fail with a descriptive error (never exposes credentials).
- Token is cached in memory. A new token is fetched only when the cached one is expired (25-minute TTL).
- Auth endpoint: `GET https://api.watttime.org/login` with Basic Auth header.

### `GET /api/emissions`

Returns 72-hour forecast marginal emissions data for CAISO_NORTH.

**Response shape:**
```json
{
  "data": [
    {
      "timestamp": "2024-03-15T08:00:00Z",
      "intensity": 350,
      "marginalFuel": "Natural Gas",
      "type": "forecast"
    }
  ],
  "source": "watttime"
}
```

**Behavior:**
1. Fetches 72-hour forecast from `GET /v3/forecast?region=CAISO_NORTH&signal_type=co2_moer&horizon_hours=72`.
2. Each data point is enriched with a `marginalFuel` label (see Fuel Estimation below).
3. All points are tagged `type: "forecast"`.
4. Data is returned as-is from WattTime (at 5-minute intervals), sorted by timestamp ascending.

**Error handling:** Returns `{ "error": "<message>" }` with HTTP 500.

### `GET /api/monthly-averages`

Returns typical hourly emissions profiles for each month, based on a representative mid-month day from 2024 WattTime historical data.

> **Note:** This endpoint is still active but the Monthly Averages view is currently hidden in the frontend. The code is preserved for future use.

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

### Data Interval Detection: `detectIntervalMinutes(data)`

Detects the interval between consecutive data points by comparing the first two timestamps. WattTime typically returns 5-minute intervals. Falls back to 60 minutes if fewer than 2 points.

---

## Frontend

### Forecast View (Default — Only Active View)

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
- **Automatically detects the data interval** (e.g. 5 minutes) and converts the selected charge duration (in hours) to the correct number of data points.
- Finds the contiguous window with the lowest average intensity.
- Displays: start time (day + time in PT), average intensity, and percentage cleaner than current intensity.
- If insufficient future data points for the requested duration, no recommendation is shown.

#### Emissions Forecast Chart
- Recharts `AreaChart` showing intensity over time for the selected day.
- X-axis: time of day in Pacific Time (e.g., "3 PM").
- Y-axis: lbs CO₂/MWh.
- Green area fill with gradient.
- Tooltip shows: time (PT), intensity, and marginal fuel type.
- If the optimal window starts on the selected day, a dashed reference line marks the best start time.
- **Cheapest Rate Highlight:** A blue shaded `ReferenceArea` covers the 12am–3pm window, labeled "Cheapest Rate (12am–3pm)", indicating the super off-peak TOU electricity rate period.

#### Day Selector
- Tabs for each available day in the dataset (up to 3 days from the 72-hour forecast).
- Defaults to today (if data exists for today), otherwise the last available day.
- Days are derived from data timestamps converted to Pacific Time.

#### Methodology Card
- Dark card explaining that the dashboard uses marginal carbon emissions from the WattTime API.
- Links to [WattTime](https://watttime.org/) and their [methodology validation page](https://watttime.org/data-science/methodology-validation/).

### Monthly Averages View (Hidden — Code Preserved)

The Monthly Averages view toggle is hidden in the UI but all code is preserved for future re-enablement. It includes:

- Month selector (Jan–Dec buttons)
- 24-hour emissions profile chart per month
- Seasonal insight text
- Month stats (daily average, best hour)

### App States

1. **Loading** — Spinner with "Analyzing grid patterns..." text.
2. **Error** — Red alert card with error message and "Try Again" button that re-fetches.
3. **Empty Data** — Info card with "No data available" message and "Refresh" button.
4. **Normal** — Full dashboard with forecast view.

### Footer

Displays: "Built by Henry White" (LinkedIn link) and "Source Code" (GitHub link).

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
| `WATTTIME_USER`     | Yes      | WattTime API username                |
| `WATTTIME_PASSWORD` | Yes      | WattTime API password                |
| `PORT`              | No       | Server port (default: 3000)          |
| `NODE_ENV`          | No       | `"production"` for static serving    |
