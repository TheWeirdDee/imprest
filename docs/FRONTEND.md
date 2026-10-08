# Frontend: design system, session, themes, mobile

## One design system

All colors, radii and type come from tokens in `web/src/app/globals.css`. Light is the default
`:root`; dark is a deliberate second palette under `:root[data-theme="dark"]`, not an inversion.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--color-bg` | `#f6f5f1` | `#0d0f12` | page background |
| `--color-surface` / `-2` / `-3` | white → warm greys | `#14171c` → `#22272f` | cards, raised and pressed surfaces |
| `--color-fg` / `-fg-2` / `-muted` | graphite → grey | near-white → grey | primary, secondary, muted text |
| `--color-line` / `-line-strong` | subtle / strong border | low-contrast / stronger border | borders |
| `--color-accent` / `-accent-strong` / `-accent-bg` | indigo `#3346c4` | lighter indigo `#8b98f5` | brand: logo, primary buttons, links, active nav, focus, selected tabs |
| `--color-on-accent` | white | `#0d0f12` | text on accent, long and short buttons |
| `--color-safe` / `warn` / `breach` / `info` (+ `-bg`) | muted semantic | lifted semantic | status, always paired with an icon and a word |
| `--color-long` / `--color-short` | green / red | lifted green / red | trading direction only |
| `--radius-sm` / `-md` / `-lg` | 6 / 8 / 12 px | same | controls / cards / sheets |

The brand hue is the same indigo in both themes. On dark, primary buttons use dark text on
the lighter indigo so the contrast holds.

### Buttons: three levels, one function

`buttonClass(variant, size)` in `web/src/components/ui.tsx` is the only button style. `<Button>`
and every link styled as a button use it.

| Level | Variant | Look | Example |
| --- | --- | --- | --- |
| Primary | `primary` | accent background | Open app, Create passkey, Claim realized profit |
| Secondary | `secondary` | neutral surface with border | See how it works, Sign in, Close desk |
| Tertiary | `tertiary` | accent text, no box | View proof, Security model |

`long`, `short` and `danger` are trading semantics, not brand. Inputs use `inputClass()`.
Black buttons were removed. The landing page and the app now share the same primary.

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
| Chart | yes | candle and grid colors read from the same tokens and update on theme change |

## Themes

The **Light / System / Dark** control sits in the header on desktop. On phones it is a
single icon button in the header, and the full control is in the menu and the More sheet.

- The choice is saved in `localStorage["imprest.theme"]` ("System" removes the key).
- A tiny script in `<head>` applies it before first paint, so there is no light flash.
- "System" follows the operating system and updates live when the OS setting changes.
- Other open tabs follow the change.
- Theme state is separate from the session. Switching theme never signs out or clears storage (tested).

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
- theme switch;
- 375 px and 1280 px viewports;
- unlock after reload;
- a cancelled prompt.

## Mobile layout

**Site header (below 1024 px).** ☰, Imprest and the theme button. The menu holds the links,
the network badge, the theme control and Open app.

**App bottom bar (below 1024 px).** Home, Trade, Positions, Risk and **More**. More opens a
bottom sheet with Claims, History, Desk & graduation, My receipts, LP console, Proof, Docs and
Status, plus the network badge and the theme control.

**App header.** Logo, theme button and the account button. "Create passkey" lives on the
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
- `web/e2e/theme.spec.ts`:
  - persistence across navigation, reload and a new tab;
  - "System" follows the OS;
  - no flash before first paint;
  - no white panels in dark mode;
  - WCAG contrast of at least 3:1 for every text element on 12 pages, in both themes;
  - theme changes leave other storage alone.
- `web/e2e/visual.spec.ts` (opt-in, `SCREENSHOTS=1`): full-page screenshots per theme, width and page into `proof/screenshots/`. Filters: `SHOT_WIDTHS`, `SHOT_THEMES`, `SHOT_PAGES`, `SHOT_ACCOUNT`.
