# Test results

Run 2026-10-08/09 on Windows 11 with Node 22, pnpm 11.5.0, Foundry 1.5.1 and Python 3.12,
against Monad testnet where noted. Results are grouped by where they ran: local, hosted, or a
physical device.

## Local

| Command | Result |
| --- | --- |
| `pnpm test` (core, relayer, keeper unit tests) | 45 passed (core 24, relayer 12, keeper 9) |
| `cd contracts && forge test` | 121 passed, 0 failed (12 suites; unit, fuzz, invariant, security, paired-desk, Perpl-bytecode harness) |
| `python -I proof/reference_model/run_reference.py` | 26/26 match (accrual 6, claims 6, settlements 6, paired-desk identities 8) |
| `pnpm validate-evidence -- --onchain` | PASSED (35 claims, every receipt re-read on chain) |
| `pnpm -r typecheck` | clean |
| `pnpm --filter @imprest/web build` | clean |
| `cd app && npm ci && npm run typecheck && npm test && npm run bundle:check` | clean install (no `--force`), typecheck clean, 3/3, Android export OK; iOS export OK |
| `PW_PORT=3400 pnpm test:e2e` (Playwright, Chromium, fresh production server, no indexer, live testnet RPCs) | **69 passed, 0 failed** in 7.9 min (2026-10-09). 24 opt-in screenshot tests are skipped by design. The 69th test is a regression check that History loads from the chain scan without an indexer. |

Browser suite contents:

| Area | Tests |
| --- | --- |
| Pages and overflow | 14 routes render; 404; overflow at 10 widths × 12 pages; overflow at 8 widths with a funded desk loaded |
| Accessibility (`a11y.spec.ts`) | axe-core WCAG 2.2 A/AA on 14 pages: **0 violations** |
| Contrast (`contrast.spec.ts`) | Every text element at least 3:1 on 12 pages |
| Passkey and session (virtual authenticator) | 9 tests: create, sign in, persistence across navigation, direct URLs, reload, new tab and viewport; locked-after-reload unlock; cancelled prompt; cross-tab account switch; corrupted credential; sign-out during an open prompt; no PRF; no dev mock |
| Proof and terminal | Landing proof placement, proof page rejection, null result shown, broken-link crawl, proxy allowlists, terminal states |

Test count history:

- 37 at first;
- 56 after the passkey and theme tests were added;
- 51 after dark mode was removed (6 theme tests out, 1 contrast test restored);
- 68 after 14 accessibility pages and 3 session edge cases were added;
- 69 now (plus the no-indexer History regression).

## Hosted (https://imprest-chi.vercel.app)

- `/` returns 200, served by Vercel. The deployed commit is not exposed; the hosted copy predates this pass.
- From the earlier pass: a fresh clone of `main`, built as Vercel builds it, served every route with status 200.
- The hosted relayer, keeper health and indexer are not configured, and /status says so.
- Without the indexer, History scans only the most recent 5,000 blocks (about half an hour), and says so. Before this fix, that scan failed on every hosted visit.

## Physical device

- The owner's iPhone in Expo Go opened the Home screen (owner screenshot).
- The other five tabs have not been confirmed on a device.
- Passkeys have not been tested on a device; they need a linked domain.
