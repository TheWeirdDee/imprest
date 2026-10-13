import React from "react";
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import captions from "./pitch-captions.json";

// Owner's portrait pitch (464x848), rendered at exactly 2x so the aspect ratio is unchanged.
export const PITCH_W = 928;
export const PITCH_H = 1696;
export const PITCH_SECONDS = 117.166667;

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const INK = "#16181c";

type Crop = { x: number; y: number; w: number; h: number };
type Shot = { clip: string; at: number; crop: Crop };
type BRoll = { from: number; to: number; label: string; shots: Shot[] };

// Genuine product footage (captured 2026-10-13 from the live testnet site), shown while the
// speaker describes that part of the product. Crops are in 1920x1080 source coordinates.
const BROLL: BRoll[] = [
  { from: 20.3, to: 25.85, label: "Imprest · live testnet app", shots: [{ clip: "hook", at: 10, crop: { x: 100, y: 160, w: 860, h: 640 } }] },
  {
    from: 25.95, to: 35.0, label: "Evaluation → funded account",
    shots: [
      { clip: "desk", at: 11, crop: { x: 380, y: 490, w: 760, h: 185 } },
      { clip: "desk", at: 15.5, crop: { x: 1125, y: 500, w: 765, h: 200 } },
    ],
  },
  { from: 42.1, to: 49.3, label: "Order checks · rules enforced", shots: [{ clip: "trade", at: 23.6, crop: { x: 1385, y: 110, w: 500, h: 940 } }] },
  { from: 49.35, to: 56.0, label: "Progress and risk", shots: [{ clip: "risk", at: 11, crop: { x: 375, y: 320, w: 745, h: 225 } }] },
  { from: 71.85, to: 77.4, label: "Perpl testnet market", shots: [{ clip: "trade", at: 9, crop: { x: 655, y: 90, w: 708, h: 800 } }] },
  { from: 77.45, to: 85.45, label: "A real testnet transaction", shots: [{ clip: "receipt", at: 12, crop: { x: 55, y: 610, w: 1080, h: 330 } }] },
  { from: 85.5, to: 90.75, label: "Payouts: not yet verified", shots: [{ clip: "claims", at: 10, crop: { x: 368, y: 240, w: 660, h: 430 } }] },
];

export const Pitch: React.FC<{ showCaptions: boolean }> = ({ showCaptions }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* The speaker, with the original audio, for the whole video. */}
      <OffthreadVideo src={staticFile("pitch/pitch.mp4")} style={{ width: PITCH_W, height: PITCH_H }} />
      {BROLL.map((b) => (
        <Sequence key={b.from} from={Math.round(b.from * fps)} durationInFrames={Math.round((b.to - b.from) * fps)} name={b.label}>
          <BRollView b={b} />
        </Sequence>
      ))}
      {showCaptions && <Captions />}
    </AbsoluteFill>
  );
};

const BRollView: React.FC<{ b: BRoll }> = ({ b }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.round((b.to - b.from) * fps);
  const inOut = Math.min(interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [total - 8, total], [1, 0], { extrapolateLeft: "clamp" }));
  const per = total / b.shots.length;
  const idx = Math.min(b.shots.length - 1, Math.floor(frame / per));
  const local = frame - idx * per;
  return (
    <AbsoluteFill style={{ opacity: inOut }}>
      {/* Background: the speaker's own shot, blurred and dimmed, so the cutaway stays in context. */}
      <AbsoluteFill style={{ filter: "blur(26px) brightness(0.45)", transform: "scale(1.12)" }}>
        <OffthreadVideo src={staticFile("pitch/pitch.mp4")} muted startFrom={Math.round(b.from * fps)} style={{ width: PITCH_W, height: PITCH_H }} />
      </AbsoluteFill>
      <Sequence from={Math.round(idx * per)} durationInFrames={Math.round(per)} key={idx}>
        <Card shot={b.shots[idx]!} frames={Math.round(per)} />
      </Sequence>
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ background: "#fff", color: INK, fontFamily: FONT, fontWeight: 700, fontSize: 34, padding: "12px 24px", borderRadius: 999, boxShadow: "0 8px 30px rgba(0,0,0,0.35)" }}>{b.label}</div>
      </div>
      <div style={{ position: "absolute", top: 222, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.85)", fontFamily: FONT, fontWeight: 600, fontSize: 24 }}>
        Monad Testnet · test tokens only
      </div>
      {local < 0 ? null : null}
    </AbsoluteFill>
  );
};

/** One product shot: the crop fitted into the portrait frame with a slow push-in. */
const Card: React.FC<{ shot: Shot; frames: number }> = ({ shot, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxW = 860;
  const maxH = 960;
  const k = Math.min(maxW / shot.crop.w, maxH / shot.crop.h);
  const cw = Math.round(shot.crop.w * k);
  const ch = Math.round(shot.crop.h * k);
  const push = interpolate(frame, [0, frames], [1, 1.05], { easing: Easing.inOut(Easing.quad) });
  const appear = interpolate(frame, [0, 10], [0.96, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 150 }}>
      <div style={{ width: cw, height: ch, overflow: "hidden", borderRadius: 22, background: "#f6f5f1", boxShadow: "0 24px 70px rgba(0,0,0,0.55)", border: "3px solid rgba(255,255,255,0.9)", transform: `scale(${appear})` }}>
        <div style={{ width: 1920 * k, height: 1080 * k, transform: `translate(${-shot.crop.x * k}px, ${-shot.crop.y * k}px) scale(${push})`, transformOrigin: `${(shot.crop.x + shot.crop.w / 2) * k}px ${(shot.crop.y + shot.crop.h / 2) * k}px` }}>
          <OffthreadVideo src={staticFile(`clips/${shot.clip}.webm`)} muted startFrom={Math.round(shot.at * fps)} style={{ width: 1920 * k, height: 1080 * k }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const c = captions.find((x) => t >= x.start && t < x.end);
  if (!c) return null;
  const o = interpolate(t, [c.start, c.start + 0.12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 40, right: 40, bottom: 120, display: "flex", justifyContent: "center", opacity: o }}>
      <div style={{ background: "rgba(14,16,20,0.82)", color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 58, lineHeight: 1.18, padding: "14px 26px", borderRadius: 18, textAlign: "center", maxWidth: 820 }}>{c.text}</div>
    </div>
  );
};
