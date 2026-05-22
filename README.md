# AppNation — AI Chat Backend Case Study

**Repository:** <https://github.com/Ozdal97/appNationCase>

Backend for an AI-powered chat system with a runtime **feature flagging system** at its core. Built with Node.js + TypeScript + Express + Prisma + PostgreSQL.

> **A note on scope.** The case asks for a **backend** only — three endpoints, feature flags, the design-pattern stack. I implemented exactly that under `src/`. The `client/` folder is a tiny vanilla-JS UI I added **only to make manual review easier** — flip flags from a panel and watch the same endpoint switch shape live, without juggling Postman/curl. It is **not part of the assessed work**; the backend stands on its own.

The implementation deliberately demonstrates every concept from the brief:

- **Middleware architecture** with explicit ordering (App Check → Auth → ClientType → Validation → Handler → Error)
- **Design patterns**: Singleton (Config, Logger, Database, FeatureFlagService), Repository, Service, Strategy (completion + history), Dependency Injection (composition root)
- **Feature flagging** — typed, validated, hot-reloadable, with EventEmitter change notifications
- **SSE streaming** with `start`/`thinking`/`token`/`tool_execution`/`done`/`error` events
- **Mock AI** with one mocked tool (`getCurrentWeather`)
- **Cursor-based pagination**, structured logging (pino), rate limiting, graceful shutdown
- **Unit + integration tests** (35 tests, jest + supertest) covering the flag service, strategies, all three endpoints, auth, validation, rate limit, and admin routes
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
│   ├── ai.service.ts           Mock AI (stream + complete) honouring AI_TOOLS_ENABLED
│   └── tools/weather.tool.ts   getCurrentWeather mock
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

The case explicitly allows mocked AI ("AI Completion: Can use mock responses or simple OpenAI integration" in *What You Can Simplify*). We ship both:

| Value     | Implementation        | Notes                                                            |
|-----------|-----------------------|------------------------------------------------------------------|
| `mock`    | `MockAIProvider`      | Default. Deterministic, offline, no API key.                     |
| `vercel`  | `VercelAIProvider`    | Wraps the Vercel AI SDK + `@ai-sdk/openai`. Needs `OPENAI_API_KEY`. |

`AIService` is a thin façade over the `AIProvider` interface — switching providers is one constructor argument. Nothing in the streaming/JSON strategy layer changes.

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

- Replace the in-memory rate limiter with Redis for multi-instance deployments.
- Plug in the Vercel AI SDK in `AIService` (the interface is already shaped for it).
- Add `requireFeature('STREAMING_ENABLED')` as a route-specific gate if the requirement becomes "no streaming endpoint when flag is off" rather than "JSON fallback".
- Wire `FeatureFlagService.on('change', …)` to refresh worker caches / push to clients via WS.
