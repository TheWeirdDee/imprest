import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CheckCircle2, CircleAlert, Clock, ShieldAlert, XCircle } from "lucide-react-native";
import { STATE_LABEL, formatUnitsFixed, type ActionState } from "@imprest/core";
import { network } from "./chain";
import { c, mono, s } from "./theme";

export const ausd = (v: bigint | null | undefined, f = 2) => (v === null || v === undefined ? "—" : formatUnitsFixed(v, 6, f));

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={s.card}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Row({ k, v, tone }: { k: string; v: ReactNode; tone?: "safe" | "breach" | "warn" }) {
  const color = tone === "safe" ? c.safe : tone === "breach" ? c.breach : tone === "warn" ? c.warn : c.fg;
  return (
    <View style={s.row}>
      <Text style={s.label}>{k}</Text>
      {typeof v === "string" ? <Text style={[s.value, { color }]}>{v}</Text> : v}
    </View>
  );
}

export function Button({ label, onPress, disabled, variant = "primary" }: { label: string; onPress: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "long" | "short" | "danger" }) {
  const bg = { primary: c.fg, secondary: c.surface, long: c.long, short: c.short, danger: c.breachBg }[variant];
  const fg = variant === "secondary" ? c.fg : variant === "danger" ? c.breach : "#fff";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        borderColor: c.lineStrong,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderRadius: 6,
        paddingVertical: 12,
        alignItems: "center",
      })}
    >
      <Text style={{ color: fg, fontWeight: "600", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ tone, title, body }: { tone: "info" | "warn" | "breach" | "safe"; title: string; body?: string }) {
  const map = { info: [c.surface2, c.fg2], warn: [c.warnBg, c.warn], breach: [c.breachBg, c.breach], safe: [c.safeBg, c.safe] } as const;
  const [bg, fg] = map[tone];
  const Icon = tone === "breach" ? ShieldAlert : tone === "safe" ? CheckCircle2 : CircleAlert;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: 6, padding: 12, flexDirection: "row", gap: 8 }}>
      <Icon size={16} color={fg} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: fg, fontWeight: "600", fontSize: 13 }}>{title}</Text>
        {body ? <Text style={{ color: c.fg2, fontSize: 12, marginTop: 2 }}>{body}</Text> : null}
      </View>
    </View>
  );
}

export function NetworkPill() {
  if (network.environment === "mainnet") return null;
  return (
    <View accessibilityLabel="Monad Testnet, test tokens only" style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderColor: c.lineStrong, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.surface }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.warn }} />
      <Text style={{ fontSize: 11, color: c.fg2 }}>Monad Testnet · test tokens only</Text>
    </View>
  );
}

/** requested -> submitted -> verifying -> verified, never optimistic. */
export function TxStatusView({ state }: { state: ActionState }) {
  if (state.kind === "idle") return null;
  const failed = state.kind === "failed" || state.kind === "verification_failed";
  const done = state.kind === "verified";
  const Icon = done ? CheckCircle2 : failed ? XCircle : Clock;
  const color = done ? c.safe : failed ? c.breach : c.fg2;
  return (
    <View accessibilityLiveRegion="polite" style={{ borderColor: c.line, borderWidth: 1, borderRadius: 6, padding: 10, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {!done && !failed && state.kind !== "unsupported_environment" && state.kind !== "pending_external_dependency" ? <ActivityIndicator size="small" color={c.accent} /> : <Icon size={15} color={color} />}
        <Text style={{ fontWeight: "600", color: c.fg, fontSize: 13 }}>{"label" in state ? state.label : ""}</Text>
        <Text style={{ color, fontSize: 13 }}>· {STATE_LABEL[state.kind]}</Text>
      </View>
      {"txHash" in state && state.txHash ? <Text style={{ fontFamily: mono, fontSize: 11, color: c.muted }}>{state.txHash}</Text> : null}
      {"reason" in state && state.reason ? <Text style={{ fontSize: 12, color: c.fg2 }}>{state.reason}</Text> : null}
    </View>
  );
}
