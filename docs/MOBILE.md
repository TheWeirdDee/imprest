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

## See it on your phone (5 minutes, free)

1. Install **Expo Go** from the App Store or Google Play. Use the version that supports SDK 57.
2. Put the phone on the **same Wi-Fi** as this computer.
3. In the repository root, run:

   ```
   npm run mobile
   ```

   A QR code appears in the terminal. It only appears in a real terminal window, not when
   the output is piped to a file.
4. Scan it. On Android, use the scanner inside Expo Go. On iPhone, use the Camera app.
5. If the phone cannot connect (guest Wi-Fi, a corporate network, or a firewall), stop and
   run `cd app && npx expo start --tunnel` instead.

### What works in Expo Go and what does not

| Works | Does not work in Expo Go |
| --- | --- |
| Every screen and navigation | **Passkey sign-in.** Passkeys need a native module and a domain linked to the app. Expo Go has neither, so the app shows `RP_ID_NOT_CONFIGURED`. It never pretends to sign you in. |
| Live BTC/ETH marks from Perpl testnet | Sending trades, opening a desk, claiming (all need the signed-in account) |
| | Risk limits, positions, claims and history (all read from your own desk, so they need the signed-in account) |

In short: Expo Go shows the real app reading real testnet data. Trading from the phone needs
the development build described below.

## Verified so far

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm test` (shared logic) | 3/3 pass |
| `npm run bundle:check` (Android JS bundle via `expo export`) | exports |
| `npm run mobile` starts Metro; manifest served (SDK 57, "Imprest"); Android dev bundle served (16 MB, HTTP 200) | LOCAL, 2026-10-07 |
| Scanned and opened on a physical phone | PENDING (needs a phone; the owner can do it with the steps above) |

## Passkeys on a phone: what is needed and why

**Why:** iOS and Android only release a passkey to an app the domain owner has vouched for.
The website proves this by publishing two small files, and the app declares the same domain.
Without that link the operating system refuses, which is the anti-phishing design.

**What, where, how much:**

| Item | Where | Cost |
| --- | --- | --- |
| A domain you control (e.g. `imprest.xyz`) | any registrar | about $10–15 per year |
| Host the web app on it over HTTPS | Vercel, Netlify or Cloudflare Pages free tier | $0 |
| `/.well-known/apple-app-site-association` with `{"webcredentials":{"apps":["<TEAMID>.xyz.imprest.app"]}}` | `web/public/.well-known/` (I generate it once you give me the Team ID) | $0 |
| `/.well-known/assetlinks.json` with package `xyz.imprest.app` and the signing certificate's SHA-256 | `web/public/.well-known/` (I generate it from the debug or release keystore) | $0 |
| `ios.associatedDomains: ["webcredentials:<domain>"]` | `app/app.json` (currently the placeholder `webcredentials:imprest.example`) | $0 |
| `EXPO_PUBLIC_PASSKEY_RP_ID=<domain>` | `app/.env` | $0 |
| `NEXT_PUBLIC_PASSKEY_RP_ID=<domain>` | web host environment variables | $0 |
| Android development build: `cd app && npx expo run:android` | Android Studio on this PC, phone over USB | $0 |
| iOS development build: `npx expo run:ios`, or `eas build --profile development` | needs a Mac with Xcode, or an Expo account for cloud builds | Apple Developer Program, $99 per year |

**Owner steps:** (1) buy or choose a domain, (2) deploy `web/` to it, (3) send me the domain,
plus the Apple Team ID if you want iOS, (4) I fill in the files above and rebuild, (5) run
the development build on your phone. Android alone costs only the domain. Nothing has been
bought or signed up for on your behalf.

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
