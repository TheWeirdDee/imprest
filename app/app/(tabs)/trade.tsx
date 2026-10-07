import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { checkPolicy, deskAbi, formatUnitsFixed, notional, parseUnitsStrict, perplExchangeAbi, type OrderIntent } from "@imprest/core";
import { useAccount } from "../../src/account";
import { useDesk, usePoll } from "../../src/data";
import { useAction } from "../../src/action";
import { fetchTicker, network, sendWrite } from "../../src/chain";
import { Button, Card, Notice, Row, TxStatusView, ausd } from "../../src/ui";
import { c, s } from "../../src/theme";

export default function Trade() {
  const a = useAccount();
  const d = useDesk();
  const act = useAction();
  const [mi, setMi] = useState(0);
  const m = network.perpl.markets[mi]!;
  const [side, setSide] = useState<0 | 1>(0);
  const [size, setSize] = useState("0.001");
  const [lev, setLev] = useState(3);
  const t = usePoll(() => fetchTicker(m.perpId), 3000, `t:${m.perpId}`);
  const pos = d.positions.data?.find((p) => p.perpId === m.perpId) ?? null;
  const markPns = pos?.markPns && pos.markPns > 0n ? pos.markPns : t.data?.mark ? BigInt(t.data.mark) : null;
  const r = d.risk.data;
  const p = d.policy.data;
  const price = markPns === null ? 0n : side === 0 ? markPns + (markPns * 20n) / 10_000n : markPns - (markPns * 20n) / 10_000n;
  const lots = useMemo(() => {
    try {
      return parseUnitsStrict(size, m.lotDecimals);
    } catch {
      return 0n;
    }
  }, [size, m.lotDecimals]);
  const order: OrderIntent = { perpId: BigInt(m.perpId), side, priceLimit: price, lots, leverage: BigInt(lev * 100), reduceOnly: false, fillOrKill: false };
  const check = r && p ? checkPolicy({ order, policy: p, risk: r, markPns, markValid: pos ? pos.markValid : true, positionLots: pos?.lots ?? 0n, positionIsLong: pos && pos.lots > 0n ? pos.isLong : null }) : null;
  const n = notional(m, lots, price);
  const busy = ["requested", "submitted", "confirming"].includes(act.state.kind);

  const submit = () =>
    act.run({
      label: `${side === 0 ? "Buy" : "Sell"} ${size} ${m.symbol}`,
      expect: async () => ({ executed: "true" }),
      send: () => sendWrite(a.account!, { address: d.desk!, abi: deskAbi, functionName: "trade", args: [order] }),
      observe: async (cl, b) => {
        const res = (await cl.readContract({ address: network.perpl.exchange!, abi: perplExchangeAbi as any, functionName: "getPosition", args: [BigInt(m.perpId), r!.accountId], blockNumber: b })) as any;
        return { executed: "true", lotsOnVerifyRpc: String(res[0].lotLNS) };
      },
    });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {network.perpl.markets.map((x, i) => (
          <Pressable key={x.perpId} accessibilityRole="button" accessibilityState={{ selected: i === mi }} onPress={() => setMi(i)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: i === mi ? c.surface3 : "transparent" }}>
            <Text style={{ fontWeight: "600", color: i === mi ? c.fg : c.muted }}>{x.symbol}-PERP</Text>
          </Pressable>
        ))}
      </View>
      <Card title="Market">
        <Row k="Mark" v={t.data?.mark ? formatUnitsFixed(BigInt(t.data.mark), m.priceDecimals) : t.error ? "unavailable" : "…"} />
        <Row k="24h change" v={t.data?.mark && t.data?.prev ? `${(((t.data.mark - t.data.prev) / t.data.prev) * 100).toFixed(2)}%` : "—"} />
        <Text style={s.small}>Perpl {network.label.toLowerCase()} market data</Text>
      </Card>

      <Card title="Order">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Button label="Long" variant={side === 0 ? "long" : "secondary"} onPress={() => setSide(0)} /></View>
          <View style={{ flex: 1 }}><Button label="Short" variant={side === 1 ? "short" : "secondary"} onPress={() => setSide(1)} /></View>
        </View>
        <Text style={[s.label, { marginTop: 12 }]}>Size ({m.symbol})</Text>
        <TextInput value={size} onChangeText={setSize} keyboardType="decimal-pad" accessibilityLabel="Order size" style={{ borderColor: c.lineStrong, borderWidth: 1, borderRadius: 6, padding: 10, marginTop: 4, fontFamily: "monospace" }} />
        <View style={[s.row, { marginTop: 12 }]}>
          <Text style={s.label}>Leverage</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Button label="−" variant="secondary" onPress={() => setLev((v) => Math.max(1, v - 1))} />
            <Text style={[s.value, { color: lev > (p ? p.maxLeverageHdths / 100 : 5) ? c.breach : c.fg }]}>{lev.toFixed(2)}x</Text>
            <Button label="+" variant="secondary" onPress={() => setLev((v) => Math.min(10, v + 1))} />
          </View>
        </View>
        <Text style={s.small}>IOC order, limit 0.2% through mark. Maximum {p ? (p.maxLeverageHdths / 100).toFixed(2) : "5.00"}x.</Text>
      </Card>

      {r ? (
        <Card title="Before you sign">
          <Row k="Your capital (stake)" v={ausd(r.originalStake)} />
          <Row k="+ Restricted credit" v={ausd(r.borrowed)} />
          <Row k="Maximum position" v={ausd((r.equity * BigInt(p?.maxLeverageHdths ?? 500)) / 100n)} />
          <Row k="This order notional" v={ausd(n)} />
          <Row k="Risk floor" v={ausd(r.floor)} />
          <Row k="Distance to floor" v={ausd(r.equity - r.floor)} />
        </Card>
      ) : null}

      {check ? (
        check.ok ? (
          <Notice tone="safe" title="Policy check: PASS" body="Frontend validation. The desk contract re-checks every rule when you sign." />
        ) : (
          <Notice
            tone="breach"
            title="Order blocked by desk policy"
            body={`${check.checks.filter((x) => x.status === "blocked").map((x) => `${x.rule}: ${x.detail}`).join("\n")}\nNothing was sent to Perpl.`}
          />
        )
      ) : (
        <Notice tone="info" title={a.status === "ready" ? "Open a desk to trade" : "Sign in to trade"} />
      )}

      <Button label={side === 0 ? `Buy / Long ${m.symbol}` : `Sell / Short ${m.symbol}`} variant={side === 0 ? "long" : "short"} onPress={submit} disabled={!check?.ok || busy || !d.desk} />
      <TxStatusView state={act.state} />
    </ScrollView>
  );
}
