# Rate Limiter Dashboard

A local developer dashboard for creating gateway keys, attaching request policies, exercising five in-process rate limiting algorithms, and inspecting the resulting SQLite request and audit records.

## Design

- Palette: warm gray canvas, white surfaces, forest green accents, restrained red for blocked traffic.
- Typography: DM Sans for interface text and DM Mono for identifiers and HTTP details.
- Layout: compact desktop sidebar and top bar with responsive single-column layouts on small screens.
- Navigation: Overview, API Keys, Policies, Live Lab, Providers & Cost, Alerts, Audit Log, and Settings.
- Data visualization: request rows and measured summary cards sourced from SQLite; no synthetic chart series.

## Architecture

React + Vite + TypeScript frontend → Express REST API → API key authentication → shared limiter module → SQLite request, key, policy, and audit tables.

The Live Lab submits HTTP calls to the same `/api/gateway/*` handler used by external clients and replays stored timestamps through the shared limiter implementation. Algorithm state is held in process memory; request and administrative records are stored in SQLite.

## Requirements

- Node.js 22.9 or newer (the backend uses the built-in `node:sqlite` module and optional `.env` loading).
- npm.

## Setup and run

```sh
npm install
npm run dev
```

The frontend runs at <http://127.0.0.1:5173> and the API at <http://127.0.0.1:3001>. The API creates `data/dashboard.sqlite` on first startup. `npm run setup` installs dependencies. For a production frontend bundle run `npm run build`; serve the generated `dist/` directory with a static server and run `npm start` for the API.

## Configuration

Copy `.env.example` to `.env` if you want to set a custom `PORT` or `DATABASE_PATH`. Provider fields are placeholders only; provider connections are not implemented in this build. Do not enter real provider credentials into this application.

## Implemented pages

- `/` landing page.
- `/app` overview, backed by persisted request totals, allowed and blocked counts, measured limiter decision time, active keys, and active policies.
- `/app/keys` creates cryptographically random keys, displays a secret once, stores only a SHA-256 digest, attaches policies, rotates keys (immediately invalidating the old key), and revokes keys.
- `/app/policies` creates policies using token bucket, leaky bucket, fixed window, sliding window log, or sliding window counter.
- `/app/lab` sends actual gateway HTTP requests. Paste the key copied at creation because full secrets cannot be retrieved later.
- `/app/providers` honestly reports that provider connections and prices are not configured.
- `/app/audit` displays persisted administrative events.
- `/app/settings` reports API/database health.
- `/privacy` and `/terms` are drafts that require legal review.

Blocked-request alert rules, deduplicated trigger events, acknowledgement, immediate key rotation, and historical policy replay are implemented. Key expiration checks exist, but expiration configuration is not exposed in the UI. Provider calls/costs, forecasts, SSE, dark mode, and browser E2E are not implemented yet. They are not represented as working features in the UI.

## Gateway API

