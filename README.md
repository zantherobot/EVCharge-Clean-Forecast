# EcoCharge CAISO — Clean EV Charging Advisor

EcoCharge CAISO is a real-time dashboard that helps California EV owners charge when the grid is cleanest. It pulls marginal carbon emissions data from the [WattTime API](https://watttime.org/) for the CAISO North region and recommends optimal charging windows based on forecasted grid conditions.

## What It Does

- **Real-time emissions forecast** — Shows current and projected marginal carbon intensity (lbs CO₂/MWh) for the CAISO North grid, with history and 24-hour forecast.
- **Optimal charging windows** — Sliding-window algorithm finds the lowest-emissions contiguous block for your selected charge duration (2h, 4h, 8h, or 12h).
- **Charge/wait recommendation** — Green "good to charge" or amber "wait if you can" based on how current conditions compare to the optimal window.
- **Monthly emissions profiles** — Typical 24-hour patterns for each month, with seasonal insights to help plan recurring charging schedules.
- **Fuel source estimation** — Maps grid intensity to marginal fuel type (Solar/Wind, Hydro/Mix, Natural Gas, Peaker Plant).

All times are displayed in Pacific Time. See [SPEC.md](SPEC.md) for the full product specification.

## Tech Stack

| Layer     | Technology |
|-----------|------------|
| Backend   | Express + TypeScript (Node.js) |
| Frontend  | React 19 + Recharts + Tailwind CSS |
| Bundler   | Vite |
| Data      | WattTime API v3 (CAISO_NORTH, co2_moer) |
| AI        | Google Gemini |
| Hosting   | Railway (staging + production) |
| Tests     | Vitest |

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
cp .env.example .env   # fill in WATTTIME_USER, WATTTIME_PASSWORD, GEMINI_API_KEY
npm run dev
# Visit http://localhost:3000
```

## Tests

```bash
npm run lint    # TypeScript type-check
npm test        # Vitest unit tests
```

## About

Originally built by [Henry White](https://www.linkedin.com/in/henry-a-white/) in [Google AI Studio](https://aistudio.google.com/), then developed further with [Claude Code](https://claude.ai/code). Deployed on [Railway](https://railway.app/).
