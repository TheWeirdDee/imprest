# Dependency matrix

Verified 2026-10-07. "Read on chain" means a read-only call against the live network,
recorded in `proof/receipts/*/gate0.json`.

| Dependency | Official source | Version / ABI | Networks | Addresses | Role in Imprest | Limitations found | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Monad | docs.monad.xyz (network-information, testnets) | testnet v0.15.2 (MONAD_NINE) per docs | Testnet 10143, Mainnet 143 | RPCs: testnet-rpc.monad.xyz, rpc-testnet.monadinfra.com; rpc.monad.xyz, rpc-mainnet.monadinfra.com | Chain; 128 KiB contracts; 400 ms blocks | Gas is charged on the gas limit; public RPCs return zero for ERC-1967 storage slot reads (so implementation hashes could not be compared) | `/status`, gate0 receipts |
| Perpl | github.com/PerplFoundation/api-docs; crates.io perpl-sdk | Exchange ABI + bytecode rc_v1.1.7-203-g0e5902dd (perpl-sdk 0.2.5 and 0.2.9 identical); on-chain getContractVersion 1.7.5 | Testnet, Mainnet | Exchange testnet `0x1964C32f0bE608E7D29302AFF5E61268E72080cc`; mainnet `0x34B6552d57a35a1D042CcAe1951BD1C370112a6F` | Venue: desk-owned account, matching, margin, liquidation, marks | Whitelisting off on both networks; min account open 100 AUSD testnet, 10 AUSD mainnet; mark max age 60 s; leverage above listing is clamped, not rejected; maxNegPnl cap refuses adds to underwater positions; owner IOC close past bankruptcy fails (venue liquidation/ADL needed); market-data API sends no CORS headers | gate0 receipts; `contracts/test/perpl-harness/PerplProbe.t.sol` |
| Agora AUSD | docs.agora.finance/developer/contract-deployments | ERC-20, 6 decimals | Testnet, Mainnet | Testnet `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`; mainnet `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`; testnet faucet `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C` | Stake, credit, margin and payout unit | Testnet faucet: `requestFunds(address)`, 10,000 AUSD per drip, at most 100,000 held, one drip per 60 s (read on chain). **Perpl's testnet collateral IS this AUSD** (contradicts the PRD; see DECISIONS D-001) | gate0 receipts |
| Mera | npmjs.com/package/@category-labs/mera; mera.category.xyz | 0.2.0 (published 2026-08-12) | Web, React Native | n/a | Passkey account: PRF output -> app-derived secp256k1 key -> signing session -> viem account | Preview API; PRF support varies by browser/authenticator (PRF_UNAVAILABLE surfaced verbatim) | `web/src/lib/account` |
| Envio HyperIndex | docs.envio.dev; npm `envio` | 3.14.0 | Monad testnet/mainnet | n/a | Track records, history, LP console data (display only) | Ships binaries for Linux/macOS only: cannot codegen or run on Windows; config validated against its JSON schema | `indexer/` |
| Aurora Intents | docs.intents.aurora.dev | not integrated | Tron/BSC -> Monad | n/a | PRD: cross-chain stake funding | Not built in this pass | KNOWN_LIMITATIONS |
| Kuru | (PRD) | not integrated | Monad | n/a | PRD: USDC -> AUSD swap | Not built in this pass | KNOWN_LIMITATIONS |
| Binance public data | data.binance.vision | spot klines 1 s | n/a | n/a | Real price history for the replay experiment | Spot prices, not Perpl marks | `proof/experiments/replay/data/MANIFEST.json` |
| OpenZeppelin Contracts | github.com/OpenZeppelin/openzeppelin-contracts | v5.4.0 | n/a | n/a | ERC4626, SafeERC20, EIP712, SignatureChecker, ReentrancyGuard, Ownable2Step | none | `contracts/lib/openzeppelin-contracts` |
| Foundry | github.com/foundry-rs/foundry | 1.5.1-stable (b0a9dd9) | n/a | n/a | Build, test, fuzz, invariant, fork, deploy | Same version as the PRD probe | `proof/local/forge-test-results.json` |

Market ids and decimals (read on chain, both networks): BTC price 1 dp / lot 5 dp; ETH price
2 dp / lot 3 dp. Testnet perp ids BTC 16, ETH 32; mainnet BTC 1, ETH 20. Taker fee 345 ppm
(0.0345%) on both networks at Gate 0.
