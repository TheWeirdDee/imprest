"""Generates each narration line with edge-tts (Microsoft neural voice) and its word timings.

Writes voice/out/<id>.mp3 and voice/out/<id>.words.json ([{text, start, end}] in seconds), plus
voice/out/manifest.json with each line's duration. Captions are built from the word timings.
"""
import asyncio, json, pathlib, subprocess

import edge_tts

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
spec = json.loads((HERE / "narration.json").read_text(encoding="utf-8-sig"))


def duration(p: pathlib.Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    return float(r.stdout.strip())


async def one(line: dict) -> dict:
    mp3 = OUT / f"{line['id']}.mp3"
    words = []
    comm = edge_tts.Communicate(line["text"], spec["voice"], rate=spec["rate"], boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                s = chunk["offset"] / 1e7
                words.append({"text": chunk["text"], "start": round(s, 3), "end": round(s + chunk["duration"] / 1e7, 3)})
    (OUT / f"{line['id']}.words.json").write_text(json.dumps(words, indent=1), encoding="utf-8")
    return {"id": line["id"], "duration": round(duration(mp3), 3), "words": len(words)}


async def main():
    manifest = {}
    for video in ("main", "perpl"):
        manifest[video] = [await one(l) for l in spec[video]]
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    for v, rows in manifest.items():
        total = sum(r["duration"] for r in rows)
        print(v, f"{total:.1f}s speech", [f"{r['id']}={r['duration']:.1f}" for r in rows])


asyncio.run(main())
