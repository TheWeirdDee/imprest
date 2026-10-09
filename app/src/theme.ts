import { StyleSheet } from "react-native";

/** Same tokens as the web app (web/src/app/globals.css). */
export const c = {
  bg: "#f6f5f1",
  surface: "#ffffff",
  surface2: "#f3f2ee",
  surface3: "#ebe9e3",
  line: "#e5e2db",
  lineStrong: "#d3cfc5",
  fg: "#16181c",
  fg2: "#3f444c",
  muted: "#5b5f68",
  accent: "#16181c",
  accentBg: "#ebe9e3",
  safe: "#1e7a4b",
  safeBg: "#e8f2ec",
  warn: "#8a5f0d",
  warnBg: "#f8f0de",
  breach: "#b3322a",
  breachBg: "#faeceb",
  long: "#17744a",
  short: "#b02f26",
};

export const mono = "monospace";

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 8, padding: 14 },
  cardTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.6, color: c.muted, textTransform: "uppercase", marginBottom: 8 },
  h1: { fontSize: 20, fontWeight: "600", color: c.fg },
  body: { fontSize: 14, color: c.fg2, lineHeight: 20 },
  small: { fontSize: 12, color: c.muted },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  label: { fontSize: 13, color: c.muted },
  value: { fontSize: 13, color: c.fg, fontFamily: mono },
});
