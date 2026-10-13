# Hosting the relayer and indexer (owner steps)

The live website runs on Vercel. Two optional services make it complete for visitors:

- the **relayer** (gasless trading), hosted on **Railway**;
- the **indexer** (full history).

Both need an account in the owner's name, which the agent cannot create. Everything else is
prepared in the repository. Nothing here is deployed until the owner does the steps below.

## 1. Relayer on Railway (gasless trading)

### What is prepared

| Item | Value |
| --- | --- |
| Config | `railway.json` at the repository root (Railway reads it automatically) |
| Builder | Dockerfile, `relayer/Dockerfile`; build context is the repository root |
| Monorepo root | repository root (leave Railway's "Root Directory" empty) |
| Runtime | Node 22.20.0 (`node:22.20.0-bookworm-slim`), runs as the unprivileged `node` user |
| Install | `pnpm install --frozen-lockfile --filter "@imprest/relayer..."` (pnpm 11.5.0 via corepack) |
| Start | `node --import tsx src/node.ts` in `/repo/relayer` |
| Listen | `0.0.0.0` on Railway's `PORT` (8787 if unset) |
| Health check | `GET /health`, returns `{"ok":true,"chainId":10143,"relayer":"0x…","balanceWei":"…"}` |
| Image contents | only workspace manifests, `config/`, `packages/` and `relayer/` (`.dockerignore`); no `.env`, key files, web, app or contracts |

Verified locally on 2026-10-13 from a fresh clone of commit `509fa84`, with a throwaway, unfunded
key generated inside the build machine and never printed:

- image builds;
- logs `listening on 0.0.0.0:9911` with the allowed origin;
- `/health` returns 200 with chain 10143;
- preflight from `https://imprest-chi.vercel.app` returns 204 and echoes that origin;
- preflight or POST from another origin returns 403;
- a forged signature returns 401 `INVALID_SIGNATURE`;
- a wrong chain returns 400;
- no `.env` or key file in the image.

Replay protection (nonce), deadline and the per-trader quota are covered by `relayer/test`
(14 tests) and re-checked by the Desk contract onchain.

The origin allowlist only stops other websites' browsers. It is not authentication: a script
without an `Origin` header can still reach the relayer. What actually protects the gas wallet:

- every intent must carry the desk trader's EIP-712 signature;
- the desk must be an Imprest desk;
- the nonce must be unused and the deadline unexpired;
- the per-trader quota and the gas cap apply;
- the order is simulated before it is sent.

### Environment variables

| Variable | Kind | Value |
| --- | --- | --- |
| `RELAYER_PRIVATE_KEY` | **Secret.** Enter in Railway only, as a sealed variable | the dedicated testnet relayer key (see below) |
| `IMPREST_ENV` | public | `testnet` |
| `RELAYER_ALLOWED_ORIGINS` | public | `https://imprest-chi.vercel.app` |
| `RELAYER_QUOTA_PER_TRADER_PER_MIN` | public | `5` |
| `RELAYER_MAX_GAS` | public | `1200000` |
| `PORT` | set by Railway | do not set |
| `MONAD_TESTNET_RPC_URL` | public, optional | leave unset (uses the configured Monad RPC) |

**Key:**

- Use the existing dedicated relayer wallet `0x017F46FdCC2fC946D7e1f86927Aa37267331b728`. It is
  testnet-only, holds about 4.83 testnet MON and nothing else.
- Its key is `RELAYER_PRIVATE_KEY` in your local `.env`.
- Never use a key that holds real funds.
- Stop any local relayer once the hosted one runs. Both would use the same wallet, so running both
  can produce nonce clashes.

### Steps

1. Sign in at https://railway.com with GitHub. Check the current trial and plan terms; do not
   buy anything for this.
2. New Project → Deploy from GitHub repo → allow Railway's GitHub app access to
   `TheWeirdDee/imprest` → choose it. Railway reads `railway.json` and builds the Dockerfile.
   The first deploy fails until the key is set; that is expected.
3. Open the service → Variables → add the four public variables above. Then add
   `RELAYER_PRIVATE_KEY`, paste the value from your `.env` and seal it. Railway redeploys.
4. Settings → Networking → Generate Domain. If it asks for a port, use the one in the deploy log
   line `listening on 0.0.0.0:<port>`.
5. Open `https://<domain>/health`. Expect `"ok":true`, `"chainId":10143` and
   `"relayer":"0x017F…b728"`. Send the domain to the agent.
6. The agent then:
   - verifies health, logs and CORS from the live origin;
   - sets `NEXT_PUBLIC_RELAYER_URL` in Vercel and redeploys, or gives you that step.

A health check is not gasless execution. That is only shown by a trade the trader signs in the
browser, relayed, mined and verified on the second RPC.

## 2. Indexer on Envio (full history)

Prepared: `indexer/`. Its config is generated from `config/networks.json` and validated against
Envio's schema; the schema and handlers are included. Backfill starts at the deployment block,
69010507.

`indexer/pnpm-lock.yaml` lets the folder install on its own, outside the pnpm workspace.

1. Sign in at https://envio.dev with GitHub and check the current plans (Development tier is used).
2. Connect Repository: authorize the Envio GitHub app for `TheWeirdDee/imprest`.
3. Cloud → Projects → on the `theweirddee/imprest` row, **+ Add indexer**: name `imprest-indexer`,
   root directory `indexer`, config `config.yaml`, branch `main`, no environment variables. The
   config syncs Monad testnet (chain 10143) over the public RPC in 100-block windows.
4. Envio deploys on every push to `main`. Wait for the sync to reach the chain head; Envio shows
   progress.
5. Copy the GraphQL endpoint into Vercel as `NEXT_PUBLIC_INDEXER_URL` and redeploy.
6. Check that /status shows "Indexer LIVE" with the processed block, and that History shows the
   transactions from 2026-10-09 and 2026-10-12.

**Status, 2026-10-13: not working, left open.** Deployed on Envio's free Development plan
(commits `f93e328`, `a1db37f`, `cb7c1db`). Every deployment stayed at block height 0, with 0 events
and "Indexing Has Stopped", including with independent RPCs (dRPC, Ankr) that answer
`eth_blockNumber` and 100-block `eth_getLogs` normally from elsewhere. Envio v3 needs
`ENVIO_API_TOKEN` for HyperSync, and setting environment variables on the hosted service is a paid
feature. Envio's log viewer timed out (504), so the exact error was not visible. Nothing was bought.

The website does not need the indexer: History falls back to a bounded, read-only chain scan in
100-block windows and says when its coverage is partial. To finish this later, either:

- read the deployment logs once Envio's viewer loads, and fix the reported error; or
- run the indexer where `ENVIO_API_TOKEN` can be set (locally under WSL, or a paid plan).
## 3. Keeper

The keeper needs to run continuously. Options:

- an always-on instance;
- a small VPS;
- leave it as is: the contracts do not depend on it. Enforcement and graduation are open to
  anyone, and the website's Graduate button calls the same function.
