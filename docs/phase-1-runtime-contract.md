# AI Chat Hub Phase 1 Runtime Contract

Updated: 2026-05-28
Owner: Dex
Verifier: Boss

## Purpose

AI Chat Hub is the new product surface for the existing O-Agent Omni runtime. This repo starts as a standalone SaaS demo surface and should connect to Omni through a narrow API contract instead of copying Omni internals.

## Phase 1 Scope

- Dashboard metrics for today messages, active channels, review score, blocked replies, and latency.
- Conversations list with channel, status, risk, customer, last message, and review score.
- Conversation detail timeline:
  - Customer message
  - Responder AI draft
  - Reviewer AI score
  - Send or handoff decision
- Flow preview and test modal.
- Channels UI with masked tokens and copyable webhook URL.
- Knowledge UI for FAQ/product context.

## Backend Contract

Phase 1 can run against mock data, then swap to Omni endpoints:

```text
GET  /api/chat-hub/dashboard
GET  /api/chat-hub/conversations
GET  /api/chat-hub/conversations/:id
POST /api/chat-hub/conversations/:id/run-flow
GET  /api/chat-hub/flow-runs
GET  /api/chat-hub/channels
GET  /api/chat-hub/knowledge
GET  /api/chat-hub/flows
POST /api/chat-hub/channels
POST /api/chat-hub/knowledge
POST /api/chat-hub/flows/:id
POST /api/chat-hub/conversations/:id/apply-suggestion
POST /webhook/facebook
POST /webhook/line
POST /webhook/facebook/mock
POST /webhook/line/mock
```

Current local API implementation:

```text
GET  /api/health
GET  /api/chat-hub/state
GET  /api/chat-hub/dashboard
GET  /api/chat-hub/conversations
GET  /api/chat-hub/flow-runs
POST /api/chat-hub/conversations/:id/run-flow
POST /api/chat-hub/conversations/:id/apply-suggestion
POST /api/chat-hub/flows/:id
POST /webhook/facebook/mock
POST /webhook/line/mock
```

Local API base:

```text
http://127.0.0.1:8788
```

## Required Tables

Use existing Omni tables where possible, then add:

```text
channels
flows
reviews
flow_runs
```

`flow_runs.steps` must be JSON and include every step:

```text
customer_message -> responder_draft -> reviewer_score -> send_or_handoff
```

## Guardrails

- No token value is shown in UI.
- No test mode sends a real reply.
- Auto-send is blocked unless Reviewer score passes and risk is low.
- CORS is restricted by `CHAT_HUB_ALLOWED_ORIGINS`; do not deploy with `*`.
- Protected write endpoints require `x-chat-hub-api-key` when `CHAT_HUB_API_KEY` is configured.
- Facebook webhook POST verifies `x-hub-signature-256` on `/webhook/facebook`.
- LINE webhook POST verifies `x-line-signature` on `/webhook/line`.
- Mock webhooks are local demo routes and can be disabled with `CHAT_HUB_ENABLE_MOCK_WEBHOOKS=false`.
- LINE customer webhook is separate from existing LINE Suda group alert runtime.

## Production Path

```text
Vercel = frontend and preview
Supabase/Postgres = DB and realtime
Railway = webhook worker, queue, retry, background jobs when needed
Omni runtime = source system and AI adapter
```
