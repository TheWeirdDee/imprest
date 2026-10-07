import { ScrollView, Text } from "react-native";
import { formatUnitsFixed, notional } from "@imprest/core";
import { useDesk } from "../../src/data";
import { network } from "../../src/chain";
import { Card, Notice, Row, ausd } from "../../src/ui";
import { s } from "../../src/theme";

export default function Positions() {
  const d = useDesk();
  const open = (d.positions.data ?? []).filter((p) => p.lots > 0n);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      {!d.desk ? <Notice tone="info" title="No desk yet" body="Open a desk on Home to see positions." /> : null}
      {d.desk && open.length === 0 ? <Notice tone="info" title="No open positions" body="Flat desks accrue no new credit fees and can claim." /> : null}
      {open.map((p) => {
        const m = network.perpl.markets.find((x) => x.perpId === p.perpId)!;
        const pnl = p.deltaPnlCNS + p.premiumPnlCNS;
        return (
          <Card key={p.perpId} title={`${p.symbol}-PERP · ${p.isLong ? "Long" : "Short"}`}>
            <Row k="Size" v={formatUnitsFixed(p.lots, m.lotDecimals, m.lotDecimals)} />
            <Row k="Entry" v={formatUnitsFixed(p.entryPns, m.priceDecimals, m.priceDecimals)} />
            <Row k="Mark" v={`${formatUnitsFixed(p.markPns, m.priceDecimals, m.priceDecimals)}${p.markValid ? "" : " (stale)"}`} tone={p.markValid ? undefined : "breach"} />
            <Row k="Exposure" v={ausd(notional(m, p.lots, p.markPns))} />
            <Row k="Margin" v={ausd(p.depositCNS)} />
            <Row k="Unrealized PnL" v={ausd(pnl)} tone={pnl >= 0n ? "safe" : "breach"} />
          </Card>
        );
      })}
      <Text style={s.small}>Read from Perpl getPosition for the desk&apos;s own account. Unrealized PnL cannot be claimed.</Text>
    </ScrollView>
  );
}
