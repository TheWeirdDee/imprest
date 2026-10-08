# Known limitations

Honest list of what is not done, not proven, or depends on others.

## Not yet done

| Item | Status | Why | What unblocks it |
| --- | --- | --- | --- |
| Testnet profit claim | PENDING | Graduation is done (TESTNET VERIFIED); a claim needs realized profit above the tier-1 high-water mark on the live market | Trade the funded desk; never forced |
| Relayer and keeper hosting | LOCAL HOST | Both run on this PC against testnet and are verified on-chain; not on a server | Host them on any Node server with the same .env |
| Indexer hosting | LOCAL HOST | Runs in WSL (Envio has no Windows binary); not on a server | Docker host or Envio hosted service |
| Mobile app on a device | PENDING | Built (`app/`), typechecked, tested, Android bundle compiles; passkeys need the app associated with a hosted domain and a native dev build | [MOBILE.md](MOBILE.md) |
| Aurora (Tron/BSC -> Monad) and Kuru (USDC -> AUSD) funding | NOT BUILT | Not on the critical mechanism path; testnet AUSD comes from Agora's faucet | Separate integration |
| Contract source verification on Monadscan | PENDING | Needs an explorer API key | `forge verify-contract` |
| Buffered payout when Perpl rate-limits withdrawals | NOT IN V0 | DECISIONS D-011; claims/closes revert with a named error and can be retried | V1 |
| Security audit | NOT PERFORMED | Internal automated review only (SECURITY_REVIEW.md); 2 Low findings acknowledged for the next deployment; 18 high Expo tooling advisories have no upstream fix | External audit before real capital |

## Mainnet dependency register (Track B)

| Item | Needs mainnet because | Capital | Owner-manual | Smaller smoke test | Can stay pending |
| --- | --- | --- | --- | --- | --- |
| AUSD paid by contract to a real trader | headline money-shot is defined on mainnet | ~300 AUSD seed credit (PRD) + tester stakes | yes: fund deployer, approve | yes: one 10 AUSD-stake desk (venue minimum is 10 AUSD on mainnet), no credit | yes |
| Claim-to-verified-balance seconds on mainnet | same | same | yes | yes | yes |
| Principal loss beyond stakes across real breaches | needs real breaches | stakes at risk | yes | no | yes |
| Real outside traders funded | traction | LP credit | yes | no | yes |
| Keeper bounty covers Monad gas | needs real gas prices and enforce gas on Monad | a few MON | yes | testnet measures gas units; MON/AUSD price needed | yes |
| Perpl builder ID revenue | Perpl assigns IDs offchain | none | yes (request) | n/a | yes |

The testnet track proves the mechanism with real AUSD, since Perpl's testnet margins in
Agora's testnet AUSD (DECISIONS D-001). Nothing on mainnet is claimed.

## Results that went against the thesis

- **Atomic vs keeper overshoot:** the pre-registered replay hit the null threshold (median
  gap 0.0 bps vs a 1 s keeper, n = 51). The overshoot headline is dropped (DECISIONS D-010).
- **Early enforcement can favour a paired attacker:** in the 3% trend scenario a keeper that
  enforces every step stopped the losing leg early, so the actor netted +46.46 AUSD vs
  -1.21 AUSD with a delayed keeper. Caps, not enforcement speed, bound this attack.
- **Gaps past bankruptcy depend on the venue:** the desk cannot close a position past
  bankruptcy; Perpl's liquidation or auto-deleveraging must act first (DECISIONS D-006).

## Measurement limits

- Gas numbers are Foundry's Ethereum schedule, not Monad pricing (Monad charges the gas
  limit and prices cold access higher).
- The paired-desk results are deterministic single scenarios on a local book with a scripted
  maker, not a universal loss bound.
- The replay is a Python simulation on real Binance spot prices, not the Perpl-bytecode
  harness; forced-close book depth is modelled as a fixed 1 bp.
- Exposure caps are notional at trade-time marks; a position's notional drifts with price
  between trades.
- The live-testnet fork test fills against whatever liquidity the book had at the fork block.

## Platform notes

- DeskFactory (35 KB runtime) relies on Monad's 128 KiB contract limit, like Perpl itself;
  it is not deployable on EIP-170 chains as is.
- The web app is dark-theme only.
- Mera is preview software; PRF support varies by browser and authenticator. Unsupported
  browsers get the exact `PRF_UNAVAILABLE` message.
