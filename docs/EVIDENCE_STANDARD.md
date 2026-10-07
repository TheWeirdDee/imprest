# Evidence standard

Every externally visible number traces to a file in `proof/`.

## Labels

| Label | Means | Never shown as |
| --- | --- | --- |
| PENDING | not measured yet; value is `null` | zero, N/A or a number |
| TARGET | an intended future value | a measurement |
| SIMULATED | computed by a simulation or a fork (nothing broadcast) | a network result |
| LOCAL_REPRODUCTION | measured on a local EVM running Perpl's own exchange bytecode | a network result |
| TESTNET_VERIFIED | happened on Monad testnet; receipt and post-state read back on an independent RPC | mainnet |
| MAINNET_VERIFIED | happened on Monad mainnet, same verification | n/a |

Read-only chain observations (Gate 0, mark staleness) are VERIFIED for their network with a
`read-only` methodology and no transaction hash.

## Claim format (`proof/claims/<CLAIM_ID>.json`)

`claim_id, statement, value, unit, network, chain_id, contract, source, evidence[],
transaction_hash, block_number, timestamp_utc, status, methodology, sample_size, denominator`.
Unknown values are `null`.

## Receipt format (`proof/receipts/{testnet,mainnet,deployments}/*.json`)

`id, environment, network, timestamp_utc, git_commit, operation, status, tx_hash,
block_number, contract, explorer_url, inputs, outputs, verification, notes`.
`tx_hash` is `null` when there is no transaction.

## Pipeline

1. Experiments, tests and scripts write artifacts (`proof/local`, `proof/experiments`,
   `proof/receipts`, `proof/reference_model`).
2. `scripts/src/build-claims.ts` generates every claim from those artifacts. Nothing is
   typed in by hand.
3. `scripts/src/validate-evidence.ts` fails if: a hash or address is malformed; a VERIFIED
   receipt lacks its readback; a mainnet claim cites only testnet evidence; a measured
   claim has no evidence file or a missing file; a PENDING claim carries a value; a TARGET
   carries a transaction; a LOCAL_REPRODUCTION claims a public chain id; duplicate claims
   disagree; timestamps or networks are missing. With `--onchain` it re-fetches every claimed
   transaction and checks success and block number.
4. The web app renders claims exactly as stored; display code never upgrades a status.

## Verification of user actions

In the app, an action is `verified` only when an independent RPC (not the one that
submitted it) returns the same receipt and the expected post-state at the receipt block.
Disagreement is `verification failed`. A forced-mismatch fixture
(`packages/core/test/core.test.ts`) proves this.
