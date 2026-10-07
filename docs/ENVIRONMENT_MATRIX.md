# Environment matrix

What runs where, and how each environment is labeled.

| Component | Local Foundry EVM | Testnet fork (anvil / forge fork) | Monad testnet | Monad mainnet |
| --- | --- | --- | --- | --- |
| Contracts | every test run (LOCAL_REPRODUCTION) | fork test + deploy rehearsal (SIMULATED) | PENDING (owner funds key) | PENDING (needs capital) |
| Perpl | real exchange bytecode, scripted maker | live exchange state at the fork block | live | live |
| AUSD | test token | live testnet AUSD + faucet | live + faucet | live (real value) |
| Web app | `NEXT_PUBLIC_IMPREST_ENV=development` | n/a | `testnet` (built, runs; desk actions PENDING deployment) | not configured |
| Relayer | unit tests (mock chain port) | n/a | PENDING key | not configured |
| Keeper | unit tests | n/a | PENDING key | not configured |
| Indexer | n/a | n/a | PENDING (Linux/Docker) | not configured |
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
