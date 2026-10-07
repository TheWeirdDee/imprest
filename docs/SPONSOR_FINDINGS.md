# Sponsor findings

Format: finding -> question sent -> sponsor response -> design change -> evidence -> status.
A conversation counts as co-design only when it changes or confirms an implementation
decision. **No sponsor has been contacted yet in this build**; every "question sent" and
"response" below is NONE until a real exchange happens. Reading documentation is not
co-design.

## Perpl

### P-1 Testnet collateral is Agora testnet AUSD; the api-docs README says test USD

- **Finding:** the testnet exchange's collateral is `0xa9012a…22dC` ("AUSD"); the README
  lists `0xdf5b…c027` ("Test USD"). perpl-sdk 0.2.9 already uses AUSD.
- **Question sent:** NONE (proposed: "Is AUSD the permanent testnet collateral? We will open
  a docs PR updating the README table.")
- **Sponsor response:** NONE
- **Design change:** testnet track runs AUSD end to end (DECISIONS D-001)
- **Evidence:** `proof/receipts/testnet/gate0.json`
- **Status:** OPEN

### P-2 Whitelisting is off on both networks

- **Finding:** `whitelistingEnabled() == false` (testnet and mainnet).
- **Question sent:** NONE (proposed: "Will whitelisting stay off for contract-owned accounts?")
- **Response:** NONE · **Design change:** no desk authorization step · **Evidence:** gate0 receipts · **Status:** OPEN

### P-3 Order leverage above the listing is clamped, not rejected

- **Finding:** a 20x order on a 15x listing fills with the deposit clamped to 15x.
- **Question sent:** NONE (proposed: "Is clamping intended behaviour for execOrder?")
- **Response:** NONE · **Design change:** the desk's 5x check is load-bearing · **Evidence:** `contracts/test/perpl-harness/PerplProbe.t.sol` · **Status:** OPEN

### P-4 Owner closes past bankruptcy fail; liquidation posts at the liquidation price

- **Finding:** a reduce-only IOC on a bankrupt position reverts; the book liquidation path
  does not fill below the liquidation price; auto-deleveraging resolves it.
- **Question sent:** NONE (proposed: "What is the expected liquidation path for a
  contract-owned account that gaps past bankruptcy on mainnet, and its latency?")
- **Response:** NONE · **Design change:** enforce() records failures and stays Enforcing (DECISIONS D-006) · **Evidence:** DeskSettlement tests · **Status:** OPEN

### P-5 Market-data API sends no CORS headers

- **Finding:** browsers cannot call `testnet.perpl.xyz/api` directly.
- **Question sent:** NONE · **Response:** NONE · **Design change:** read-only server proxy with a path allowlist · **Status:** OPEN

### P-6 Builder IDs cap at 255 with no onchain claim

- From the PRD's probe; not re-tested here. **Status:** OPEN, revenue not assumed.

## Agora

### A-1 Testnet AUSD faucet works for automated tests

- **Finding:** faucet `0xd236…ee6C` `requestFunds(address)` drips 10,000 AUSD, max 100,000 held,
  one drip per 60 s globally (read on chain).
- **Question sent:** NONE · **Response:** NONE · **Design change:** scripts fund testnet desks from it · **Status:** OPEN

## Mera (Category Labs)

### M-1 Account derivation is application-defined

- **Finding:** Mera returns PRF output and signing sessions; key derivation is the app's job.
- **Question sent:** NONE (proposed: "Is HKDF-SHA256 over the PRF output with an
  app-specific salt the recommended EVM derivation?")
- **Response:** NONE · **Design change:** `web/src/lib/account/derive.ts`, versioned salt `imprest.account.v1` · **Status:** OPEN

## Envio

### E-1 No Windows binary in envio 3.14.0

- **Finding:** optional dependencies cover linux-x64/arm64 and darwin only.
- **Question sent:** NONE · **Response:** NONE · **Design change:** config validated against the JSON schema; indexer runs on Linux/Docker · **Status:** OPEN

## Aurora, Kuru

Not integrated in this build; no findings.
