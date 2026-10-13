"""Word timings for the pitch recording (faster-whisper, local). Captions use the owner's script
text; whisper only supplies when each word is spoken."""
import json, pathlib, subprocess, sys

import numpy as np

from faster_whisper import WhisperModel

src = sys.argv[1]
out = pathlib.Path(__file__).parent / "words.json"
model = WhisperModel("small.en", device="cpu", compute_type="int8")
# Decode with ffmpeg (16 kHz mono float32) instead of the bundled PyAV, which is incompatible here.
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, dtype=np.float32)
segments, info = model.transcribe(audio, word_timestamps=True, vad_filter=False, beam_size=5)
words = []
text = []
for seg in segments:
    text.append(seg.text)
    for w in seg.words:
        words.append({"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
out.write_text(json.dumps(words, indent=1), encoding="utf-8")
print(f"{len(words)} words, {info.duration:.1f}s")
print(" ".join(text))
