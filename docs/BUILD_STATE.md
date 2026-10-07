# Build state and gap matrix

Updated 2026-10-07 after the testnet deployment and the frontend/mobile pass. "Done" means
evidenced, not merely coded. Severity: P0 blocks the core claim, P1 blocks a strong
submission, P2 is polish or optional.

## Deployment (preserved, not redeployed)

| Contract | Address (Monad testnet 10143) | Evidence |
| --- | --- | --- |
| ImprestPool | `0x85fFff6B1e8e62d2cE8ACA45B69AE530C6FbF457` | proof/receipts/deployments/testnet-ImprestPool.json |
| DeskFactory | `0x1569EE4A7210e226db932B5B7633E63d3AC8c544` | proof/receipts/deployments/testnet-DeskFactory.json |

The frontend redesign and the mobile client required **no** contract change, so the
deployment and every receipt remain valid.

## Gap matrix

| Area | Current state | Desired state | Sev | Work | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PROTOCOL | Deployed, bytecode verified, operator/treasury separated | same | P0 | none | sync-deployment, owner() on 2nd RPC | DONE |
| TRADING | Real 0.001 BTC trade opened/closed through a desk on Perpl testnet | same | P0 | none | testnet receipts | DONE |
| RISK | Direct 6x order reverted `LeverageExceeded` on testnet; 28 policy tests | same | P0 | none | testnet receipt + forge | DONE |
| ACCOUNTING | Solidity, TS and Python agree (26/26); waterfall fuzzed | same | P0 | none | reference model | DONE |
| CLAIMS | Implemented and tested locally; no testnet profit yet | real claim | P0 | needs genuine profit | testnet receipt | PENDING (market) |
| GRADUATION | Premature graduation reverted on testnet | real graduation | P0 | needs genuine +2% | testnet receipt | PENDING (market) |
| FRONTEND | Rebuilt: light design system, compact hero, live product panel, verification table, network pill | credible fintech UI | P0 | done this pass | screenshots + E2E | DONE |
| RESPONSIVENESS | Overflow checks 320-1920 px across 10 pages | same | P0 | done | Playwright width matrix | see FINAL_AUDIT |
| MOBILE | Expo app on shared core: Home, Trade, Positions, Risk, Claims, History | runs on a device | P1 | passkey domain + dev build (owner) | typecheck, tests, Android bundle | PARTIAL |
| WALLET | Mera passkey web flow tested with a virtual PRF authenticator | same + mobile on device | P1 | device run | Playwright passkey tests | PARTIAL |
| BACKEND | Relayer built and tested; not running | running | P1 | fund relayer key, start | relayer tests | PENDING |
| INDEXER | Config/schema/handlers; config validates | running, UI shows LIVE/SYNCING/STALE | P1 | Linux/Docker run | Envio | PENDING |
| TESTING | 120 forge, 44 TS, 3 mobile, Playwright suite | same | P0 | none | runs | see FINAL_AUDIT |
| ACCESSIBILITY | Semantic HTML, labels, focus rings, status never color-only, reduced motion | audited with a tool | P2 | axe audit | manual + E2E | PARTIAL |
| PERFORMANCE | Chart lazy-loaded; parallel cohort reads; bounded polling | measured budget | P2 | Lighthouse run | none yet | PENDING |
| DOCUMENTATION | Full set incl. SPONSOR_MATRIX, MOBILE, FINAL_AUDIT | matches reality | P1 | keep updated | review | DONE |
| EVIDENCE | 33 generated claims, validator passes on-chain | same | P0 | none | validate-evidence --onchain | DONE |
| SPONSOR INTEGRATIONS | Perpl, AUSD, Mera, Monad used; Envio built not run; Aurora/Kuru not built | per matrix | P2 | see SPONSOR_MATRIX | matrix | PARTIAL |
| SECURITY | Red-team suite passes; no audit | audit | P1 | external audit | none | PENDING |
| OBSERVABILITY | Relayer/keeper JSON logs with operation_id; /status live checks | same + dashboards | P2 | none | /status | PARTIAL |
| HOSTING | Web runs locally | public URL | P1 | owner chooses host/domain | none | PENDING (owner) |
| MAINNET | Not deployed | optional | P2 | real capital, owner decision | none | NOT STARTED |
