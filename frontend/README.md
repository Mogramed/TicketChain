# ChainTicket Frontend (React + Vite)

ChainTicket frontend V1 lives in `frontend/` and uses a BFF-first read model on Polygon Amoy, while wallet-signed writes still go through the connected wallet provider.

## Features

- Wallet discovery with EIP-6963 + injected fallback
- BFF-first indexed reads for market, tickets, timeline, and organizer views
- Safety Cockpit (network, pause, wallet-cap, collectible, live chain feed)
- Preflight transaction engine with simulation + gas estimate before signature
- Stale listing protection on buy/cancel
- Live updates from the BFF event stream
- Ticket Proof Timeline (mint/transfer/list/sold/used/collectible events)
- Local market intelligence (floor/median/average + suggested listing price)
- Watchlist and in-app alerts for availability/price drops
- Local transaction history and explorer deep links

## Setup

```bash
cd frontend
cp .env.example .env
npm install
```

Set contract addresses in `.env`:

- `VITE_TICKET_NFT_ADDRESS`
- `VITE_MARKETPLACE_ADDRESS`
- `VITE_CHECKIN_REGISTRY_ADDRESS`

Optional:

- `VITE_DEPLOYMENT_BLOCK` must be the real positive deployment block in single-event mode
- `VITE_AMOY_RPC_URL`
- `VITE_EXPLORER_TX_BASE_URL`

Recommended on Amoy:

- set `VITE_API_BASE_URL` to your BFF
- avoid relying on the public RPC from the browser for indexed application reads

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run test:watch
npm run env:check
```

## Environment Security Guard

- `frontend/.env` must contain frontend variables only (`VITE_*`).
- Sensitive keys like `PRIVATE_KEY`, `API_KEY`, `SECRET`, `MNEMONIC` are blocked.
- Guard runs automatically before `dev`, `build`, and `test`.

## Testing scope

- Unit tests: formatting and error mapping
- Integration tests: `chainTicketClient` behavior with mocked bindings
- UI smoke test: connect, mint, list, buy, used ticket display
