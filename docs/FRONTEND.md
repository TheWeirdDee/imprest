# Frontend: design system, session, mobile

## One design system

All colors, radii and type come from tokens in `web/src/app/globals.css`. The product is
**light theme only** (owner decision, 2026-10-08; the earlier dark/system theme was removed).

| Token | Value | Used for |
| --- | --- | --- |
| `--color-bg` | `#f6f5f1` | page background |
| `--color-surface` / `-2` / `-3` | white → warm greys | cards, raised and pressed surfaces |
| `--color-fg` / `-fg-2` / `-muted` | graphite → grey | primary, secondary, muted text |
| `--color-line` / `-line-strong` | subtle / strong border | borders |
| `--color-primary` / `-primary-hover` / `--color-on-primary` | black `#16181c` / `#2c3038` / white | primary buttons, logo |
| `--color-accent` / `-accent-bg` | indigo `#3346c4` | links, focus rings, active navigation, selected tabs, progress |
| `--color-safe` / `warn` / `breach` / `info` (+ `-bg`) | muted semantic | status, always paired with an icon and a word |
| `--color-long` / `--color-short` | green / red | trading direction only |
| `--radius-sm` / `-md` / `-lg` | 6 / 8 / 12 px | controls / cards / sheets |

### Buttons: three levels, one function

`buttonClass(variant, size)` in `web/src/components/ui.tsx` is the only button style. `<Button>`
and every link styled as a button use it.

| Level | Variant | Look | Example |
| --- | --- | --- | --- |
| Primary | `primary` | black background, white text | Open app, Create passkey, Claim realized profit |
| Secondary | `secondary` | neutral surface with border | See how it works, Sign in, Close desk |
| Tertiary | `tertiary` | accent text, no box | View proof, Security model |

`long`, `short` and `danger` are trading semantics, not brand. Inputs use `inputClass()`.
Every primary button, on the landing page and in the app, is the same black.

### Component audit (2026-10-08)

| Component | Shared? | Notes |
| --- | --- | --- |
| Buttons | yes | `buttonClass` / `Button` everywhere, error page included |
| Button-styled links | yes | `buttonClass` (landing CTAs, header, menus) |
| Inputs | yes | `inputClass` (order ticket, desk stake) |
| Cards | yes | `Card` (title, icon, padding) |
| Status badges / pills / notices | yes | `Pill`, `EvidenceBadge`, `Notice` with tone tokens |
| Tables | yes | token borders; card layout on phones for positions, tiers, LP desks, risk rules |
| Navigation | yes | `SiteHeader`, `AppShell` (sidebar, bottom bar, More sheet) |
| Chart | yes | candle and grid colors read from the same tokens |

## Session (why users were signed out, and what changed)

**Cause.** The signed-in account existed only in React memory, so anything that reloaded the
page ended it:

- a refresh;
- typing or pasting a URL;
- opening a new tab;
- the dev server's reload after a code change;
- links inside the Docs pages, which were plain HTML links that reloaded the page.

A 30-minute idle timer also signed the user out completely.

**Now.** One provider at the root (`web/src/lib/account/AccountProvider.tsx`) is the only
source of truth. Every page reads the same state:

| State | Meaning | What the user sees |
| --- | --- | --- |
| `initializing` | reading the remembered account | placeholders, never "Sign in" |
| `signed-out` | no account on this device | sign-in prompt |
| `locked` | account known, signing key not in memory | all their data; the next transaction asks the passkey once |
| `ready` | signing key in memory | everything, no prompt |
| `connecting` | passkey prompt open | progress |

- **Remembered:** the address, kind and credential id are stored in `localStorage`. These are
  public identifiers, not secrets. **The private key is never stored**; it lives in memory and
  is zeroed when signing locks.
- **After a refresh, new tab or direct URL** the account comes back as `locked` and every
  screen shows the user's data. Sending a transaction (`getSigner()`) asks for the passkey
  once, then signing stays unlocked.
- **Idle for 30 minutes:** signing locks, the account stays.
- **Cancelled passkey prompt:** shows "cancelled, nothing was sent" and never signs out.
- **Sign out** happens only on an explicit "Sign out on this device"; other tabs follow.
- **Docs links** now navigate client-side, and the desk data provider is mounted at the root,
  so moving between /app, /lp, /proof and /docs keeps everything loaded.

Tested in `web/e2e/passkey.spec.ts` with a virtual WebAuthn authenticator:

- every app page by sidebar;
- public pages and back;
- direct URLs for every route;
- reload;
- a new tab;
- 375 px and 1280 px viewports;
- unlock after reload;
- a cancelled prompt.

## Mobile layout

**Site header (below 1024 px).** ☰ and Imprest (plus Open app from 640 px). The menu holds
the links, the network badge and Open app.

**App bottom bar (below 1024 px).** Home, Trade, Positions, Risk and **More**. More opens a
bottom sheet with Claims, History, Desk & graduation, My receipts, LP console, Proof, Docs and
Status, plus the network badge.

**App header.** Logo and the account button. "Create passkey" lives on the
sign-in card in the page body.

**Tables.** On phones, positions, tiers, LP desks and risk rules become stacked cards with
"Details" where needed. The two Proof research tables scroll sideways inside their own box
and say so.

**Trade.** Market, chart, positions, then the order ticket (side, size, leverage, risk
summary, submit). Everything is in one vertical column.

## Responsive and visual tests

- `web/e2e/pages.spec.ts`:
  - overflow at 320, 375, 390, 414, 430, 768, 1024, 1280, 1440 and 1920 px on 12 pages;
  - overflow again at 320–1440 px with a funded desk loaded (the testnet trader's public address remembered, no key).
- `web/e2e/contrast.spec.ts`: WCAG contrast of at least 3:1 for every text element on 12 pages.
- `web/e2e/visual.spec.ts` (opt-in, `SCREENSHOTS=1`): full-page screenshots per width and page into `proof/screenshots/`. Filters: `SHOT_WIDTHS`, `SHOT_PAGES`, `SHOT_ACCOUNT`.
