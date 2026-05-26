# AppNation — AI Chat Backend Case Study

**Repository:** <https://github.com/Ozdal97/appNationCase>

Backend for an AI-powered chat system with a runtime **feature flagging system** at its core. Built with Node.js + TypeScript + Express + Prisma + PostgreSQL.

> **A note on scope.** The case asks for a **backend** only — three endpoints, feature flags, the design-pattern stack. I implemented exactly that under `src/`. The `client/` folder is a tiny vanilla-JS UI I added **only to make manual review easier** — flip flags from a panel and watch the same endpoint switch shape live, without juggling Postman/curl. It is **not part of the assessed work**; the backend stands on its own.

The implementation deliberately demonstrates every concept from the brief:

- **Middleware architecture** with explicit ordering (App Check → Auth → ClientType → Validation → Handler → Error)
- **Design patterns**: Singleton (Config, Logger, Database, FeatureFlagService), Repository, Service, Strategy (completion + history), Dependency Injection (composition root)
- **Feature flagging** — typed, validated, hot-reloadable, with EventEmitter change notifications
- **SSE streaming** with `start`/`thinking`/`token`/`tool_execution`/`done`/`error` events
- **Pluggable AI providers** — `mock` (default, offline) and `openai`, behind one interface, with tool-calling (`getCurrentWeather`)
- **Cursor-based pagination**, structured logging (pino), rate limiting, graceful shutdown
- **Unit + integration tests** (50 tests, jest + supertest) covering the flag service, strategies, all three endpoints, auth, validation, rate limit, and admin routes
- **Docker Compose** for one-command setup, including an in-browser demo client at `http://localhost:8080`

## Quick start (Docker — recommended)

```bash
cp .env.example .env
docker compose up --build
```

That brings up three services:

- `postgres` — Postgres 16
- `api`      — backend at `http://localhost:3000`, runs `prisma migrate deploy` on boot
- `client`   — demo UI at `http://localhost:8080`

Open <http://localhost:8080>: the page auto-logs-in via `POST /api/dev/login` (mock-login, guarded by `DEMO_LOGIN_ENABLED`), creates a demo user, and lists their chats. No JWT copy/paste.

If you'd rather drive the API directly with curl, mint a JWT via:

```bash
curl -X POST http://localhost:3000/api/dev/login \
     -H "Content-Type: application/json" -d '{}'
```

### Local (no Docker)

```bash
cp .env.example .env
# point DATABASE_URL at a running Postgres, then:
npm install
npm run prisma:migrate
npm run prisma:seed              # seeds + prints a JWT
npm run dev
```

## Endpoints

The three core endpoints from the brief:

| Method | Path                                | Notes |
|--------|-------------------------------------|-------|
| GET    | `/api/chats?limit=&cursor=`         | List chats. `limit` capped by `PAGINATION_LIMIT`. |
| GET    | `/api/chats/:chatId/history?cursor=`| Full or limited history per `CHAT_HISTORY_ENABLED`. |
| POST   | `/api/chats/:chatId/completion`     | SSE or JSON per `STREAMING_ENABLED`. |

Plus a handful of supporting routes added for the demo:

| Method | Path                                | Notes |
|--------|-------------------------------------|-------|
| GET    | `/health`                           | Liveness + current flag snapshot |
| POST   | `/api/chats`                        | Create a new chat (added so the demo client can seed conversations on demand) |
| GET    | `/api/admin/feature-flags`          | View flag snapshot (requires `x-admin-token`). |
| PATCH  | `/api/admin/feature-flags/:key`     | Update a single flag at runtime. |
| POST   | `/api/admin/feature-flags/reload`   | Bulk update / reload flags. |
| POST   | `/api/dev/login`                    | Mock-login; mints a JWT for the demo. Opt-in via `DEMO_LOGIN_ENABLED=true`. Refuses to run otherwise. |

### Example calls

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/dev/login \
  -H "Content-Type: application/json" -d '{}' | jq -r .data.token)

# List chats
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/chats

# Get history for a chat
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/chats/<chatId>/history

# Streaming completion (SSE)
curl -N -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"What is the weather in Istanbul?"}' \
     http://localhost:3000/api/chats/<chatId>/completion

