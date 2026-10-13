import { ScrollView, Text, View } from "react-native";
import { decodeEventLog, type Hex } from "viem";
import { deskAbi } from "@imprest/core";
import { useDesk, usePoll } from "../../src/data";
import { primary } from "../../src/chain";
import { Card, Notice } from "../../src/ui";
import { c, s } from "../../src/theme";

const SHOW = new Set(["DeskActivated", "TradeExecuted", "Graduated", "Claimed", "EnforcementStarted", "Settled"]);

/** The provider rejects eth_getLogs ranges over 100 blocks (same limit as the web app). */
const WINDOW = 100n;
const SPAN = 6000n;

/**
 * Bounded RPC scan of the desk's own events (display only), in 100-block windows, four at a time,
 * each retried once. Windows that still fail are counted so the screen says the list is partial
 * instead of showing "no activity".
 */
async function scan(desk: `0x${string}`) {
  const head = await primary.getBlockNumber();
  const start = head > SPAN ? head - SPAN : 0n;
  const windows: [bigint, bigint][] = [];
  for (let f = start; f <= head; f += WINDOW) windows.push([f, f + WINDOW - 1n > head ? head : f + WINDOW - 1n]);
  const out: { name: string; tx: Hex; block: bigint; index: number }[] = [];
  let missed = 0;
  const read = async ([from, to]: [bigint, bigint]) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await primary.getLogs({ address: desk, fromBlock: from, toBlock: to });
      } catch {
        /* retry once */
      }
    }
    missed++;
    return [];
  };
  for (let i = 0; i < windows.length; i += 4) {
    const batch = await Promise.all(windows.slice(i, i + 4).map(read));
    for (const logs of batch)
      for (const l of logs) {
        try {
          const ev = decodeEventLog({ abi: deskAbi, data: l.data, topics: l.topics });
          if (SHOW.has(ev.eventName)) out.push({ name: ev.eventName === "TradeExecuted" ? "Trade" : ev.eventName, tx: l.transactionHash!, block: l.blockNumber!, index: l.logIndex ?? 0 });
        } catch {
          /* not displayed */
        }
      }
  }
  // Newest first, deterministic within a block.
  out.sort((a, b) => (a.block === b.block ? b.index - a.index : a.block > b.block ? -1 : 1));
  return { events: out, missed, windows: windows.length };
}
export default function History() {
  const d = useDesk();
  const h = usePoll(d.desk ? () => scan(d.desk!) : null, 20_000, `h:${d.desk}`);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      {!d.desk ? <Notice tone="info" title="No desk yet" /> : null}
      {h.error ? <Notice tone="warn" title="History unavailable" body={h.error} /> : null}
      {h.data && h.data.missed > 0 ? <Notice tone="warn" title="History is partial" body={`${h.data.missed} of ${h.data.windows} block ranges could not be read; events in them are missing, not absent.`} /> : null}
      {d.desk && h.data && h.data.events.length === 0 && h.data.missed === 0 ? <Notice tone="info" title="No activity in the last 6,000 blocks" /> : null}
      {h.data && h.data.events.length > 0 ? (
        <Card title="Desk activity">
          {h.data.events.map((e) => (
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
