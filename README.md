# ChainTicket Final Candidate (Amoy-first)

ChainTicket is a programmable ticketing stack with:

- primary NFT mint
- capped resale marketplace
- one-time on-chain check-in
- collectible mode post-event
- fan-first antifraud UX

This repo now contains:

- smart contracts (`contracts/`)
- frontend app-first React client (`frontend/`)
- read-focused BFF + Postgres indexer (`bff/`)

## Smart Contract Architecture

Contracts:

1. `TicketNFT` (mint, wallet cap, transfer restrictions, pause, collectible mode)
2. `Marketplace` (list/cancel/buy with 95/5 split)
3. `CheckInRegistry` (scanner role + mark used)

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

Deployment supports an optional governance handoff to a multisig or timelock via the variables in `.env.example`.

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

### 3) BFF (Node/Express + Postgres)

```bash
cd bff
npm install
cp .env.example .env
npm run dev
```

The BFF indexes on-chain events block-by-block and serves versioned read APIs:

- `GET /v1/health`
- `GET /v1/metrics`
- `GET /v1/system`
- `GET /v1/listings?sort=price_asc|price_desc|recent&limit=&offset=`
- `GET /v1/market/stats`
- `GET /v1/users/:address/tickets`
- `GET /v1/tickets/:tokenId/timeline`
- `GET /v1/events/stream` (SSE)

Rate-limit protection is built in:

- adaptive batch shrinking on RPC 429/1015
- exponential backoff with jitter
- optional hard stop after repeated rate-limit failures (`INDEXER_STOP_ON_MAX_RATE_LIMIT`)
- indexer runtime status visible in `GET /v1/health`
- Prometheus-style operational metrics visible in `GET /v1/metrics`

## Docker (recommended local stack)

If Docker Desktop is installed, run:

```bash
docker compose up --build
```

This starts:

- `postgres` on `localhost:5432`
- `bff` on `localhost:8787`

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
- Frontend keeps direct RPC fallback when BFF is unavailable.
- Root `index.html` remains a lightweight debug page (not production UX).
