# ChainTicket Frontend (React + Vite)

ChainTicket frontend V1 lives in `frontend/` and connects directly to the deployed contracts on Polygon Amoy.

## Features

- Wallet discovery with EIP-6963 + injected fallback
- Safety Cockpit (network, pause, wallet-cap, collectible, live chain feed)
- Preflight transaction engine with simulation + gas estimate before signature
- Stale listing protection on buy/cancel
- Live updates from on-chain events + fallback polling
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

- `VITE_DEPLOYMENT_BLOCK`
- `VITE_AMOY_RPC_URL`
- `VITE_EXPLORER_TX_BASE_URL`

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