# Flip streaming OFF at runtime — same endpoint now returns JSON
curl -X PATCH \
     -H "x-admin-token: dev-admin-token" \
     -H "Content-Type: application/json" \
     -d '{"value": false}' \
     http://localhost:3000/api/admin/feature-flags/STREAMING_ENABLED

curl -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"hi"}' \
     http://localhost:3000/api/chats/<chatId>/completion
```

### Postman collection

Prefer a GUI? Import [`postman_collection.json`](./postman_collection.json) at the repo root — every endpoint above is pre-wired with the correct headers, request bodies, and runtime variables.

- **Auto-login**: the `Auth / dev login` request runs a tiny test script that pulls `data.token` from the response and stores it in the collection-level `{{token}}` variable. Every other request authenticates from that variable, so there's no JWT to copy.
- **Auto-chatId**: `Chats / List chats` and `Chats / Create chat` both save the first/created `id` into `{{chatId}}`, so the history and completion requests work out of the box.
- **Flag flips inline**: the `Admin` folder includes ready-made PATCH requests (e.g. `STREAMING_ENABLED → false`) so you can flip a flag and immediately re-run the same completion request to see the strategy switch.

Run order on a fresh boot: `Auth / dev login` → `Chats / Create chat` → anything else.

## Architecture

```
src/
├── config/                     Singleton Config (typed env via zod)
├── core/
│   ├── database.ts             Singleton Prisma client + lifecycle
│   ├── logger.ts               Singleton pino logger
│   └── container.ts            DI composition root
├── feature-flags/
│   ├── feature-flag.service.ts Singleton FeatureFlagService (EventEmitter)
│   ├── feature-flag.types.ts   Typed registry + validators + defaults
│   └── strategies/             Completion & History strategies + factories
├── middleware/
│   ├── request-context.ts      x-request-id, start time
│   ├── app-check.ts            Firebase App Check (mock)
│   ├── auth.ts                 JWT verify
│   ├── client-detection.ts     web/mobile/desktop
│   ├── validation.ts           zod runner
│   ├── feature-flag.ts         requireFeature() guard
│   ├── rate-limit.ts           per-route, flag-driven
│   ├── logging.ts              structured request log
│   └── error-handler.ts        terminal handler + asyncHandler
├── ai/
│   ├── ai.service.ts           Façade over the active AIProvider (stream + complete)
│   ├── providers/              mock | openai (behind the AIProvider interface)
│   └── tools/weather.tool.ts   getCurrentWeather tool (mocked data source)
├── modules/
│   ├── chat/                   Controller → Service → Repository
│   ├── completion/             Controller → Service → Strategy
│   ├── admin/                  Runtime flag management
│   └── dev/                    Mock-login (opt-in via DEMO_LOGIN_ENABLED)
├── errors/app-error.ts         Domain error hierarchy
├── types/express.d.ts          Request augmentation (user, clientType, …)
├── app.ts                      Express composition
└── server.ts                   Boot + graceful shutdown

prisma/
├── schema.prisma
├── migrations/                 Initial migration (User, Chat, Message, enums, indexes)
└── seed.ts                     Demo user + sample chats + prints JWT

client/                         Vanilla HTML/JS demo client (see client/README.md)
tests/                          Jest + supertest suites
```

### Design patterns mapped to code

| Pattern | Where |
|---|---|
| **Singleton** | `Config`, `Logger`, `Database`, `FeatureFlagService` — `getInstance()` |
| **Repository** | `ChatRepository`, `MessageRepository` — pure data access, no flags |
| **Service** | `ChatService`, `CompletionService`, `AIService` — business rules |
| **Strategy** | `StreamingCompletionStrategy` vs `JsonCompletionStrategy`; `FullHistoryStrategy` vs `LimitedHistoryStrategy` |
| **Factory** | `CompletionStrategyFactory`, `HistoryStrategyFactory` — read the flag, return the strategy |
| **Dependency Injection** | `core/container.ts` is the composition root; everything else takes dependencies via constructor parameters |

### Multi-client behaviour

Client type is detected from `X-Client-Type` (or User-Agent sniff fallback) and threaded into the service layer:

- **Mobile** clients always get `LimitedHistoryStrategy` (regardless of `CHAT_HISTORY_ENABLED`) — phones don't need full scrollback.
- **Mobile** chat-list pagination is additionally capped to 15 even if `PAGINATION_LIMIT` is higher.
- **Web / Desktop / unknown** honour the flag.

Test it locally:

```bash
curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Client-Type: mobile" \
     http://localhost:3000/api/chats/<chatId>/history
