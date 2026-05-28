# AI Chat Hub

Premium AI operations command center for O-Agent customer chat.

## Phase 1

- Dashboard metrics
- Conversations and review queue
- Conversation timeline
- Responder AI and Reviewer AI simulation
- Flow preview with `@xyflow/react`
- Channel management with masked token display
- Knowledge base cards
- Flow graph save/versioning
- Prompt history
- LINE and Facebook webhook mock ingest
- Apply reviewer suggestion to draft
- CORS origin whitelist, optional API key guard, body size limit, and signed production webhook routes

## Run

```bash
npm install
npm run dev:api
npm run dev
```

Local URL:

```text
http://127.0.0.1:5174/
```

Local API:

```text
http://127.0.0.1:8788/api/health
```

Webhook mock:

```bash
curl -X POST http://127.0.0.1:8788/webhook/facebook/mock \
  -H 'content-type: application/json' \
  -d '{"customer":"Test Customer","text":"ลดได้ไหม"}'

curl -X POST http://127.0.0.1:8788/webhook/line/mock \
  -H 'content-type: application/json' \
  -d '{"customer":"LINE Test","text":"ขอยกเลิกค่ะ"}'
```

If `CHAT_HUB_API_KEY` is set, protected write endpoints require:

```text
x-chat-hub-api-key: <CHAT_HUB_API_KEY>
```

Production webhook routes are:

```text
POST /webhook/facebook  # verifies x-hub-signature-256 with FACEBOOK_APP_SECRET
POST /webhook/line      # verifies x-line-signature with LINE_CHANNEL_SECRET
```

## Verify

```bash
npm test
npm run lint
npm run build
```

## Runtime Docs

- `docs/phase-1-runtime-contract.md`
- `docs/schema-phase-1.sql`
- `docs/production-handoff.md`

## Local Persistence

The API writes state to:

```text
data/runtime-state.json
```

Delete that file only when you intentionally want to reset local demo data.
