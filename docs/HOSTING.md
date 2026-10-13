# Hosting the relayer and indexer (owner steps)

The live website runs on Vercel. Two optional services make it complete for visitors:

- the **relayer** (gasless trading);
- the **indexer** (full history).

Both need an account in the owner's name, which the agent cannot create. Everything else is
prepared in the repository. Nothing here is deployed until the owner does the steps below.

## 1. Relayer on Render (gasless trading)

Prepared: `render.yaml` (a Render Blueprint), plus the relayer changes it needs:

- it reads the host's `PORT`;
- `RELAYER_ALLOWED_ORIGINS` limits callers to the live site;
- the per-trader quota is lowered to 5 per minute;
- the gas cap is 1.2M;
- health checks use `/health`.

1. Sign in at https://render.com with GitHub. Render has a free instance type; check the current
   terms before choosing it.
2. **New → Blueprint**, pick the repository `TheWeirdDee/imprest`. Render reads `render.yaml`.
3. When asked for `RELAYER_PRIVATE_KEY`, paste the relayer key. It is in your local `.env` as
   `RELAYER_PRIVATE_KEY`, the wallet `0x017F46FdCC2fC946D7e1f86927Aa37267331b728`, which holds about
   4.83 testnet MON. It is a testnet-only key; never use a key that holds real funds.
4. Deploy. When it is live, open `https://<your-service>.onrender.com/health`. Expect
   `{"ok":true,"chainId":10143,"relayer":"0x017F…b728",…}`.
5. In Vercel → Settings → Environment Variables, add
   `NEXT_PUBLIC_RELAYER_URL = https://<your-service>.onrender.com` and redeploy.
6. Check https://imprest-chi.vercel.app/status: the relayer should be operational. Tell the agent the
   address; it will verify CORS from the live origin and prepare the controlled gasless test.

Limitations of a free instance:

- It sleeps when idle, so the first request after a pause can take up to a minute. The website
  shows a pending state while it wakes.
- Stop the local relayer once the hosted one is live. Both use the same wallet, so running both at
  once can produce nonce clashes.

## 2. Indexer on Envio (full history)

Prepared: `indexer/` (config generated from `config/networks.json` and validated against Envio's
schema, schema and handlers). Backfill starts at the deployment block, 69010507.

1. Sign in at https://envio.dev with GitHub and check the current plans.
2. Create a hosted indexer from the repository, root directory `indexer`, network Monad testnet
   (chain 10143). Without an `ENVIO_API_TOKEN`, the generated config syncs over the public RPC in
   100-block windows.
3. Wait for the sync to reach the chain head. Envio shows progress.
4. Copy the GraphQL endpoint into Vercel as `NEXT_PUBLIC_INDEXER_URL` and redeploy.
5. Check: /status shows "Indexer LIVE" with the processed block, and History shows the transactions
   from 2026-10-09 and 2026-10-12 (the agent can compare them with the explorer).

## 3. Keeper

The keeper needs to run continuously. Free web instances that sleep are not suitable. Options:

- a paid always-on instance;
- a small VPS;
- leave it as is: the contracts do not depend on it. Enforcement and graduation are open to
  anyone, and the website's Graduate button calls the same function.
