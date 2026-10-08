# Build state and gap matrix

Updated 2026-10-08 (light-only frontend, session persistence, deploy readiness). "Done" means
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
| CLAIMS | Implemented and tested locally; desk now funded (tier 1); claim needs realized profit above 502.29 AUSD HWM | real claim | P0 | genuine profit on the funded desk | testnet receipt | PENDING (market) |
| GRADUATION | Desk earned +2% over two closed relayed trades; keeper called graduate(); pool funded 400 AUSD | same | P0 | none | graduation-attempt/05 receipt, second RPC | DONE (TESTNET VERIFIED) |
| FRONTEND | One design system, light theme only, black primary buttons; hero simplified; session persists across reload, tabs and direct URLs | same | P0 | none | Playwright suite + screenshots | DONE |
| RESPONSIVENESS | Overflow sweep 320-1920 px on 12 pages, plus 320-1440 px with a funded desk loaded; phone layouts use cards and a bottom bar | same | P0 | none | Playwright | DONE |
| MOBILE | Expo app on shared core; `npm run mobile` serves manifest + Android bundle; Expo Go steps documented | runs on a physical phone | P1 | owner scans the QR; passkeys need a domain + dev build | typecheck, tests, Metro bundle | PARTIAL (not opened on a physical phone) |
| WALLET | Mera passkey: create, sign in, persistence, lock and unlock, cancel, explicit sign-out (virtual authenticator) | same + phone | P1 | phone needs a domain | Playwright passkey suite | DONE (web); PENDING (phone) |
| BACKEND | Relayer and keeper running against testnet; relayed trades and a keeper graduate() verified | same | P1 | none | receipts 01-05 | DONE (TESTNET VERIFIED) |
| INDEXER | Envio 3.14 running in WSL with Docker Postgres/Hasura; status page shows LIVE/SYNCING and lag | hosted | P1 | host it (owner) | GraphQL query of canonical events | DONE LOCALLY |
| TESTING | 120 forge, 44 TS, 3 mobile, Playwright suite | same | P0 | none | runs | see FINAL_AUDIT |
| ACCESSIBILITY | Semantic HTML, labels, focus rings, status never color-only, reduced motion | audited with a tool | P2 | axe audit | manual + E2E | PARTIAL |
| PERFORMANCE | Chart lazy-loaded; parallel cohort reads; bounded polling | measured budget | P2 | Lighthouse run | none yet | PENDING |
| DOCUMENTATION | Full set incl. SPONSOR_MATRIX, MOBILE, FINAL_AUDIT | matches reality | P1 | keep updated | review | DONE |
| EVIDENCE | 33 generated claims, validator passes on-chain | same | P0 | none | validate-evidence --onchain | DONE |
| SPONSOR INTEGRATIONS | Perpl, AUSD, Mera, Monad used; Envio built not run; Aurora/Kuru not built | per matrix | P2 | see SPONSOR_MATRIX | matrix | PARTIAL |
| SECURITY | Internal automated review (Slither, lint, dependency audits) with fixes; red-team suite passes | independent audit | P1 | external audit (owner/budget) | SECURITY_REVIEW.md | INTERNAL REVIEW COMPLETE; AUDIT NOT PERFORMED |
| OBSERVABILITY | Relayer/keeper JSON logs with operation_id; /status live checks | same + dashboards | P2 | none | /status | PARTIAL |
| HOSTING | Fresh clone builds and serves every page; Vercel settings and env vars in DEPLOY_VERCEL.md | public URL | P1 | owner deploys on Vercel (free tier) | clean-clone build | READY (owner deploys) |
| MAINNET | Not deployed | optional | P2 | real capital, owner decision | none | NOT STARTED |

## Summary

**Verified:**

- testnet deployment;
- contract-level risk rejection (6x order reverted `LeverageExceeded`);
- real Perpl trades;
- contract settlement;
- relayed (gasless) trades;
- keeper action;
- graduation: a real +2% over two closed trades on desk `0xfc65…FCC6`, executed by the keeper, with 400 AUSD of pool credit funded. Premature graduation was separately shown to revert;
- web frontend, session persistence, responsive layout and the browser suite.

**Pending:**

- qualifying profit claim (two real attempts lost money; nothing above the 502.29 AUSD high-water mark);
- independent security audit (an internal automated review only);
- mainnet;
- phone passkeys (need a domain);
- physical-phone test of the Expo app;
- public hosting (ready, owner deploys);
- indexer hosting (runs locally in WSL only).
