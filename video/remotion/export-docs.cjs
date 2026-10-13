// Writes SRT and VTT subtitles and the final narration scripts from src/timeline.json.
const fs = require("fs");
const path = require("path");
const tl = require("./src/timeline.json");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

const ts = (frames, fps, sep) => {
  const ms = Math.round((frames / fps) * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const r = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s}${sep}${r}`;
};
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

for (const [video, name] of [["main", "imprest-main-demo"], ["perpl", "imprest-perpl-risk-demo"]]) {
  const t = tl[video];
  const srt = t.captions.map((c, i) => `${i + 1}\n${ts(c.from, t.fps, ",")} --> ${ts(c.to, t.fps, ",")}\n${c.text}\n`).join("\n");
  const vtt = "WEBVTT\n\n" + t.captions.map((c) => `${ts(c.from, t.fps, ".")} --> ${ts(c.to, t.fps, ".")}\n${c.text}\n`).join("\n");
  fs.writeFileSync(path.join(OUT, `${name}.srt`), srt);
  fs.writeFileSync(path.join(OUT, `${name}.vtt`), vtt);
  const script = [`# ${name} — final narration (${mmss(t.seconds)}, voice: en-US-AndrewNeural)`, ""]
    .concat(t.scenes.map((s) => `**${mmss(s.start / t.fps)}** · ${s.label} · footage: ${s.clip} @ ${s.from}s\n\n${s.text}\n`))
    .join("\n");
  fs.writeFileSync(path.join(OUT, `${name}-script.md`), script);
  console.log(name, `${t.seconds}s`, `${t.captions.length} captions`);
}
