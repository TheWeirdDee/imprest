# Desk inventory (testnet)

Block 70664122 (2026-10-13T10:58:28.000Z), read on rpc-testnet.monadinfra.com; money fields re-read on testnet-rpc.monad.xyz at the same block.
Desks: 4. Pool idle: 4600.000000 AUSD. Pool paused: false. Factory paused: false.

Equity is the contract's riskState equity; it is realized equity only when the desk is flat. Fees accrue with time, so a claim or graduation re-checks them at execution.

## 0x119799Df45C3f0fd2dc1060fb2a72EF88617c597

| Field | Value |
| --- | --- |
| Owner | `0xae7848e88635946C233e8A2F431dDAEc37E7B3E3` |
| Cohort | demo-v0 |
| Tier | 0 of 1 |
| Status | Closed |
| Positions (signed) | BTC flat; ETH flat |
| Equity | 0.000000 AUSD (flat: realized) |
| Start equity / HWM | 100.000000 / 100.000000 |
| Borrowed | 0.000000 |
| Fees outstanding | 0.000000 |
| Closed round trips this tier | 1 |
| Claims this tier | 0 |
| Claim now | no: desk closed; equity 0.000000 not above HWM 100.000000 |
| Graduate now | n/a (desk not active) |
| Second RPC agrees | yes |

## 0xfc653827479A9D96d197785de22db581FF5dFCC6

| Field | Value |
| --- | --- |
| Owner | `0xae7848e88635946C233e8A2F431dDAEc37E7B3E3` |
| Cohort | demo-v0 |
| Tier | 1 of 1 |
| Status | Active |
| Positions (signed) | BTC flat; ETH flat |
| Equity | 493.713365 AUSD (flat: realized) |
| Start equity / HWM | 502.289849 / 502.289849 |
| Borrowed | 400.000000 |
| Fees outstanding | 0.015997 |
| Closed round trips this tier | 4 |
| Claims this tier | 0 |
| Claim now | no: equity 493.713365 not above HWM 502.289849 |
| Graduate now | no: top tier reached |
| Second RPC agrees | yes |

## 0x480227b5a9c4ef965dc61ee60A5A666A336bbFaD

| Field | Value |
| --- | --- |
| Owner | `0x976C766eC9D72D6a23bdcf923e8E138113cF25fE` |
| Cohort | demo-v0 |
| Tier | 0 of 1 |
| Status | Closed |
| Positions (signed) | BTC flat; ETH flat |
| Equity | 0.000000 AUSD (flat: realized) |
| Start equity / HWM | 100.000000 / 100.000000 |
| Borrowed | 0.000000 |
| Fees outstanding | 0.000000 |
| Closed round trips this tier | 1 |
| Claims this tier | 0 |
| Claim now | no: desk closed; equity 0.000000 not above HWM 100.000000 |
| Graduate now | n/a (desk not active) |
| Second RPC agrees | yes |

## 0x640ac0F4a2191Ae5A9522291fE4bca786d515DBf

| Field | Value |
| --- | --- |
| Owner | `0x976C766eC9D72D6a23bdcf923e8E138113cF25fE` |
| Cohort | demo-v0 |
| Tier | 0 of 1 |
| Status | Active |
| Positions (signed) | BTC flat; ETH flat |
| Equity | 99.809207 AUSD (flat: realized) |
| Start equity / HWM | 100.000000 / 100.000000 |
| Borrowed | 0.000000 |
| Fees outstanding | 0.000000 |
| Closed round trips this tier | 2 |
| Claims this tier | 0 |
| Claim now | no: equity 99.809207 not above HWM 100.000000 |
| Graduate now | no: equity 99.809207 < target 102.000000 (+2% on start 100.000000) |
| Second RPC agrees | yes |

