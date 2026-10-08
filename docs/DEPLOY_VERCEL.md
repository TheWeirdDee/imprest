# Deploying the web app to Vercel

The web app (`web/`) deploys as a normal Next.js project. Nothing secret goes to Vercel:
the site only reads public chain data and sends transactions the user signs with their own
passkey.

## Project settings

| Setting | Value |
| --- | --- |
| Import | `github.com/TheWeirdDee/imprest` |
| Framework preset | Next.js |
| Root Directory | `web` |
| Include files outside the Root Directory | **On** (the build reads `packages/core`, `config/`, `proof/`, `docs/`) |
| Install Command | leave default (pnpm is detected from `pnpm-lock.yaml`) |
| Build Command | leave default (`next build`) |
| Node.js version | 22.x |
| Cost | Hobby plan: $0. A `*.vercel.app` address is included; no domain needed. |

## Environment variables

Add these under Project → Settings → Environment Variables (Production and Preview):

| Name | Value | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_IMPREST_ENV` | `testnet` | Selects the Monad testnet block of `config/networks.json`. Required. |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Makes Vercel use the repo's pinned pnpm 11 (`packageManager` in `package.json`). |
| `NEXT_TELEMETRY_DISABLED` | `1` | Optional. |

Leave these **unset** for now. Each one points at a service that runs on the owner's PC, and
a public website cannot reach `localhost`:

| Name | Effect when unset |
| --- | --- |
| `NEXT_PUBLIC_RELAYER_URL` | The order ticket uses "Self (pay gas)": the user's passkey account pays testnet MON gas. The status page shows "Relayer: not configured". |
| `KEEPER_HEALTH_URL` | The status page shows "Keeper: not configured". The keeper keeps working wherever it runs; it does not need the website. |
| `NEXT_PUBLIC_INDEXER_URL` | History uses a bounded RPC scan and says "Indexer unavailable — blockchain data may be delayed". |
| `NEXT_PUBLIC_PASSKEY_RP_ID` | Passkeys bind to the site's own hostname (for example `imprest.vercel.app`). That is correct for a single deployment. |

**Never add a private key to Vercel.** `DEPLOYER_`, `OPERATOR_`, `TREASURY_`, `RELAYER_` and
`KEEPER_PRIVATE_KEY` belong only on the machine running those services.

## What users should know after deploying

- Passkeys are tied to the website address. An account created on `localhost` does not exist
  on the Vercel address; users create a new one there.
- Without a public relayer, a new account needs a little testnet MON for gas. The dashboard's
  faucet button gives testnet AUSD only; MON comes from the Monad testnet faucet.

## Optional later: public relayer and indexer

To enable gasless trades and the indexer on the public site, the relayer (port 8787) and the
indexer GraphQL endpoint (port 8080) must be reachable over HTTPS from the internet. That
means a small server (a VPS, Railway or Fly.io), or a tunnel from the owner's PC. Then set
`NEXT_PUBLIC_RELAYER_URL`, `KEEPER_HEALTH_URL` and `NEXT_PUBLIC_INDEXER_URL` to those HTTPS
URLs and redeploy.

Security implications:

- The relayer can only submit intents the trader signed. The desk contract re-checks the signature, nonce and deadline.
- The relayer's wallet pays gas, so keep its per-trader quota and gas cap on (`RELAYER_QUOTA_PER_TRADER_PER_MIN`, `RELAYER_MAX_GAS`).

This is optional and not set up. Nothing has been bought.
