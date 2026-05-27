# AI Chat Hub Production Handoff

Updated: 2026-05-28
Owner: Dex
Verifier: Boss

## Current Status

Phase 1 is local verified:

- Frontend runs on Vite.
- Local API runs on Node built-in HTTP.
- API state persists to `data/runtime-state.json`.
- `run-flow` creates reviewer output and flow run steps.
- Facebook mock webhook creates a conversation in the review queue.

## Runtime Split

```text
Frontend preview/domain: Vercel
API/webhook worker: Railway
Database: Postgres/Supabase or O-Agent managed Postgres
AI provider: O-Agent AI adapter
Source system: Omni runtime
```

## Railway Role

Railway should host only the API/webhook/worker layer when Phase 1 moves beyond local demo.

Required start command:

```bash
npm run start
```

Required env:

```text
HOST=0.0.0.0
PORT=<Railway provided>
CHAT_HUB_DATA_PATH=/data/runtime-state.json
```

Production must replace JSON persistence with Postgres before customer data is used.

## Go/No-Go

Do not call production ready until:

- Facebook POST signature verification is enforced.
- LINE Messaging API signature verification is enforced.
- Tokens are read from secret storage only.
- Postgres tables and RLS are applied.
- Reviewer pass gate blocks every auto-send path.
- Real customer sends require Boss-approved approval mode.
