# Demo videos: provenance and upload checklist

## What the footage is

All footage is genuine screen recording of the deployed product. Nothing is mocked or animated as
interface; overlays (labels, highlights, circles, captions) are added in the edit only.

| Item | Value |
| --- | --- |
| Deployed site | https://imprest-chi.vercel.app (production) |
| Deployed commit at capture | `c6ec7d4ff38264d999039cf43c288a94d2567f00` (from `/api/version`) |
| Network | Monad Testnet (chain 10143), test tokens only |
| Capture date | 2026-10-13, about 21:30–22:40 UTC |
| Capture method | Playwright driving Chrome, 1280×720 CSS at 1.5× pixel density → 1920×1080 recording (25 fps source, rendered at 30 fps). Script: `video/capture/capture.cjs` |
| Account shown | Desk owner `0x976C766eC9D72D6a23bdcf923e8E138113cF25fE`, desk `0x640ac0F4a2191Ae5A9522291fE4bca786d515DBf` |
| How the account was loaded | Read-only: the site's remembered-account state set to the owner's **public address** (the padlock in the header shows the locked, read-only session). No passkey, no signature, no transaction during recording. |
| Drawn cursor | The scripted pointer is drawn on the page so viewers can follow it; clicks show a ring. |
| Narration | Synthetic voice, Microsoft neural "en-US-AndrewNeural" via edge-tts (no cloning of any person). |
| Music | None. |

## Pages shown

`/` (landing), `/app` (dashboard), `/app/desk`, `/app/risk`, `/app/trade/btc`, `/app/claims`, `/lp`,
and the Monad testnet explorer page for transaction
`0xc29c4b1fce736f4a00d98c0ef51a2552e35970fade0639a95860e92c19635cec`.

## State shown, and how it is described

| Shown | Status | Evidence |
| --- | --- | --- |
| Desk equity 99.81 AUSD, floor 94.00, 2 closed round trips, −0.19% vs the +2% target | live chain state at capture | `proof/local/desk-inventory.md` (block 70643979 and later reads) |
| Policy check PASS, then BLOCKED at 6× ("Nothing was sent to Perpl") | live UI; leverage slider moved, nothing submitted | footage |
| Gasless browser trade (relayer `0x017F…b728` → desk) | **historical**: owner-signed on 2026-10-13 10:51 UTC, not during recording; narration says "Earlier today" | `proof/receipts/testnet/browser-gasless/01-open.json` |
| Claims: nothing to claim | live; no profit claim has been made, and none is implied | footage |
| LP console: pool 5,000 AUSD, 400 deployed, four desks | live chain state; pool totals confirmed on two RPCs | footage |

Not shown or claimed: a successful profit claim, a graduation during recording, a live partial
fill, mainnet, real money, the hosted indexer (not live), phone passkeys.

## Files (in `video/remotion/out/final/`, plus subtitles and scripts in `video/remotion/out/`)

| File | Content |
| --- | --- |
| `final/imprest-main-demo.mp4` | Main product demo, captions burned in (2:33) |
| `final/imprest-main-demo-clean.mp4` | Same, no burned-in captions |
| `final/imprest-perpl-risk-demo.mp4` | Perpl Analytics / Risk Tool demo, captions burned in (1:52) |
| `final/imprest-perpl-risk-demo-clean.mp4` | Same, no burned-in captions |
| `imprest-main-demo.srt` / `.vtt` | Subtitles, main |
| `imprest-perpl-risk-demo.srt` / `.vtt` | Subtitles, Perpl |
| `imprest-main-demo-script.md`, `imprest-perpl-risk-demo-script.md` | Final narration with timings |
| `final/thumbnail-main.png`, `final/thumbnail-perpl.png` | Thumbnails from genuine frames |

Audio is loudness-normalized to -16 LUFS (true peak -1.5 dB).

Source: `video/remotion` (Remotion 4.0.535). Rebuild: `node build-timeline.cjs`, then
`npx remotion render src/index.ts MainDemo out/MainDemo.mp4`.

## Upload checklist (owner)

1. Watch each file once with sound before uploading.
2. YouTube: upload `final/imprest-main-demo.mp4`. Title "Imprest: trading credit with rules you can inspect
   (Monad Testnet demo)". Visibility **Public** or **Unlisted**, never Private. Add
   `imprest-main-demo.srt` under Subtitles and `final/thumbnail-main.png` as the thumbnail.
3. Upload `final/imprest-perpl-risk-demo.mp4` the same way: title "Imprest risk dashboard on Perpl (Monad Testnet)",
   subtitles `imprest-perpl-risk-demo.srt`, thumbnail `final/thumbnail-perpl.png`.
4. Open both links in a private window to check they play without signing in.
5. Paste the main video link into the submission's demo field, and the Perpl video link into the
   Perpl bounty's "demo video" field.
6. Add the main demo link to the README ("Demo video" line); the agent can do this once you send it.
