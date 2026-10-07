# Sponsor and hackathon requirement matrix

A dependency is not an integration. "Implemented" requires code that uses it on the
product's path; "Evidence" points at a test, receipt or run. Status uses the evidence labels.

| Sponsor / requirement | Required | Implemented | Evidence | Status |
| --- | --- | --- | --- | --- |
| Track 1: new primitive needing fast settlement | Yes | Use-restricted credit, per-order enforcement, contract settlement (`contracts/src`) | 120/120 tests on Perpl bytecode; testnet canonical run receipts | TESTNET VERIFIED |
| Track 1: live product link + judge path | Yes | Web app (`web/`), `/proof`, `/status`, `/docs` | 34 Playwright tests | LOCAL (hosting PENDING owner) |
| Track 1: public MIT repo with AI disclosure | Yes | github.com/TheWeirdDee/imprest, README AI disclosure | repository | DONE |
| Track 1: demo video, pitch video | Yes | not produced | none | PENDING (owner records) |
| Perpl: contract-owned account trades on Perpl | Core | `Desk.sol` owns a Perpl account and calls `execOrder` | `proof/receipts/testnet/testnet_guarded_trade_open.json` | TESTNET VERIFIED |
| Perpl Best Analytics/Risk Tool | Optional bounty | LP console + risk center reading chain | web E2E; LP console confirms values on two RPCs | LOCAL |
| Perpl Best use of API | Optional bounty | Keeper (enforce/graduate/checkpoint) + market-data proxy | `keeper/test`, keeper not running | PENDING (keeper key) |
| Agora AUSD as the unit | Core | Stake, credit, margin, payout all AUSD | Gate 0 + canonical run receipts | TESTNET VERIFIED |
| Agora Best Mobile Trading App: mobile app, Mera auth, AUSD balance, Perpl trade | Optional bounty | Expo app (`app/`): Mera passkey, AUSD balance, desk trade | typecheck, shared-logic tests, Android JS bundle export | LOCAL (device run PENDING: passkey domain + dev build) |
| Monad Mera-Powered UX: Mera as the entire account layer | Optional bounty | Web and mobile use only Mera (no other wallet path) | web E2E passkey tests with a virtual PRF authenticator | LOCAL |
| Envio Best Use: indexer driving a core feature | Optional bounty | Config, schema, handlers (`indexer/`); web history reads it when configured | config validates against Envio schema | PENDING (needs Linux/Docker to run) |
| Aurora Any-Chain Liquidity | Optional bounty | not built | none | NOT IMPLEMENTED |
| Kuru swap | Plumbing | not built | none | NOT IMPLEMENTED |

No sponsor has been contacted; see SPONSOR_FINDINGS.md. Nothing above claims co-design.
