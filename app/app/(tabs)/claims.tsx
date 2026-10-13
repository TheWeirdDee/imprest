import { ScrollView, View } from "react-native";
import { claimPreview, deskAbi, erc20Abi } from "@imprest/core";
import { useAccount } from "../../src/account";
import { useDesk } from "../../src/data";
import { useAction } from "../../src/action";
import { network, sendWrite, verify } from "../../src/chain";
import { Button, Card, Notice, Row, TxStatusView, ausd } from "../../src/ui";
import { s } from "../../src/theme";

export default function Claims() {
  const a = useAccount();
  const d = useDesk();
  const act = useAction();
  const r = d.risk.data;
  const p = d.policy.data;
  if (!r || !p) return <ScrollView style={s.screen} contentContainerStyle={s.scroll}><Notice tone="info" title="No desk yet" /></ScrollView>;
  const t = p.tiers[r.tier]!;
  // Realized equity only (same rule and helper as the web app): unrealized PnL on open positions
  // never enters the preview. Unknown positions mean no preview and no claim.
  const positions = d.positions.data;
  const unrealized = positions ? positions.filter((x) => x.lots > 0n).reduce((acc, x) => acc + x.deltaPnlCNS + x.premiumPnlCNS, 0n) : null;
  const preview = unrealized === null ? null : claimPreview(r, unrealized, t.traderSplitBps, t.protocolSplitBps);
  const split = preview?.split ?? { gross: 0n, feesPaid: 0n, traderShare: 0n, protocolShare: 0n, poolShare: 0n };
  const reason =
    preview === null
      ? "Positions are still loading; the claim preview waits for them."
      : r.status !== 0
        ? "The desk is not active."
        : !r.flat
          ? "Close all positions before claiming. Unrealized profit cannot be claimed; the figures above are realized only."
          : preview.claimable
            ? null
            : "Realized equity is not above the high-water mark.";

  const claim = () =>
    act.run({
      label: "Claim realized profit",
      expect: async () => ({ traderBalance: String(((await verify!.readContract({ address: network.perpl.collateralToken!, abi: erc20Abi, functionName: "balanceOf", args: [a.address!] })) as bigint) + split.traderShare) }),
      send: () => sendWrite(a.account!, { address: d.desk!, abi: deskAbi, functionName: "claim" }),
      observe: async (cl, b) => ({ traderBalance: String(await cl.readContract({ address: network.perpl.collateralToken!, abi: erc20Abi, functionName: "balanceOf", args: [a.address!], blockNumber: b })) }),
    });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <Card title="Profit claim">
        <Row k={r.flat ? "Realized profit above HWM" : "Realized profit above HWM (estimate; positions open)"} v={preview ? ausd(split.gross) : "—"} />
        <Row k="Credit fees, netted first" v={ausd(split.feesPaid, 4)} />
        <Row k={`Trader share (${t.traderSplitBps / 100}%)`} v={ausd(split.traderShare)} tone="safe" />
        <Row k="Pool share" v={ausd(split.poolShare)} />
        <Row k="Protocol share" v={ausd(split.protocolShare)} />
        <Row k="High-water mark" v={ausd(r.hwm)} />
      </Card>
      {reason ? <Notice tone="warn" title="Not eligible" body={reason} /> : <Notice tone="safe" title="Eligible" body="Payout is checked on an independent RPC after the claim." />}
      <View><Button label="Claim realized profit" onPress={claim} disabled={Boolean(reason) || ["requested", "submitted", "confirming"].includes(act.state.kind)} /></View>
      <TxStatusView state={act.state} />
    </ScrollView>
  );
}
