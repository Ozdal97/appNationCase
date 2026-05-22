# Demo client

Vanilla HTML/JS demo client for the AppNation chat backend. Lives in this repo for review convenience; not part of the case study scope (which was backend-only).

## Run

The root-level `docker compose up --build` already brings this up at <http://localhost:8080>. The client talks to <http://localhost:3000>.

Standalone (without docker):

```bash
node serve.js          # listens on PORT (default 8080)
```

## What it does

- Calls `POST /api/dev/login` on first load to mint a JWT for the demo user (`demo@appnation.test`, `ENTERPRISE`). The endpoint is opt-in via `DEMO_LOGIN_ENABLED=true` and refuses to run otherwise.
- Lists chats (`GET /api/chats`) with pagination metadata.
- Loads message history (`GET /api/chats/:id/history`) — shows whether the response was full or limited.
- Sends prompts (`POST /api/chats/:id/completion`):
  - If `STREAMING_ENABLED=true` reads the SSE stream and renders tokens live.
  - If `false` falls back to JSON.
- Right-panel toggles call `PATCH /api/admin/feature-flags/:key` so reviewers can flip behaviours on the fly.

## Things to try in the flag panel

- `STREAMING_ENABLED` → flip off, send a prompt — same endpoint returns plain JSON.
- `AI_TOOLS_ENABLED` → flip on, ask "What is the weather in Istanbul?" — observe the `tool_execution` event and the TOOL bubble.
- `CHAT_HISTORY_ENABLED` → flip off, pick a chat — `meta.strategy` becomes `limited`, only the last N messages load.
- `PAGINATION_LIMIT` → drop to 10 — the chat list caps at 10, `nextCursor` populates.
- `RATE_LIMIT_PER_MINUTE` → drop to 3 — the 4th request inside a minute returns 429.

## Files

```
client/
├── index.html      app shell
├── style.css
├── app.js          fetch + SSE consumer + flag-panel logic
├── serve.js        ~30-line static http server, zero deps
├── Dockerfile      node:20-alpine, runs serve.js
└── .dockerignore
```
