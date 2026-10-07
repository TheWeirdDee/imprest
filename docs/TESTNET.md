# Testnet

Live on Monad testnet (chain 10143): ImprestPool `0x85fFff6B1e8e62d2cE8ACA45B69AE530C6FbF457`,
DeskFactory `0x1569EE4A7210e226db932B5B7633E63d3AC8c544`. The canonical run and its receipts
are summarized in [FINAL_AUDIT.md](FINAL_AUDIT.md). How to rerun it is in
[TESTNET_DEPLOYMENT.md](TESTNET_DEPLOYMENT.md).

## Services

| Service | Wallet | How it runs | Verified |
| --- | --- | --- | --- |
| Relayer | `0x017F46FdCC2fC946D7e1f86927Aa37267331b728` | `pnpm --filter @imprest/relayer start` (port 8787) | TESTNET VERIFIED: trader-signed intent `0xb2e83f49…665e` submitted by the relayer, filled on Perpl, position confirmed on the second RPC (`proof/receipts/testnet/graduation-attempt/01-open.json`) |
| Keeper | `0x9C4F9B38ce13A1552Aa6FCb505CfFb3E70FAFCc0` | `pnpm --filter @imprest/keeper start` (port 8788) | Running against testnet, 0 failed loops after the RPC-fallback fix. A sent action is PENDING until a desk becomes eligible for graduation or breaches a floor. The keeper never sends a call that fails simulation. |
| Indexer | none (read-only) | Envio 3.14 in WSL Ubuntu 24.04, Docker Postgres and Hasura, GraphQL at `http://localhost:8080/v1/graphql` | LOCAL: it indexes the deployed contracts from the deploy block over RPC (100-block `eth_getLogs` windows), and the canonical-run events were returned by GraphQL. Display only; it never authorizes money movement. |

### Running the indexer on Windows

Envio has no Windows binary, so it runs in WSL:

```
wsl -d Ubuntu-24.04 -u root
# once: install Node 22 and docker-compose-v2; Docker Engine already runs in this distro
# copy indexer/, config/ and contracts/out/{Desk,DeskFactory,ImprestPool}.sol and
# contracts/perpl-artifacts/Exchange.abi.json into the Linux filesystem, then:
cd /root/imprest/indexer && npm install
IMPREST_ENV=testnet node scripts/gen-config.mjs && npx envio codegen
TUI_OFF=true ENVIO_PG_PORT=5433 npx envio dev
```

Then set `NEXT_PUBLIC_INDEXER_URL=http://localhost:8080/v1/graphql` in `web/.env.local`.
When the indexer is unreachable, History switches to a bounded RPC scan and says
"Indexer unavailable — blockchain data may be delayed". The status page shows LIVE or SYNCING
with the processed block and lag.

Without `ENVIO_API_TOKEN`, the generated config syncs over the public RPC. With a token,
HyperSync is used and the RPC becomes the fallback.

## Gas on Monad (measured)

Monad charges the gas limit, not the gas used.

| Operation | Gas charged | MON at ~102 gwei |
| --- | --- | --- |
| `openDesk` (creates the Perpl account) | 5,820,284 | ~0.59 |
| Relayed trade (`tradeWithSig`) | ~698,000 | ~0.071 |
| Direct trade (fixed 1.5M limit, early runs) | 1,500,000 | ~0.153 |

Intents that fail simulation are never broadcast and cost nothing. During the graduation
attempt, 14 such intents were refused by Perpl's negative-PnL cap at 0 MON.
