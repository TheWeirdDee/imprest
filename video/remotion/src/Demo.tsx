import React from "react";
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import timeline from "./timeline.json";

type Box = { x: number; y: number; w: number; h: number };
type Fx = { at: number; kind: "spot" | "circle" | "underline"; box: Box; zoom?: boolean };
type Scene = (typeof timeline.main.scenes)[number] & { fx: Fx[] };

const INK = "#16181c";
const MARK = "#E8590C"; // marker colour: stands out against the light, monochrome product
const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const XFADE = 8; // frames of cross-fade between scenes

export const Demo: React.FC<{ video: "main" | "perpl"; captions: boolean }> = ({ video, captions }) => {
  const t = timeline[video];
  return (
    <AbsoluteFill style={{ backgroundColor: "#f6f5f1" }}>
      {t.scenes.map((s, i) => (
        <Sequence key={s.id} from={s.start} durationInFrames={s.frames + (i < t.scenes.length - 1 ? XFADE : 0)} name={s.id}>
          <SceneView scene={s as Scene} first={i === 0} />
        </Sequence>
      ))}
      {t.scenes.map((s) => (
        <Sequence key={`a-${s.id}`} from={s.start + s.audioAt} name={`voice ${s.id}`}>
          <Audio src={staticFile(s.audio)} />
        </Sequence>
      ))}
      {captions && <Captions lines={t.captions} />}
    </AbsoluteFill>
  );
};

const SceneView: React.FC<{ scene: Scene; first: boolean }> = ({ scene, first }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = first ? 1 : interpolate(frame, [0, XFADE], [0, 1], { extrapolateRight: "clamp" });

  // The active effect is the latest one that has started.
  const active = [...scene.fx].reverse().find((f) => frame >= f.at * fps);
  const zoomFx = [...scene.fx].reverse().find((f) => f.zoom && frame >= f.at * fps);
  const z = zoomFx ? spring({ frame: frame - zoomFx.at * fps, fps, config: { damping: 200 }, durationInFrames: 30 }) : 0;
  const { scale, tx, ty } = zoomFx ? zoomFor(zoomFx.box) : { scale: 1, tx: 0, ty: 0 };
  const s = 1 + (scale - 1) * z;

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <AbsoluteFill style={{ transform: `translate(${tx * z}px, ${ty * z}px) scale(${s})`, transformOrigin: "0 0" }}>
        <OffthreadVideo src={staticFile(`clips/${scene.clip}.webm`)} startFrom={Math.round(scene.from * fps)} muted style={{ width: 1920, height: 1080 }} />
        {active && <Effect fx={active} since={frame - active.at * fps} />}
      </AbsoluteFill>
      <Label text={scene.label} />
    </AbsoluteFill>
  );
};

/** A gentle zoom (at most 1.35x) that keeps the box in view with context around it. */
function zoomFor(b: Box) {
  const scale = Math.min(1.35, Math.max(1, Math.min(1920 / (b.w + 240), 1080 / (b.h + 240))));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // Translate so the box centre moves towards the frame centre, without exposing an edge.
  let tx = 960 - cx * scale;
  let ty = 540 - cy * scale;
  tx = Math.min(0, Math.max(1920 - 1920 * scale, tx));
  ty = Math.min(0, Math.max(1080 - 1080 * scale, ty));
  return { scale, tx, ty };
}

const Effect: React.FC<{ fx: Fx; since: number }> = ({ fx, since }) => {
  const p = interpolate(since, [0, 18], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const b = fx.box;
  if (fx.kind === "spot") {
    // Dim everything except the box, so the eye goes where the narration is.
    return (
      <div
        style={{
          position: "absolute",
          left: b.x - 10,
          top: b.y - 10,
          width: b.w + 20,
          height: b.h + 20,
          borderRadius: 14,
          boxShadow: `0 0 0 4000px rgba(14,16,20,${0.38 * p})`,
          outline: `3px solid rgba(232,89,12,${0.9 * p})`,
        }}
      />
    );
  }
  if (fx.kind === "underline") {
    const len = b.w * p;
    return (
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1920} height={1080}>
        <path d={`M ${b.x} ${b.y + b.h + 6} q ${len / 2} 7 ${len} -2`} stroke={MARK} strokeWidth={6} fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  // Hand-drawn style circle that draws itself around the item.
  const rx = b.w / 2 + 26;
  const ry = b.h / 2 + 22;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const circumference = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  return (
    <svg style={{ position: "absolute", left: 0, top: 0 }} width={1920} height={1080}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(-2 ${cx} ${cy})`} fill="none" stroke={MARK} strokeWidth={6} strokeLinecap="round" strokeDasharray={circumference * 1.08} strokeDashoffset={circumference * 1.08 * (1 - p)} />
      <ellipse cx={cx + 3} cy={cy - 2} rx={rx + 6} ry={ry + 3} transform={`rotate(1.5 ${cx} ${cy})`} fill="none" stroke={MARK} strokeOpacity={0.55} strokeWidth={3} strokeDasharray={circumference * 1.1} strokeDashoffset={circumference * 1.1 * (1 - Math.max(0, p - 0.2) / 0.8)} />
    </svg>
  );
};

const Label: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [4, 16], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 40, top: 112, opacity: o, transform: `translateY(${(1 - o) * 8}px)` }}>
      <div style={{ background: INK, color: "#fff", fontFamily: FONT, fontWeight: 600, fontSize: 30, padding: "10px 20px", borderRadius: 999, boxShadow: "0 6px 24px rgba(0,0,0,0.25)" }}>{text}</div>
    </div>
  );
};

const Captions: React.FC<{ lines: { text: string; from: number; to: number }[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const line = lines.find((l) => frame >= l.from && frame < l.to);
  if (!line) return null;
  const o = interpolate(frame, [line.from, line.from + 4], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 54, display: "flex", justifyContent: "center", opacity: o }}>
      <div style={{ maxWidth: 1380, background: "rgba(14,16,20,0.86)", color: "#fff", fontFamily: FONT, fontWeight: 600, fontSize: 46, lineHeight: 1.25, padding: "14px 30px", borderRadius: 16, textAlign: "center" }}>{line.text}</div>
    </div>
  );
};

/** Thumbnail: a genuine frame of the product with one short title. */
export const Thumbnail: React.FC<{ video: "main" | "perpl" }> = ({ video }) => {
  const isMain = video === "main";
  const clip = isMain ? "trade" : "lp";
  const at = isMain ? 27 : 67;
  return (
    <AbsoluteFill style={{ backgroundColor: "#f6f5f1" }}>
      <AbsoluteFill style={{ transform: "scale(0.6667)", transformOrigin: "0 0" }}>
        <OffthreadVideo src={staticFile(`clips/${clip}.webm`)} startFrom={at * 30} muted style={{ width: 1920, height: 1080 }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 40, bottom: 40, right: 40 }}>
        <div style={{ display: "inline-block", background: INK, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 52, lineHeight: 1.15, padding: "18px 28px", borderRadius: 18, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
          {isMain ? "Trading credit with rules you can inspect" : "Pool risk and account risk, on Perpl"}
        </div>
        <div style={{ marginTop: 12, display: "inline-block", background: "#fff", color: INK, fontFamily: FONT, fontWeight: 600, fontSize: 26, padding: "8px 16px", borderRadius: 999, border: `2px solid ${INK}` }}>
          Imprest · Monad Testnet · test tokens
        </div>
      </div>
    </AbsoluteFill>
  );
};
