# ChainTicket Final Candidate (Amoy-first)

ChainTicket is a programmable ticketing stack with:

- primary NFT mint
- capped resale marketplace
- one-time on-chain check-in
- collectible mode post-event
- fan-first antifraud UX
- multi-event deployment catalog

This repo now contains:

- smart contracts (`contracts/`)
- frontend app-first React client (`frontend/`)
- read-focused BFF + Postgres indexer (`bff/`)

## Smart Contract Architecture

Contracts:

1. `TicketNFT` (mint, wallet cap, transfer restrictions, pause, collectible mode)
2. `Marketplace` (list/cancel/buy with 95/5 split)
3. `CheckInRegistry` (scanner admin role, scanner role, one-time mark used)
4. `ChainTicketFactory` (on-chain registry for multiple event deployments)

Target chain for launch: Polygon Amoy (`chainId 80002`).

## Quick Start

### 1) Contracts

```bash
npm install
npm run compile
npm test
```

Useful scripts:

- `npm run deploy:amoy`
- `npm run demo:amoy`
- `npm run demo:local`
- `npm run demo:lineup:prepare`
- `npm run demo:lineup:deploy`
- `npm run demo:assets:sync`

Deployment supports an optional governance handoff to a multisig or timelock via the variables in `.env.example`.
The deploy script can also publish the deployed event into `ChainTicketFactory` using `EVENT_ID`, `DEPLOY_CHAIN_TICKET_FACTORY`, and/or `CHAIN_TICKET_FACTORY_ADDRESS`.

Recommended production posture:

- keep `DEFAULT_ADMIN_ROLE` behind a multisig or timelock
- assign `PAUSER_ROLE` to operational safety wallets
- assign `SCANNER_ADMIN_ADDRESSES` to venue-operations wallets that manage scanner access
- assign `SCANNER_ADDRESSES` to venue devices/wallets that perform check-ins

When `TIMELOCK_ENABLED=true`, the deploy script requires at least one `PAUSER_ADDRESSES` and one `SCANNER_ADMIN_ADDRESSES` entry before handing off admin rights.

### 2) Frontend (React + Vite)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Main routes:

- `/app/fan`
- `/app/market`
- `/app/tickets`
- `/app/tickets/:id`
- `/app/scanner`
- `/app/organizer`
- `/settings`

Frontend env is strictly `VITE_*` only and checked on `dev/build/test`.
On Amoy, the recommended mode is BFF-first: keep `VITE_API_BASE_URL` configured so indexed reads come from the backend instead of the browser calling the public RPC.
If you wire single-event contract addresses directly, `VITE_DEPLOYMENT_BLOCK` must be the real positive deployment block for that event.
Set `VITE_GOVERNANCE_TIMELOCK_ADDRESS`, `VITE_GOVERNANCE_MIN_DELAY_SECONDS`, and optionally `VITE_GOVERNANCE_PORTAL_URL` to let the organizer cockpit generate copy-ready timelock or multisig governance packets for collectible-mode changes.

### 3) BFF (Node/Express + Postgres)

```bash
cd bff
npm install
cp .env.example .env
npm run dev
```

The BFF indexes every event deployment registered in the current catalog block-by-block and serves versioned read APIs:

- `GET /demo-assets/:ticketEventId/:variant/:tokenId.json`
- `GET /demo-assets/:ticketEventId/:variant/:tokenId.svg`
- `GET /v1/health`
- `GET /v1/metrics`
- `GET /v1/events`
- `GET /v1/ops/summary`
- `GET /v1/system`
- `GET /v1/listings?sort=price_asc|price_desc|recent&limit=&offset=`
- `GET /v1/market/stats`
- `GET /v1/users/:address/tickets`
- `GET /v1/tickets/:tokenId/timeline`
- `GET /v1/events/stream` (SSE)

For the investor demo lineup:

- `npm run demo:lineup:prepare` fetches a staged 5-event Ticketmaster-inspired lineup and stores it in Postgres
- `npm run demo:lineup:deploy` deploys the staged lineup through the existing `deploy:amoy` flow, then promotes it as the active catalog
- `npm run demo:assets:sync` updates the already-deployed demo events so their on-chain `tokenURI` bases point at the local BFF-hosted metadata and SVG artwork
- `GET /v1/events` now merges the active on-chain deployments with the stored editorial metadata: date, venue, city, country, image, category, and demo disclaimer

For local demo visuals, set the demo deployment roots in `.env` to `http://localhost:8787/demo-assets/`. Existing deployed demo events can be migrated to these live metadata routes with `npm run demo:assets:sync`.

Single-event mode now requires a real positive `DEPLOYMENT_BLOCK` whenever `TICKET_NFT_ADDRESS`, `MARKETPLACE_ADDRESS`, and `CHECKIN_REGISTRY_ADDRESS` are configured. The BFF will fail fast at startup if that boundary is missing.

Rate-limit protection is built in:

- adaptive batch shrinking on RPC 429/1015
- exponential backoff with jitter
- optional hard stop after repeated rate-limit failures (`INDEXER_STOP_ON_MAX_RATE_LIMIT`)
- indexer runtime status visible in `GET /v1/health`
- Prometheus-style operational metrics visible in `GET /v1/metrics`

Operational readiness additions:

- `/v1/health` now reports `degraded`, active alerts, lag, indexer staleness, `configuredDeploymentBlock`, and `readModelReady`
- `/v1/metrics` exposes indexer backoff/stall gauges and HTTP latency histograms
- `/v1/events` exposes the indexed event catalog, with on-chain fallback during bootstrap
- `/v1/ops/summary` exposes active role assignments and recent admin activity for the selected event
- all read endpoints accept `eventId` so the frontend can stay on the BFF across multiple events
- BFF health thresholds are configurable via `HEALTH_*` values in `bff/.env.example`
- ready-to-import ops assets live under `bff/ops/` for Grafana + Prometheus alerting

For Amoy, prefer a dedicated backend RPC in `AMOY_RPC_URL`. The frontend no longer relies on the public RPC for indexed application reads when `VITE_API_BASE_URL` is set.

## Docker (recommended local stack)

If Docker Desktop is installed, run:

```bash
docker compose up --build
```

This starts:

- `postgres` on `localhost:5432`
- `bff` on `localhost:8787`

The `bff` container reads its application settings from `bff/.env`. Docker Compose overrides only the database host so the container can reach Postgres on the internal `postgres` service instead of `localhost`.

Important for the demo lineup:

- keep `FACTORY_ADDRESS` and `DEFAULT_EVENT_ID` set in `bff/.env`
- do not run `npm run bff:dev` at the same time as `docker compose up --build`, because both bind port `8787`

Frontend can consume the BFF with:

- `VITE_API_BASE_URL=http://localhost:8787`

## CI/Quality Commands

From repo root:

- `npm run frontend:ci`
- `npm run bff:test`
- `npm run bff:build`

From frontend folder:

- `npm run ci:check` (env check + lint + test + build)

## Notes

- Wallet mode remains crypto-native (no custodial auth).
- Frontend keeps wallet writes on the connected wallet provider while indexed application reads stay BFF-first.
- Root `index.html` remains a lightweight debug page (not production UX).
