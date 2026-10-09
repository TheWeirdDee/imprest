import { ImageResponse } from "next/og";

export const alt = "Imprest: trading credit with risk enforced at the order layer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f6f5f1", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="5" fill="#16181c" />
            <path d="M7 16.5V7.5M12 16.5V10M17 16.5V12.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#16181c" }}>Imprest</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, color: "#16181c", lineHeight: 1.1, letterSpacing: -1.5 }}>Trading credit with risk enforced at the order layer.</div>
          <div style={{ fontSize: 30, color: "#3f444c" }}>Funded trading desks for perpetual futures on Perpl (Monad).</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: "#5b5f68" }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#8a5f0d" }} />
          Monad testnet · test tokens only
        </div>
      </div>
    ),
    size,
  );
}
