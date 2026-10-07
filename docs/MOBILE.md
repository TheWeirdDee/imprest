# Mobile app

Native Expo (SDK 57, React Native 0.86) client in `app/`. It uses the same protocol, the same
contracts and the same business logic as the web app:

```
config/networks.json + packages/core (ABIs, policy check, accounting, verification, key derivation)
        |                                   |
     web/ (Next.js)                       app/ (Expo)
```

Metro resolves `@imprest/core` straight from the monorepo (`app/metro.config.js`); nothing
is copied. One passkey derives the same Imprest account on both clients
(`deriveEvmKey` in core; `app/test/shared.test.ts`).

## Screens

| Screen | Shows | Actions |
| --- | --- | --- |
| Home | account, AUSD and MON balances, desk equity, stake, restricted credit, unrealized PnL, HWM, risk floor, daily loss remaining | create/sign in with passkey, testnet faucet, approve and open desk |
| Trade | BTC/ETH mark (Perpl API), long/short, size, leverage, "your capital + restricted credit = maximum position", shared policy check | sign and send the order to the desk; status requested -> submitted -> verifying -> verified |
| Positions | size, entry, mark (stale flag), exposure, margin, unrealized PnL | none |
| Risk | leverage, drawdown, daily loss, exposure and fee utilization; contract limits | none |
| Claims | realized profit above HWM, fees netted, trader/pool/protocol shares, eligibility reason | claim when eligible |
| History | desk events from a bounded RPC scan | none |

Vocabulary matches the web app: "restricted credit", "risk floor", "high-water mark".

## Verified so far

| Check | Result |
| --- | --- |
| `npm run typecheck` | see FINAL_AUDIT.md |
| `npm test` (shared logic) | see FINAL_AUDIT.md |
| `npm run bundle:check` (Android JS bundle via `expo export`) | see FINAL_AUDIT.md |
| Run on a device | PENDING |

## What a device run needs (owner)

1. **Passkey domain.** Mera passkeys on iOS/Android require the app to be associated with the
   relying-party domain: host the web app on a domain you own, serve
   `/.well-known/apple-app-site-association` (webcredentials, team id + `xyz.imprest.app`) and
   `/.well-known/assetlinks.json` (package `xyz.imprest.app` + signing cert SHA-256), set that
   domain in `app.json` (`ios.associatedDomains`) and `EXPO_PUBLIC_PASSKEY_RP_ID`.
2. **A development build**, because `react-native-passkey` is a native module (not Expo Go):
   `npx expo run:android` (Android Studio) or `npx expo run:ios` (Xcode, Apple developer account),
   or `eas build --profile development` (Expo account).
3. A little testnet MON on the derived address for gas.

Until then the app shows `RP_ID_NOT_CONFIGURED` instead of pretending to sign in.
