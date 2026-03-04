# CLAUDE.md — Developer Guide for Claude Code

This file tells Claude how to work on this repository.

## Project Structure

```
server.ts         # Express backend — API routes (CAISO, WattTime, Gemini), Vite dev middleware
src/App.tsx       # Main React component (dashboard UI, charts, AI chat)
src/main.tsx      # React entry point
src/index.css     # Tailwind CSS entry
index.html        # Vite HTML entry point
vite.config.ts    # Vite + React + Tailwind config
tsconfig.json     # TypeScript config
tests/            # Test suite
.env.example      # Required env vars (GEMINI_API_KEY, WATTTIME credentials, APP_URL)
```

## Running the App Locally

```bash
npm install
cp .env.example .env   # then fill in real keys
npm run dev
# Visit http://localhost:3000
```

## Running Tests

```bash
npm run lint           # TypeScript type-check (tsc --noEmit)
npx vitest run         # if/when vitest is added
```

All checks must pass before committing. If you add or change any logic, add corresponding tests in `tests/`.

## Development Standards

These apply to every change.

### Testing

- Every change must include or update tests covering the modified behaviour.
- All existing and new tests must pass before committing or deploying.
- API route logic, data transformations, and financial calculations must have unit tests with known-good expected outputs.
- Edge cases — missing env vars, empty API responses, malformed inputs — must be tested.

### Linting & Code Style

- TypeScript code must pass `tsc --noEmit` (`npm run lint`) with no errors before committing.
- Follow standard TypeScript/React conventions. Use consistent formatting with the existing codebase.
- CSS uses Tailwind utility classes — avoid custom CSS unless truly necessary.

### Input Validation

- All user inputs must be validated server-side, regardless of any client-side checks.
- Invalid inputs return clear, user-friendly error messages — never raw stack traces.

### No Secrets in Code

- API keys, credentials, and environment-specific config go in environment variables, never hardcoded in source files.
- The `.env.example` file documents required variables without real values.

### Small, Focused Commits

- Each commit should do one thing. Avoid mixing unrelated changes.
- Commit messages should describe *why*, not just *what*.

### Graceful Error Handling

- API failures (e.g. WattTime down, Gemini quota exceeded, bad CAISO response) must display a helpful message to the user and log the error server-side.
- The app should never show a raw error page to end users.

## Deployment & Branch Workflow

There are two environments, both hosted on Railway:

| Branch    | Environment                    | URL                  |
|-----------|--------------------------------|----------------------|
| `staging` | Staging (Railway staging env)  | Railway staging URL  |
| `main`    | Production (Railway production env) | Railway production URL |

### Default behaviour

- **All work targets `staging` by default.** Commit and push to `staging`; Railway auto-deploys.
- **Never push or merge to `main` without explicit instruction.** Production is only updated when the user asks to promote, or confirms after being asked.

### Promoting staging → production

When asked (or after asking "Ready to promote to production?"):

1. Ensure all checks pass on `staging`.
2. Open and merge a PR from `staging` → `main` — Railway auto-deploys production.

```bash
gh pr create --base main --head staging \
  --title "Promote staging → production" --body ""
gh pr merge --merge
# gh leaves you on staging automatically
```

### Typical feature workflow

```
work on staging branch
       │
       ▼  git push origin staging
   staging  ──► auto-deploys to Railway staging env
       │
       │  (user confirms ready for production)
       ▼  gh pr create + gh pr merge
     main  ──► auto-deploys to Railway production env
```

### Branch protection

`main` has GitHub branch protection enabled: direct pushes are blocked,
all changes must arrive via PR (no approvals required for solo use).
