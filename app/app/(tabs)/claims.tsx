import { ScrollView, View } from "react-native";
import { accounting, deskAbi, erc20Abi } from "@imprest/core";
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
  const split = accounting.claimSplit(r.equity, r.hwm, r.feeOutstanding, BigInt(t.traderSplitBps), BigInt(t.protocolSplitBps));
  const reason = !r.flat
    ? "Close all positions before claiming. Unrealized profit cannot be claimed."
    : split.gross === 0n
      ? "Realized equity is not above the high-water mark."
      : r.status !== 0
        ? "The desk is not active."
        : null;

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
        <Row k="Realized profit above HWM" v={ausd(split.gross)} />
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
