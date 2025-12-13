# NFT Minter (Tolk)

A TON NFT minting system with signature-based authorization. Users can mint NFTs only with a valid signature from the service.

## Architecture

```
User Wallet
    │
    ▼ (1) Deploy + Mint
┌─────────────┐
│ MinterItem  │ ── verifies signature, checks owner
└─────────────┘
    │
    ▼ (2) Internal mint request
┌─────────────┐
│   Minter    │ ── verifies sender address
└─────────────┘
    │
    ▼ (3) Deploy NFT
┌─────────────┐
│ Collection  │ ── deploys NFT item
└─────────────┘
```

## Project Structure

```
├── contracts/
│   ├── nft_minter/       # Minter & MinterItem contracts (Tolk)
│   └── 02_nft/           # NFT Collection & Item contracts
├── wrappers/             # TypeScript contract wrappers
├── tests/                # Jest tests with gas analysis
├── scripts/              # Deployment scripts
└── service/              # Demo signing service (Node.js API)
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build Contracts

```bash
npx blueprint build --all
```

### 3. Run Tests

```bash
npm test
```

## Deployment Guide

### Step 1: Generate Service Keys

```bash
cd service
npx ts-node index.ts keys
```

Save the public key - you'll need it for Minter deployment.

### Step 2: Deploy NFT Collection

```bash
npx blueprint run deployNftCollection --testnet
```

Save the collection address.

### Step 3: Deploy Minter

```bash
COLLECTION_ADDRESS=EQxxxxx npx blueprint run deployMinter --testnet
```

### Step 4: Transfer Collection Ownership to Minter

Transfer the NFT collection admin rights to the Minter contract address:

```bash
COLLECTION_ADDRESS=EQxxxxx MINTER_ADDRESS=EQyyyyy npx blueprint run transferCollectionOwnership --testnet
```

## Demo Service

### Configuration

Copy `.env.example` to `.env` in the `service/` folder:

```bash
cd service
cp .env.example .env
```

Edit `.env`:

```env
NETWORK=testnet
TONCENTER_API_KEY=your_api_key
MINTER_ADDRESS=EQxxxxx
COLLECTION_ADDRESS=EQxxxxx
START_TIME=1234567890
DEFAULT_PRICE=1
PORT=3000
```

### Start Service

```bash
cd service
npx ts-node index.ts serve
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/info` | Service info & public key |
| POST | `/sign` | Sign NFT and get mint data |
| POST | `/calculate-address` | Calculate MinterItem address |
| POST | `/verify-deployment` | Check if contract deployed |
| POST | `/batch-sign` | Sign multiple NFTs |

### Example: Request Signed NFT

```bash
curl -X POST http://localhost:3000/sign \
  -H "Content-Type: application/json" \
  -d '{
    "ownerAddress": "EQxxxxx",
    "metadataUrl": "https://example.com/nft/1.json",
    "price": "1"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "minterItemAddress": "EQxxxxx",
    "stateInit": "base64...",
    "messageBody": "base64...",
    "signature": "hex...",
    "price": "1000000000",
    "priceFormatted": "1.00 TON",
    "metadataUrl": "https://example.com/nft/1.json",
    "ownerAddress": "EQxxxxx",
    "dataHash": "hex..."
  }
}
```

### Test Minting via Service

With the service running, test the full mint flow:

```bash
# Terminal 1: Start the service
cd service && npx ts-node index.ts serve

# Terminal 2: Run the test script
METADATA_URL=https://example.com/nft/1.json PRICE=1 npx blueprint run testMintViaService --testnet
```

### Client Integration Example

See `service/client-example.ts` for a complete example:

```typescript
import { requestSignedNft, executeMint } from './client-example';

// 1. Request signed data from service (price is optional, defaults to service config)
const mintData = await requestSignedNft(walletAddress, metadataUrl, '1'); // 1 TON

// 2. Send transaction from user wallet (value = price + gas buffer)
await executeMint(client, wallet, secretKey, mintData);
```

## Gas Costs

| Operation | Cost |
|-----------|------|
| Minter Deploy | ~0.00014 TON |
| MinterItem Deploy + Mint | ~0.0017 TON |
| Minter Process | ~0.0021 TON |
| Full Mint Flow | ~0.0073 TON |
| Admin Claim | ~0.0028 TON |

**Recommended mint transaction value: ~0.12 TON** (includes NFT deploy amount + reserves)

## Fee Constants

Defined in `contracts/nft_minter/fees-management.tolk`:

```tolk
const MIN_TONS_FOR_STORAGE: int = ton("0.02");
const MINTER_MIN_RESERVE: int = ton("0.05");
const NFT_DEPLOY_AMOUNT: int = ton("0.05");
```

## Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| 201 | ERROR_MINT_NOT_ALLOWED | Mint before start time |
| 202 | ERROR_NOT_OWNER_TRYING_TO_MINT | Wrong sender address |
| 203 | ERROR_NOT_ENOUGH_FUNDS_TO_MINT | Insufficient funds (less than price) |
| 204 | ERROR_MINTED_ALREADY | NFT already minted |
| 205 | ERROR_SIGNATURE_INVALID | Invalid service signature |
| 206 | ERROR_MINT_ITEM_ADDRESS_MISMATCH | Wrong MinterItem address |
| 207 | ERROR_NOT_ADMIN | Not admin for claim |
| 208 | ERROR_NOT_ENOUGH_BALANCE | Insufficient balance for claim |

## Admin Functions

### Claim Accumulated TON

The admin can claim accumulated TON from the Minter contract (keeps 0.05 TON reserve):

```typescript
await minter.sendAdminClaim(admin.getSender(), toNano('0.05'));
```

## License

MIT
