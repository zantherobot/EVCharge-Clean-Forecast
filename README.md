# EV Charging Clean Forecast

A real-time dashboard that helps California EV owners charge when the grid is cleanest. It pulls **marginal carbon emissions** data from the [WattTime API](https://watttime.org/) for the CAISO North region and recommends optimal charging windows based on forecasted grid conditions.

## What It Does

- **Real-time emissions forecast** — Shows current and projected marginal carbon intensity (lbs CO₂/MWh) for the CAISO North grid, combining 6 days of history with a 24-hour forecast.
- **Optimal charging windows** — Sliding-window algorithm finds the lowest-emissions contiguous block for your selected charge duration (2h, 4h, 8h, or 12h).
- **Charge/wait recommendation** — Green "good to charge" or amber "wait if you can" based on how current conditions compare to the optimal window.
- **Cheapest rate highlight** — The 12am–3pm window is highlighted on the chart as the cheapest electricity rate period (super off-peak TOU).
- **Fuel source estimation** — Maps grid intensity to estimated marginal fuel type (Solar/Wind, Hydro/Mix, Natural Gas, Peaker Plant).
- **Day-by-day navigation** — Browse forecasts and history across a 7-day window with day selector tabs.

All times are displayed in **Pacific Time**. See [SPEC.md](SPEC.md) for the full product specification.

## Tech Stack

| Layer     | Technology |
|-----------|------------|
| Backend   | Express + TypeScript (Node.js) |
| Frontend  | React 19 + Recharts + Tailwind CSS v4 |
| Bundler   | Vite |
| Data      | [WattTime API v3](https://watttime.org/) (CAISO_NORTH, co2_moer) |
| Hosting   | [Railway](https://railway.app/) (staging + production) |
| Tests     | Vitest |

## Run Locally

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/zantherobot/EVCharge-Clean-Forecast.git
cd EVCharge-Clean-Forecast
npm install
cp .env.example .env   # fill in WATTTIME_USER, WATTTIME_PASSWORD
npm run dev
# Visit http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WATTTIME_USER` | Yes | WattTime API username |
| `WATTTIME_PASSWORD` | Yes | WattTime API password |
| `PORT` | No | Server port (defaults to 3000) |

## Tests

```bash
npm run lint    # TypeScript type-check (tsc --noEmit)
npm test        # Vitest unit tests
```

All checks must pass before committing.

## Project Structure

```
server.ts         # Express backend — API routes, WattTime auth, Vite dev middleware
src/App.tsx       # Main React component (dashboard UI, charts)
src/shared.ts     # Shared pure functions (fuel estimation, window calculation, data processing)
src/main.tsx      # React entry point
src/index.css     # Tailwind CSS entry
index.html        # Vite HTML entry point
vite.config.ts    # Vite + React + Tailwind config (includes vitest config)
tests/            # Vitest test suite
SPEC.md           # Product specification
CLAUDE.md         # Developer guide for Claude Code
```

## About

Built by [Henry White](https://www.linkedin.com/in/henry-a-white/). Deployed on [Railway](https://railway.app/).
