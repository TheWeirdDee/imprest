import { ScrollView, Text, View } from "react-native";
import { decodeEventLog, type Hex } from "viem";
import { deskAbi } from "@imprest/core";
import { useDesk, usePoll } from "../../src/data";
import { primary } from "../../src/chain";
import { Card, Notice } from "../../src/ui";
import { c, s } from "../../src/theme";

const SHOW = new Set(["DeskActivated", "TradeExecuted", "Graduated", "Claimed", "EnforcementStarted", "Settled"]);

/** Bounded RPC scan of the desk's own events (display only). */
async function scan(desk: `0x${string}`) {
  const head = await primary.getBlockNumber();
  const start = head > 6000n ? head - 6000n : 0n;
  const out: { name: string; tx: Hex; block: bigint }[] = [];
  for (let f = start; f <= head; f += 1000n) {
    const logs = await primary.getLogs({ address: desk, fromBlock: f, toBlock: f + 999n > head ? head : f + 999n });
    for (const l of logs) {
      try {
        const ev = decodeEventLog({ abi: deskAbi, data: l.data, topics: l.topics });
        if (SHOW.has(ev.eventName)) out.push({ name: ev.eventName === "TradeExecuted" ? "Trade" : ev.eventName, tx: l.transactionHash!, block: l.blockNumber! });
      } catch {
        /* not displayed */
      }
    }
  }
  return out.reverse();
}

export default function History() {
  const d = useDesk();
  const h = usePoll(d.desk ? () => scan(d.desk!) : null, 20_000, `h:${d.desk}`);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      {!d.desk ? <Notice tone="info" title="No desk yet" /> : null}
      {h.error ? <Notice tone="warn" title="History unavailable" body={h.error} /> : null}
      {d.desk && h.data && h.data.length === 0 ? <Notice tone="info" title="No activity in the last 6,000 blocks" /> : null}
      {h.data && h.data.length > 0 ? (
        <Card title="Desk activity">
          {h.data.map((e) => (
            <View key={`${e.tx}${e.name}`} style={{ paddingVertical: 8, borderTopColor: c.line, borderTopWidth: 1 }}>
              <Text style={{ fontWeight: "600", color: c.fg }}>{e.name}</Text>
              <Text style={[s.small, { fontFamily: "monospace" }]}>block {e.block.toString()} · {e.tx.slice(0, 18)}…</Text>
            </View>
          ))}
        </Card>
      ) : null}
      <Text style={s.small}>Bounded scan of recent blocks over RPC. History never authorizes anything.</Text>
    </ScrollView>
  );
}
