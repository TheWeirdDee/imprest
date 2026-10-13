# Environment matrix

What runs where, and how each environment is labeled. Current as of 2026-10-13; the deployed web commit is whatever `/api/version` reports.

| Component | Local Foundry EVM | Testnet fork (anvil / forge fork) | Monad testnet | Monad mainnet |
| --- | --- | --- | --- | --- |
| Contracts | every test run (LOCAL_REPRODUCTION) | fork test + deploy rehearsal (SIMULATED) | deployed 2026-10-07 (blocks 69010507/69010521); runtime bytecode matches the build with immutables masked | not deployed (needs capital) |
| Perpl | real exchange bytecode, scripted maker | live exchange state at the fork block | live | live |
| AUSD | test token | live testnet AUSD + faucet | live + faucet | live (real value) |
| Web app | `NEXT_PUBLIC_IMPREST_ENV=development` | n/a | public at https://imprest-chi.vercel.app (`/api/version` reports the deployed commit); desk actions live | not configured |
| Relayer | unit tests (mock chain port) | n/a | runs locally with a funded key (relayed trades recorded in proof/receipts); public hosting prepared for Railway (`railway.json`, `relayer/Dockerfile`; see HOSTING.md), not yet deployed | not configured |
| Keeper | unit tests | n/a | runs locally with a funded key (graduation tx 0x4e61…87ed sent by it); not hosted | not configured |
| Indexer | n/a | n/a | config validated; runs under WSL/Docker only; not hosted (the web app falls back to a bounded RPC scan) | not configured |
| Reference model / replay | Python, local | n/a | n/a | n/a |

Environment variables: see `.env.example`. Required per component:

| Variable | Used by | Required |
| --- | --- | --- |
| `IMPREST_ENV` | scripts, relayer, keeper, indexer | yes |
| `NEXT_PUBLIC_IMPREST_ENV` | web | yes |
| `DEPLOYER_PRIVATE_KEY` | deploy, testnet-demo | deploy only |
| `RELAYER_PRIVATE_KEY` | relayer | relayer only |
| `KEEPER_PRIVATE_KEY` | keeper (unless `KEEPER_DRY_RUN=true`) | keeper only |
| `NEXT_PUBLIC_RELAYER_URL`, `NEXT_PUBLIC_INDEXER_URL`, `KEEPER_HEALTH_URL` | web | optional |
| `NEXT_PUBLIC_PASSKEY_RP_ID` | web | optional (defaults to host) |
| `NEXT_PUBLIC_ENABLE_DEV_MOCK_ACCOUNT` | web | development only; ignored elsewhere |
| `MONAD_EXPLORER_API_KEY` | source verification | optional |