All responses are JSON. Errors use `{ "error": "message" }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API and SQLite health |
| GET | `/api/metrics/summary` | Persisted request totals and measured decision latency |
| GET | `/api/requests` | Most recent 100 gateway decisions |
| GET, POST | `/api/keys` | List safe key metadata or create and reveal a new secret once |
| PATCH | `/api/keys/:id` | Attach or detach a policy |
| POST | `/api/keys/:id/revoke` | Revoke a key |
| POST | `/api/keys/:id/rotate` | Replace a key and reveal its new secret once |
| GET, POST | `/api/policies` | List or create policies |
| DELETE | `/api/policies/:id` | Delete an unattached policy |
| GET | `/api/audit` | Latest administrative events |
| GET | `/api/alerts` | Latest triggered alert events |
| GET, POST | `/api/alerts/rules` | List or create blocked-request threshold rules |
| PATCH | `/api/alerts/rules/:id` | Update or pause a rule |
| POST | `/api/alerts/:id/acknowledge` | Acknowledge a triggered event |
| POST | `/api/lab/replay` | Replay a key's saved timestamps against an alternative policy |
| Any | `/api/gateway/*` | Authenticated, policy-limited gateway endpoint |
| Any | `/api/demo/*` | Alias of the gateway endpoint |

Send the gateway secret using `Authorization: Bearer sk_live_...` or `X-API-Key`. Allowed requests return 200. Requests rejected by policy return 429 and include `Retry-After`, `RateLimit-Policy`, `RateLimit`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Missing, invalid, revoked, or expired credentials return 401. A key without an enabled policy returns 403.

Example:

```sh
curl -i -X POST http://127.0.0.1:3001/api/gateway/example \
  -H 'Authorization: Bearer YOUR_ONE_TIME_KEY'
```

## Algorithm notes

- Token bucket refills fractional tokens at the configured rate and permits bursts up to capacity.
- Leaky bucket reduces queued water at a steady rate and rejects overflow.
- Fixed window counts requests in aligned intervals.
- Sliding window log expires individual timestamps and gives a precise rolling count.
- Sliding window counter weights the previous window and adds the current count.

The backend uses a single-process in-memory map keyed by API key and policy. The SQLite records are persistent, but limiter state is not; restarting the server resets algorithm state. This is intended for local use and is not a distributed limiter.

## Database

SQLite creates `api_keys`, `policies`, `requests`, and `audit` tables on startup. Key secrets are never persisted; only SHA-256 digests and masked prefixes are stored. Request rows include allow/block outcome, status, route, and measured limiter latency. Admin audit metadata is JSON and excludes secrets.

## Verification

```sh
npm test
npm run build
```

Unit tests exercise the five algorithms, time boundaries, and per-key isolation. A manual HTTP smoke flow can create a policy and key, attach them, send requests until HTTP 429, inspect headers and metrics, and verify revocation returns 401.

## Known limitations and security notes

- No admin authentication is provided; bind to localhost and do not expose the management API to a network.
- SHA-256 is used for randomly generated high-entropy gateway secrets; secrets are shown once.
- State is local to one Node process; multiple instances do not coordinate.
- Policy editing, expiry configuration, provider adapters, pricing, cost accounting, and usage forecasts are not included yet. Alerts currently support blocked-request thresholds only.
- Request-log pagination and retention controls are not included.
- The app has no deployment configuration. Legal and domain content are placeholders/drafts.

## Three-minute demo outline

0:00 Explain the need to bound API traffic. 0:20 Create a key and copy its one-time secret. 0:40 Create a restrictive policy and attach it on the API Keys page. 1:00 Paste the secret into Live Lab and send requests. 1:20 Show the 429 response and rate-limit headers. 1:40 Open Overview and Request activity to inspect persisted metrics and logs. 2:20 Review the five algorithm tradeoffs. 2:40 Show the provider page's honest unconfigured state and the audit log. 3:00 Explain the local Express, shared limiter, and SQLite architecture.

## Five-slide outline

1. Problem: uncontrolled API traffic and noisy failure modes.
2. Solution: locally managed policies, authenticated gateway, observable decisions.
3. Architecture: React/Vite → Express → key auth → limiter → SQLite.
4. Demo: create key → create/attach policy → allow → 429 → inspect metrics.
5. Future scope: persistent/distributed limiter state, provider adapters, alerts, replay, and forecasts.

## Judge questions

- **Why five algorithms?** They demonstrate distinct burst and rolling-window tradeoffs; all five implementations share the gateway decision path.
- **Why SQLite?** It removes local infrastructure dependencies and stores logs and configuration for a single-user local build.
- **Why not Redis?** This implementation targets a single local process; distributed coordination is future work.
- **How are keys protected?** Secrets use cryptographic randomness, are displayed once, and only SHA-256 digests are stored.
- **Are the metrics real?** Request totals and latency are read from persisted gateway records; empty values remain empty.
- **How are providers and prices handled?** Not implemented; no provider response or price is fabricated.
- **What are the current limits?** No multi-process state, admin login, expiry configuration, provider integration, or browser E2E suite. Alerts currently cover blocked-request thresholds only.

## Requirement audit

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| React UI and routes | PARTIAL | Core pages and legal routes exist; some route states and functions remain incomplete. |
| Design and copy | PASS | Local-first infrastructure design; no invented traffic claims are presented as real. |
| SQLite persistence | PASS | Keys, policies, gateway requests, and audit actions are stored locally. |
| SQLite schema and data | PASS | Configuration, real decisions, alerts, and audit events persist locally. |
| Five algorithms | PASS | Separate implementations share `server/limiter.js`; state is in-memory. |
| Gateway and 429 headers | PASS | Manual HTTP smoke flow returned 200, 429, and standard headers. |
| Key creation, one-time reveal, hash, attach, revoke | PASS | API returns secret once, stores hash, revoked key receives 401. |
| Rotation and expiry workflows | PARTIAL | Rotation immediately invalidates the old key. Expiry checks exist, but expiration configuration is not exposed in the UI. |
| Alerts and replay | PASS | Blocked-request threshold events are deduplicated/acknowledgeable; replay uses saved records and shared limiter. |
| Metrics and measured latency | PASS | Summary aggregates persisted gateway decisions; latency measures auth/policy/decision work. |
| Audit log | PASS | Key, policy, alert-rule, and acknowledgement actions are recorded. |
| Live Lab | PASS | Sends HTTP traffic to the gateway handler and replays real records. |
| Providers, pricing, cost | NOT IMPLEMENTED | UI labels providers unconfigured; no simulated provider metrics or prices shown. |
| Burn-rate forecast | NOT IMPLEMENTED | No forecast shown without configured quotas and provider usage. |
| Responsive layout, errors, accessibility | PARTIAL | Responsive navigation and data errors exist; full WCAG audit and route states remain. |
| Dark mode | NOT IMPLEMENTED | No theme switcher is included yet. |
| Secrets | PASS | Only gateway-key digests persist; test secrets do not enter output. |
| Setup and README | PASS | npm commands and local architecture are documented. |
| Legal, SEO, deployment | PARTIAL | Draft legal pages exist; canonical/domain metadata and deployment are not configured. |
| Build and algorithm tests | PASS | `npm test` and `npm run build` completed successfully. |
| Browser E2E | NOT IMPLEMENTED | No Playwright suite included. |
