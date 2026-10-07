# Deployment

## Contracts

Testnet: follow [TESTNET_DEPLOYMENT.md](TESTNET_DEPLOYMENT.md). Mainnet uses the same script
with `IMPREST_ENV=mainnet ALLOW_MAINNET=true`, is not authorized, and needs real AUSD seed
credit; see the mainnet register in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

`Deploy.s.sol` reads every address from `config/networks.json`, checks the RPC chain id,
deploys `ImprestPool` (24 h cap-increase timelock), sets bootstrap caps (per perp: 10 desks
of 5 x minimum stake; per desk: 2 x desk size, from the paired-desk calibration), deploys
`DeskFactory` (checks the exchange's collateral is the pool asset with 6 decimals), wires
the factory, registers the `demo-v0` and `standard-v0` cohorts, and optionally hands
ownership to `IMPREST_OPERATOR`.

## Web

Any Node host: `pnpm --filter @imprest/web build && pnpm --filter @imprest/web start`. The
server reads `../proof`, `../docs` and `../config` at build/request time, so deploy the
repository, not just `web/.next`. Set `NEXT_PUBLIC_IMPREST_ENV` at build time. The PRD's
Cloudflare target needs an adapter for the file-reading proof pages (not done).

## Relayer and keeper

Node processes (`tsx`). The relayer handler is runtime-agnostic (`fetch` Request/Response)
and can be wrapped as a Cloudflare Worker; the Node adapter is `relayer/src/node.ts`.

## Indexer

Envio hosted service or self-hosted Docker; generate `config.yaml` from
`config/networks.json` with `pnpm --filter @imprest/indexer gen-config` after a deployment
is recorded.
