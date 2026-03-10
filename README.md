# ChainTicket V1 (Amoy Testnet)

ChainTicket V1 is a public testnet MVP focused on programmable ticketing:

- primary mint on ERC-721
- max 2 tickets held simultaneously per wallet
- controlled resale through an official marketplace only
- organizer fee of 5% on each resale
- one-time on-chain check-in
- post-event collectible mode (same NFT, different metadata base URI)

This version targets Polygon Amoy (`chainId 80002`) and uses POL for gas and payments.

## Architecture

The system is split into 3 contracts:

1. `TicketNFT`
2. `Marketplace`
3. `CheckInRegistry`

### TicketNFT

- primary sale (`mintPrimary`)
- wallet cap (`maxPerWallet = 2`)
- transfer lock: wallet-to-wallet transfers are blocked
- transfers only through the configured marketplace
- used tickets are non-transferable
- admin pause and collectible mode toggle

### Marketplace

- non-custodial listing + approval flow
- resale cap: price cannot exceed `primaryPrice`
- automatic split on purchase:
  - 5% organizer fee to treasury
  - 95% to seller
- blocks listing and buying when system is paused

### CheckInRegistry

- scanner role management
- on-chain direct check-in (`markUsed`)
- one ticket can be marked used only once
- blocks check-in when system is paused

## Prerequisites

- Node.js 18+ (recommended 20+)
- MetaMask (for manual testnet checks)
- Funded Amoy wallet (POL faucet)
- Installed dependencies:

```bash
npm install
```

## Environment setup

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

If `cp` is unavailable on your shell, create `.env` manually from the example.

## NPM scripts

```bash
npm run compile
npm test
npm run deploy:amoy
npm run demo:amoy
npm run demo:local
```

## Deploy to Amoy

```bash
npm run deploy:amoy
```

The deploy script does:

1. deploy `TicketNFT`
2. deploy `CheckInRegistry`
3. deploy `Marketplace`
4. wire addresses (`setCheckInRegistry`, `setMarketplace`)
5. grant scanner roles from `SCANNER_ADDRESSES`

It prints deployed addresses and Polygonscan links.

## Demo script (E2E)

Before running the demo script, set these vars in `.env`:

- `TICKET_NFT_ADDRESS`
- `MARKETPLACE_ADDRESS`
- `CHECKIN_REGISTRY_ADDRESS`

Run:

```bash
npm run demo:amoy
```

The script demonstrates and validates:

1. primary mint success
2. wallet limit rejection on third mint
3. listing + secondary purchase
4. 95/5 resale split check
5. one-time check-in (second scan rejected)
6. collectible mode switch and updated `tokenURI`

## Local demo (no faucet needed)

If Amoy faucet is empty/rate-limited, you can still run the complete flow locally:

```bash
npm run demo:local
```

This deploys contracts on the in-memory Hardhat network and runs the same business flow.

## Test coverage

`npm test` covers:

- primary mint success and failures
- max supply
- max wallet holdings
- direct transfer blocking
- listing ownership checks
- used-ticket resale blocking
- resale payment split and ownership transfer
- buyer cap on secondary market
- scanner auth and one-time check-in
- pause/unpause behavior across mint/list/buy/check-in
- collectible metadata switch

## Main files

- `contracts/TicketNFT.sol`
- `contracts/Marketplace.sol`
- `contracts/CheckInRegistry.sol`
- `scripts/deploy.ts`
- `scripts/demo.ts`
- `test/ChainTicketV1.ts`