# → meta.strategy === "limited"
```

### Middleware chain (per route)

Route-specific (per the brief's explicit note):

```
appCheckMiddleware → authMiddleware → clientDetectionMiddleware
  → createRateLimiter() → validate(zodSchema) → asyncHandler(controller)
```

Global wrappers (applied in `app.ts`):

```
helmet → cors → json body parser → requestContext → logging
                                              ...routes...
                                            notFound → errorHandler
```

The brief's note also mentions *feature checks* as route-specific middleware. `createRateLimiter()` is exactly that — a flag-driven (`RATE_LIMIT_PER_MINUTE`) middleware mounted per route, not globally. For hard on/off gating there's also `requireFeature(flag)` (`src/middleware/feature-flag.middleware.ts`), ready to drop into any route chain. None of the five required flags is a pure endpoint gate, though — they switch *behaviour* (SSE↔JSON, full↔limited history), which the brief asks to express via the Strategy pattern rather than by blocking the route.

### Feature flags

Registry: `src/feature-flags/feature-flag.types.ts`. Each flag has a strong type and a runtime validator. Bad values are rejected and the previous value is preserved.

| Flag | Type | Default | Behaviour |
|---|---|---|---|
| `STREAMING_ENABLED` | boolean | true | Streaming vs JSON completion (Strategy switch) |
| `PAGINATION_LIMIT` | number 10–100 | 20 | Caps chat list page size |
| `AI_TOOLS_ENABLED` | boolean | false | Routes the weather tool when prompt mentions weather |
| `CHAT_HISTORY_ENABLED` | boolean | true | Full vs last-N history (Strategy switch) |
| `RATE_LIMIT_PER_MINUTE` | number | 60 | Per-user/IP rate limit; re-read on every request |
| `CHAT_HISTORY_LIMITED_COUNT` | number | 10 | N for the limited-history strategy |

**Hot reload** — flip a flag in three ways without restarting:

1. `PATCH /api/admin/feature-flags/:key` — single flag.
2. `POST /api/admin/feature-flags/reload` — bulk update.
3. Programmatic: `featureFlags.set(...)` / `featureFlags.reload(...)`.

Adding a new flag is one-touch:

1. Add the key + type to `FeatureFlagSchema`.
2. Add a default to `FEATURE_FLAG_DEFAULTS` and a validator to `FEATURE_FLAG_VALIDATORS`.
3. Mirror the entry in `env.ts` and `AppConfig`.

That's it — `get`, `set`, `reload`, admin endpoints, and validation pick it up automatically.

### Streaming event shape

```
event: start          { chatId, timestamp }
event: thinking       { stage }
event: tool_execution { name, input, output }
event: token          { value }
event: done           { chatId, fullText, tokens, toolCalls }
event: error          { code, message }     # only on failure
```

## Configuration

All runtime config lives in `src/config/env.ts` and is validated at startup. Sensitive values (JWT secret, OpenAI key) come only from environment variables — never committed. See `.env.example` for the full list.

## Logging

Structured JSON logs via **pino**, pretty-printed in dev. Each request is logged once on completion with: `requestId`, `method`, `path`, `status`, `durationMs`, `clientType`, `userId`. Auth/App-Check headers and any `password`/`token`/`jwt` fields are redacted.

## Testing

```bash
# locally
npm test

