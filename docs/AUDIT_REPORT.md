# Audit report (internal)

**This is an internal review by the build assistant, not an independent third-party audit.**

- Date: 2026-10-08, about 15:30–16:30 UTC (16:30–17:30 Lagos).
- Source: `main` at the commit that adds this file (based on `55832a1`).
- Hosted app: https://imprest-chi.vercel.app returned 200 at 15:56 UTC. It serves the copy from before this pass. Vercel does not expose the deployed commit in its response headers, so the hosted build cannot be tied to a commit from outside. It updates when Vercel redeploys `main`.

Findings marked "reported elsewhere" came from a separate review session whose patch was not available here. Each was reproduced in this repository before it was fixed.

## Findings

| ID | Sev | Where | Finding | Fix | Retest |
| --- | --- | --- | --- | --- | --- |
| A-01 | P1 | `relayer/src/handler.ts` | A CORS preflight (`OPTIONS`) built a 204 response with a body. `new Response("{}", { status: 204 })` throws, so **every browser request to the relayer failed preflight**. Earlier relayed trades worked only because they came from a Node script, which sends no preflight. | Empty 204 with CORS headers | New regression test fails on the old code (`TypeError: Invalid response status code 204`) and passes now. Relayer suite 12/12. |
| A-02 | P1 | `.github/workflows/ci.yml` | `pnpm/action-setup` was given `version: 11` while `package.json` pins `pnpm@11.5.0`. The action stops with "Multiple versions of pnpm specified", so **CI has failed on every push**. | Version read from `packageManager` only | CI green on all four jobs (run 37878125760, 2026-10-09) |
| A-03 | P2 | `web/package.json`, root | `web` `test` ran Vitest over the Playwright files; `lint` called `next lint`, which Next.js 16 removed. `pnpm test` and `pnpm lint` failed. | Removed both broken scripts. Root `test` runs the unit suites; `test:e2e` runs Playwright. No ESLint config exists, so no lint script is claimed. | `pnpm test`: 45 passed |
| A-04 | P2 | `app/package.json` | A fresh `npm ci` in the Expo app failed with ERESOLVE: react-dom 19.3.0 against react 19.2.3. | Override `react-dom` to 19.2.3 | `npm ci` without `--force` succeeds; typecheck, 3/3 tests and the Android export pass |
| A-05 | P2 | `AccountProvider.tsx` | A corrupted saved credential made unlocking throw on every attempt. | Ignore and remove a corrupt entry; fall back to discoverable credentials | New e2e test fails on the old code, passes now |
| A-06 | P2 | `AccountProvider.tsx` | Signing out (or locking) while a passkey prompt was open: when the prompt completed, it **signed the user back in**. | Generation counter; a late result is discarded | New e2e test (prompt held open, sign-out from another tab) fails on the old code, passes now |
| A-07 | P3 | `AccountProvider.tsx` | When another tab switched to a different account, this tab cleared the old address but kept the old signing session in memory. | The session is ended on the switch | The visible behaviour is tested; the in-memory session end is code review only, since it can't be observed from the browser |
| A-08 | P2 | web | axe-core (WCAG 2.2 A/AA) found serious issues: small muted text and short-side red below 4.5:1, chart `role="img"` containing focusable controls, a colour-only link in text, and docs tables that scroll but cannot be focused. | Darker `--color-muted`, `--color-long` and `--color-short`; chart uses `role="figure"`; underlined in-text link; focusable scroll region around tables | `a11y.spec.ts`: 0 violations on 14 pages |
| A-09 | P2 | README, `docs/FINAL_STATUS.md`, `SPONSOR_MATRIX.md` | Stale claims: graduation "pending" (it happened), "no mobile app", relayer and keeper "not running", and the tagline "Real capital" on a testnet product. | Rewritten to match the receipts | Manual review against `proof/` |
| A-11 | P1 | `web/src/lib/history.ts` | Without an indexer (the hosted site, and CI), History scanned in 1,000-block chunks; Monad's public RPC rejects `eth_getLogs` over 100 blocks, so **History failed for every hosted visitor**. Hidden locally because the local indexer was configured. | 100-block chunks, 5 at a time, last 5,000 blocks, labeled as such | New no-indexer test fails on the old code, passes now |
| A-12 | P2 | `ui.tsx`, `history.tsx` | Long raw RPC errors and long status pills overflowed narrow layouts (found by CI) | Wrapping error text, shortened error copy, wrapping pills | CI-condition overflow sweep passes |
| A-13 | P2 | `indexer/scripts/gen-config.mjs` | The config generator required a local `forge build`, so it failed on a fresh clone and in CI | Falls back to the committed ABIs | CI typescript job passes |
| A-10 | P2 | landing | The first screen explained mechanism terms before what a trader actually does. | New intro, six-step "How it works" with current thresholds, FAQ | Rendered and checked at 390 and 1440 px |

## Not changed and why

- **Contracts:** unchanged. SR-02 and SR-03 in [SECURITY_REVIEW.md](SECURITY_REVIEW.md) stay acknowledged; fixing them requires a redeploy, which would invalidate the testnet evidence.
- **Theme:** light only with black primary buttons. This is the owner's decision; an earlier dark-mode request was superseded.
- **Profit claim:** pending. No more trading is being done to chase it.

## Open risks

- The relayer, keeper health endpoint and indexer are not publicly hosted. The hosted site falls back to self-submitted transactions and direct chain reads, and says so on /status.
- Economic: a price gap larger than the stake can cost the pool principal (paired-desk results). Perpl and Agora admin powers are outside Imprest's control.
- Passkeys were tested with Chrome's virtual authenticator, not physical biometrics. Native passkeys need a linked domain.
- No independent audit.
