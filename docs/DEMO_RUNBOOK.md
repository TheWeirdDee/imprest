# Demo runbook

Real testnet activity only: no animations standing in for transactions, no hardcoded
balances, no prerecorded success. Where a step depends on something not yet available, say
so on screen.

## Before recording

1. Testnet deployment recorded (`config/networks.json` has pool and factory).
2. `/status` all green for RPCs and Perpl; mark age under 60 s.
3. A browser with WebAuthn PRF (Chrome/Edge with Google Password Manager, or Safari with
   iCloud Keychain on macOS 15+/iOS 18+).
4. The trader address funded with a little testnet MON (faucet.monad.xyz).

## Path (about 3 minutes)

| # | Screen | Action | What proves it |
| --- | --- | --- | --- |
| 1 | `/` | open the site | amber TESTNET banner, product explained in 10 s |
| 2 | `/app` | Create passkey account | Mera passkey prompt; address shown |
| 3 | `/app` | Get 10,000 testnet AUSD | faucet transaction, verified on the second RPC |
| 4 | `/app/desk` | Approve, Open desk (100 AUSD, demo cohort) | desk address; Perpl account id; verified |
| 5 | `/app/desk` | show the tier table | configured policy read from the desk |
| 6 | `/app/trade/btc` | buy 0.001 BTC at 3x, IOC | Perpl fill; explorer link; "Verified" only after the readback |
| 7 | `/app/positions` | the position | read from Perpl getPosition |
| 8 | `/app/desk` | Graduate, only if eligible (+2%, 2 round trips) | pool credit; if not eligible, show the onchain rejection and say so |
| 9 | `/app/trade/btc` | set leverage 6x | Policy check BLOCKED: "Requested 6.00x, maximum 5.00x. Nothing was sent to Perpl." |
| 10 | same | Send to contract anyway | mined transaction reverted with `LeverageExceeded` (contract rejection, not UI) |
| 11 | `/app/trade/btc` | close the position (reduce-only) | flat |
| 12 | `/app/claims` | claim if there is realized profit; otherwise show "Nothing to claim" | balance increase verified on the second RPC |
| 13 | `/app/proof` | My receipts | each action with its readback |
| 14 | `/proof` | the canonical proof page | testnet receipts, replay null result, paired-desk table |

Graduation and a profitable claim depend on the market. Never fake either; if they did not
happen in the session, say "TESTNET LIMITATION: not eligible during this session" and show
the deepest verified step instead (the contract-level rejection and the verified close
payout).
