"""Caption lines for the pitch: timings from the local transcription, words corrected where the
recogniser misheard names (checked against the owner's script). What was actually said is kept."""
import json, pathlib, re

HERE = pathlib.Path(__file__).parent
words = json.loads((HERE / "words.json").read_text(encoding="utf-8"))

# (misheard sequence) -> (what was said), matched on lowercase words without punctuation.
FIXES = [
    (["impress", "aim"], ["Imprest's", "aim"]),
    (["impress"], ["Imprest"]),
    (["impress."], ["Imprest."]),
    (["monad", "testnets"], ["Monad", "Testnet"]),
    (["connects", "the", "purpose", "testnet"], ["connects", "to", "Perpl's", "testnet"]),
    (["beautiful", "fonts."], ["real", "funds."]),
    (["their", "own", "to", "trade"], ["room", "to", "trade"]),
    (["their", "own", "trade", "and"], ["their", "own", "stake", "and"]),
    (["or", "not", "the", "money"], ["but", "not", "the", "money"]),
    (["access", "capital"], ["access", "to", "capital"]),
    (["what", "it", "needs"], ["what", "they", "need"]),
]


def norm(t: str) -> str:
    return t.lower().strip()


def apply_fixes(ws):
    out = []
    i = 0
    while i < len(ws):
        for bad, good in FIXES:
            seg = [norm(w["text"]) for w in ws[i : i + len(bad)]]
            if seg == bad or [s.strip(".,?") for s in seg] == [b.strip(".,?") for b in bad]:
                n = len(bad)
                start, end = ws[i]["start"], ws[i + n - 1]["end"]
                trail = re.search(r"[.,?]$", ws[i + n - 1]["text"])
                step = (end - start) / max(1, len(good))
                for k, g in enumerate(good):
                    text = g if not (k == len(good) - 1 and trail and not g.endswith(trail.group())) else g + trail.group()
                    out.append({"text": text, "start": round(start + k * step, 3), "end": round(start + (k + 1) * step, 3)})
                i += n
                break
        else:
            out.append(ws[i])
            i += 1
    return out


ws = apply_fixes(words)
# Portrait captions: short lines (about 4 words / 24 characters), break after punctuation.
lines, cur = [], []
for w in ws:
    cur.append(w)
    text = " ".join(x["text"] for x in cur)
    if re.search(r"[.?!]$", w["text"]) or (re.search(r",$", w["text"]) and len(cur) >= 3) or len(cur) >= 5 or len(text) >= 24:
        lines.append(cur)
        cur = []
if cur:
    lines.append(cur)
caps = []
for i, l in enumerate(lines):
    start = l[0]["start"]
    end = l[-1]["end"] + 0.35
    if i + 1 < len(lines):
        end = min(end, lines[i + 1][0]["start"])
    caps.append({"text": " ".join(x["text"] for x in l), "start": round(start, 3), "end": round(end, 3)})
(HERE / "captions.json").write_text(json.dumps(caps, indent=1), encoding="utf-8")


def ts(s, sep):
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms % 3600000 // 60000:02d}:{ms % 60000 // 1000:02d}{sep}{ms % 1000:03d}"


(HERE / "imprest-pitch.srt").write_text("\n".join(f"{i + 1}\n{ts(c['start'], ',')} --> {ts(c['end'], ',')}\n{c['text']}\n" for i, c in enumerate(caps)), encoding="utf-8")
(HERE / "imprest-pitch.vtt").write_text("WEBVTT\n\n" + "\n".join(f"{ts(c['start'], '.')} --> {ts(c['end'], '.')}\n{c['text']}\n" for c in caps), encoding="utf-8")
print(len(caps), "caption lines")
print("\n".join(c["text"] for c in caps))
