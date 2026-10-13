// Builds src/timeline.json from scenes.json (edit plan), the narration manifest (durations) and the
// per-word timings, and copies footage and narration into public/. Captions come from the actual
// synthesized word timings, grouped into short lines.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const VIDEO = path.resolve(ROOT, "..");
const FPS = 30;
const LEAD = 0.35; // seconds of picture before each line starts
const scenes = JSON.parse(fs.readFileSync(path.join(ROOT, "scenes.json"), "utf8"));
const voiceOut = path.join(VIDEO, "voice", "out");
const manifest = JSON.parse(fs.readFileSync(path.join(voiceOut, "manifest.json"), "utf8"));
const narration = JSON.parse(fs.readFileSync(path.join(VIDEO, "voice", "narration.json"), "utf8").replace(/^﻿/, ""));

fs.mkdirSync(path.join(ROOT, "public", "clips"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "public", "voice"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "src"), { recursive: true });

// Caption lines: break at punctuation, or after ~6 words / 38 characters.
function captionLines(words, offset) {
  const lines = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push({ text: cur.map((w) => w.text).join(" ").replace(/\s+([,.:;?!])/g, "$1"), start: offset + cur[0].start, end: offset + cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    const text = cur.map((x) => x.text).join(" ");
    const punct = /[.?!:;]$/.test(w.text) || /^[.?!:;,]$/.test(w.text);
    if (punct && cur.length >= 3) flush();
    else if (cur.length >= 7 || text.length >= 40) flush();
  }
  flush();
  // Hold each line until the next starts (no flicker), capped at 0.6 s after the last word.
  for (let i = 0; i < lines.length; i++) lines[i].end = Math.min(lines[i + 1]?.start ?? lines[i].end + 0.6, lines[i].end + 0.6);
  return lines;
}

// The voice service reports words without punctuation; take each word (with its trailing
// punctuation) from the script itself, in order.
function withPunctuation(words, text) {
  let cursor = 0;
  const lower = text.toLowerCase();
  return words.map((w) => {
    const i = lower.indexOf(w.text.toLowerCase(), cursor);
    if (i < 0) return w;
    let end = i + w.text.length;
    while (end < text.length && /[,.?!:;]/.test(text[end])) end++;
    cursor = end;
    return { ...w, text: text.slice(i, end) };
  });
}

const out = {};
const usedClips = new Set();
for (const video of ["main", "perpl"]) {
  const durations = Object.fromEntries(manifest[video].map((r) => [r.id, r.duration]));
  const texts = Object.fromEntries(narration[video].map((r) => [r.id, r.text]));
  let t = 0;
  const rows = [];
  const captions = [];
  for (const s of scenes[video]) {
    const speech = durations[s.id];
    if (speech === undefined) throw new Error(`no narration audio for ${s.id}`);
    const dur = LEAD + speech + s.pad;
    const words = withPunctuation(JSON.parse(fs.readFileSync(path.join(voiceOut, `${s.id}.words.json`), "utf8")), texts[s.id]);
    captions.push(...captionLines(words, t + LEAD));
    rows.push({ ...s, text: texts[s.id], start: Math.round(t * FPS), frames: Math.round(dur * FPS), audioAt: Math.round(LEAD * FPS), audio: `voice/${s.id}.mp3` });
    fs.copyFileSync(path.join(voiceOut, `${s.id}.mp3`), path.join(ROOT, "public", "voice", `${s.id}.mp3`));
    usedClips.add(s.clip);
    t += dur;
  }
  out[video] = { fps: FPS, frames: Math.round(t * FPS), seconds: +t.toFixed(2), scenes: rows, captions: captions.map((c) => ({ text: c.text, from: Math.round(c.start * FPS), to: Math.round(c.end * FPS) })) };
  console.log(`${video}: ${t.toFixed(1)} s (${rows.length} scenes, ${captions.length} caption lines)`);
}
for (const c of usedClips) fs.copyFileSync(path.join(VIDEO, "capture", "clips", `${c}.webm`), path.join(ROOT, "public", "clips", `${c}.webm`));
fs.writeFileSync(path.join(ROOT, "src", "timeline.json"), JSON.stringify(out, null, 1));