# via Docker (no local node_modules needed)
docker compose exec api npx jest --runInBand
```

50 tests across 11 suites. Covers:
- Feature flag service: singleton, validation, change events, reload.
- Completion strategy factory: streaming vs json, tool execution on/off.
- Chat service: pagination cap, full vs limited history, mobile pagination tightening.
- Repository unit: cursor pagination edge case (lookahead pop, `nextCursor` = last returned, never the discarded row), userId scoping, `recentForContext` role filter.
- Rate limiter store: bucket counting, window expiry, key isolation.
- Integration (supertest): auth 401/200, validation 422, 404 ownership, streaming vs JSON content-types, tool gating, admin token gate, runtime PATCH, rate-limit 429, mobile-client overrides.

Not covered by automated tests (deliberate — requires live external services):
- `VercelAIProvider` against real OpenAI.
- `RedisRateLimiterStore` against a running Redis instance.

## Pluggable backends

Two seams are Strategy-pattern abstractions so reviewers can verify the case's "Open/Closed" claim:

### AI provider (`AI_PROVIDER`)

The case lets AI completion be mocked ("AI Completion: Can use mock responses or simple OpenAI integration" in *What You Can Simplify*). We ship the mock as the zero-config default **and** a real OpenAI provider:

| Value    | Implementation    | Notes                                                                       |
|----------|-------------------|-----------------------------------------------------------------------------|
| `mock`   | `MockAIProvider`  | Default. Deterministic, offline, no API key — safe for tests/CI/demos.      |
| `openai` | `OpenAIProvider`  | Live OpenAI via the Vercel AI SDK. Needs `OPENAI_API_KEY` (`OPENAI_MODEL`, default `gpt-5.4-mini`). |

`AIService` is a thin façade over the `AIProvider` interface, so switching mock↔openai is one env var; nothing in the streaming/JSON strategy layer changes. Real tool-calling (`getCurrentWeather`) is wired and gated by `AI_TOOLS_ENABLED`.

```bash
# talk to a live model
AI_PROVIDER=openai  OPENAI_API_KEY=sk-...

# or stay fully offline — no API key, deterministic responses (this is the default)
AI_PROVIDER=mock
```

No key handy, reviewing offline, or just don't want to spend tokens? Leave `AI_PROVIDER=mock` (the default) and the whole flow — streaming, tool calls, history, rate limiting — still works end-to-end against deterministic mock responses. Flip to `openai` only when you want live answers; no code or restart of the strategy layer needed beyond re-reading the env.

### Rate limiter store (`RATE_LIMIT_STORE`)

| Value     | Implementation                | Notes                                       |
|-----------|-------------------------------|---------------------------------------------|
| `memory`  | `InMemoryRateLimiterStore`    | Default, single-process.                    |
| `redis`   | `RedisRateLimiterStore`       | Multi-instance safe. Needs `REDIS_URL`.     |

Both implement the same `RateLimiterStore.hit(key, windowMs)` contract; the middleware doesn't know which is behind it. Redis store uses `INCR + EXPIRE NX` in a single pipeline so concurrent hits don't race.

## Demo client (convenience only — not part of the case)

A vanilla HTML/JS client lives under `client/`. The case asked for a backend; this UI is included **purely to make reviewing easier** — no Postman setup, no curl gymnastics, no JWT copy-paste. Brought up automatically by `docker compose up` at <http://localhost:8080>.

What it lets you do without leaving the page:

- Auto-login on load via `POST /api/dev/login` (gated by `DEMO_LOGIN_ENABLED`).
- Browse chats, see pagination metadata, open history (shows `strategy: full` vs `limited`).
- Send prompts and watch SSE `start → thinking → tool_execution → token → done` events live; flip `STREAMING_ENABLED` off and the same endpoint returns plain JSON.
- Toggle every feature flag from the right panel and see the next request behave differently — no redeploy.

If you'd rather review the backend on its own, ignore `client/` entirely — every endpoint is covered by curl examples above.

## What I'd add next

- Enforce the JWT `tier` claim (`FREE` / `STARTUP` / `ENTERPRISE`) — per-tier rate limits and feature gating. It's carried through auth today but not yet acted on.
- Persist runtime feature-flag overrides to Redis/DB so they survive a restart (today they live in memory and re-seed from env on boot).
- Default the Redis-backed rate limiter on in `docker-compose` for a real multi-instance demo — `RedisRateLimiterStore` is implemented and opt-in via `RATE_LIMIT_STORE=redis`.
- Wire `FeatureFlagService.on('change', …)` to push flag updates to connected clients over WebSocket.
