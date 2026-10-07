# Networks

`config/networks.json` is the single source of truth; `packages/core/src/networks.ts` loads it
and refuses unknown environment names. Nothing else hardcodes an address, except the
testnet fork test, which pins the testnet addresses it forks on purpose.

| | development | testnet | mainnet |
| --- | --- | --- | --- |
| Label shown in UI | LOCAL (red banner) | TESTNET (amber banner) | none |
| Chain id | 31337 | 10143 | 143 |
| Primary RPC | http://127.0.0.1:8545 | https://testnet-rpc.monad.xyz | https://rpc.monad.xyz |
| Verification RPC | none | https://rpc-testnet.monadinfra.com | https://rpc-mainnet.monadinfra.com |
| Explorer | none | testnet.monadscan.com (alt testnet.monadvision.com) | monadscan.com (alt monadvision.com) |
| Perpl exchange | deployed per test | 0x1964C32f0bE608E7D29302AFF5E61268E72080cc | 0x34B6552d57a35a1D042CcAe1951BD1C370112a6F |
| Collateral | test USD per test | AUSD 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC | AUSD 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a |
| AUSD faucet | n/a | 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C | none |
| Markets | BTC 16, ETH 32 | BTC 16, ETH 32 | BTC 1, ETH 20 |
| Imprest pool / factory | per test | 0x85fFff6B1e8e62d2cE8ACA45B69AE530C6FbF457 / 0x1569EE4A7210e226db932B5B7633E63d3AC8c544 | PENDING |
| Dev mock account | allowed with flag | never | never |

The verification RPC must be a different provider from the primary; the web app's
"verified" state depends on it. Addresses and decimals were read on chain on 2026-10-07
(`proof/receipts/*/gate0.json`).
