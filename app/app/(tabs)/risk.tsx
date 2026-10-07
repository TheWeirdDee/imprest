import { ScrollView, Text, View } from "react-native";
import { ENFORCE_REASON, INT256_MIN, notional, riskLevel } from "@imprest/core";
import { useDesk } from "../../src/data";
import { network } from "../../src/chain";
import { Card, Notice, Row, ausd } from "../../src/ui";
import { c, s } from "../../src/theme";

function Bar({ used, max }: { used: number; max: number }) {
  const p = max > 0 ? Math.min(1, Math.max(0, used / max)) : 0;
  return (
    <View style={{ height: 6, backgroundColor: c.surface3, borderRadius: 3, marginTop: 2, marginBottom: 6 }}>
      <View style={{ height: 6, width: `${p * 100}%`, backgroundColor: p >= 1 ? c.breach : p > 0.75 ? c.warn : c.accent, borderRadius: 3 }} />
    </View>
  );
}

export default function Risk() {
  const d = useDesk();
  const r = d.risk.data;
  const p = d.policy.data;
  if (!r || !p) return <ScrollView style={s.screen} contentContainerStyle={s.scroll}><Notice tone="info" title="No desk yet" body="Risk limits apply once a desk exists." /></ScrollView>;
  const gross = (d.positions.data ?? []).filter((x) => x.lots > 0n).reduce((a, x) => a + notional(network.perpl.markets.find((m) => m.perpId === x.perpId)!, x.lots, x.markPns), 0n);
  const lev = r.equity > 0n ? Number(gross) / Number(r.equity) : 0;
  const level = riskLevel(r);
  const ddUsed = r.startEquity - r.equity;
  const ddMax = r.startEquity - r.floor;
  const hasDaily = r.dailyFloor !== INT256_MIN;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <Notice
        tone={level === "breach" ? "breach" : level === "warning" ? "warn" : "safe"}
        title={level === "breach" ? "BREACH: below a loss limit" : level === "warning" ? "Near the risk floor" : "Healthy"}
        body={`${ausd(r.equity - r.floor)} AUSD above the risk floor.`}
      />
      <Card title="Utilization">
        <Row k="Leverage" v={`${lev.toFixed(2)}x / ${(p.maxLeverageHdths / 100).toFixed(2)}x`} />
        <Bar used={lev} max={p.maxLeverageHdths / 100} />
        <Row k="Drawdown" v={`${ausd(ddUsed > 0n ? ddUsed : 0n)} / ${ausd(ddMax)}`} />
        <Bar used={Number(ddUsed)} max={Number(ddMax)} />
        <Row k="Daily loss" v={hasDaily ? `${ausd(r.dayStartEquity - r.equity > 0n ? r.dayStartEquity - r.equity : 0n)} / ${ausd((r.dayStartEquity * BigInt(p.dailyLossBps)) / 10_000n)}` : "no trade today"} />
        <Row k="Exposure" v={ausd(gross)} />
        <Row k="Credit fee" v={`${ausd(r.feeOutstanding, 4)} / ${ausd(r.feeCap)}`} />
        <Bar used={Number(r.feeOutstanding)} max={Number(r.feeCap)} />
      </Card>
      <Card title="Limits (enforced by the desk contract)">
        <Row k="Equity floor" v={ausd(r.floor)} />
        <Row k="Current equity" v={ausd(r.equity)} />
        <Row k="Max leverage" v={`${(p.maxLeverageHdths / 100).toFixed(2)}x`} />
        <Row k="Price band" v={`${p.priceBandBps} bps`} />
        <Row k="Markets" v={p.markets.map((m) => network.perpl.markets.find((x) => BigInt(x.perpId) === m.perpId)?.symbol ?? String(m.perpId)).join(", ")} />
        <Row k="Order types" v="IOC / FOK" />
        <Row k="Enforcement" v={ENFORCE_REASON[r.enforceReason] ?? "None"} />
      </Card>
      <Text style={s.small}>Read from the desk contract (riskState). Display only; the contract decides.</Text>
    </ScrollView>
  );
}
