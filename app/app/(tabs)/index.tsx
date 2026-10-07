import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { parseAbi } from "viem";
import { DESK_STATUS, INT256_MIN, TIER_NAMES, deskAbi, deskFactoryAbi, erc20Abi, formatUnitsFixed, parseUnitsStrict, perplExchangeAbi } from "@imprest/core";
import { useAccount } from "../../src/account";
import { useDesk } from "../../src/data";
import { useAction } from "../../src/action";
import { deployed, network, sendWrite } from "../../src/chain";
import { Button, Card, Notice, NetworkPill, Row, TxStatusView, ausd } from "../../src/ui";
import { c, s } from "../../src/theme";

export default function Home() {
  const a = useAccount();
  const d = useDesk();
  const act = useAction();
  const [stake, setStake] = useState("100");
  const r = d.risk.data;
  const open = (d.positions.data ?? []).filter((p) => p.lots > 0n);
  const unrealized = open.reduce((x, p) => x + p.deltaPnlCNS + p.premiumPnlCNS, 0n);
  const busy = ["requested", "submitted", "confirming"].includes(act.state.kind);

  const openDesk = async () => {
    if (!a.account || !a.address) return;
    let amount: bigint;
    try {
      amount = parseUnitsStrict(stake, 6);
    } catch {
      return;
    }
    await act.run({
      label: "Approve AUSD",
      expect: async () => ({ allowance: amount.toString() }),
      send: () => sendWrite(a.account!, { address: network.perpl.collateralToken!, abi: erc20Abi, functionName: "approve", args: [network.imprest.factory!, amount] }),
      observe: async (cl, b) => ({ allowance: String(await cl.readContract({ address: network.perpl.collateralToken!, abi: erc20Abi, functionName: "allowance", args: [a.address!, network.imprest.factory!], blockNumber: b })) }),
    });
    await act.run({
      label: "Open desk",
      expect: async () => ({ perplBalance: amount.toString() }),
      send: () => sendWrite(a.account!, { address: network.imprest.factory!, abi: deskFactoryAbi, functionName: "openDesk", args: [amount, 0n] }),
      observe: async (cl, b) => {
        const desks = (await cl.readContract({ address: network.imprest.factory!, abi: deskFactoryAbi, functionName: "getDesks", args: [a.address!], blockNumber: b })) as readonly `0x${string}`[];
        const acct: any = await cl.readContract({ address: network.perpl.exchange!, abi: perplExchangeAbi as any, functionName: "getAccountByAddr", args: [desks[desks.length - 1]!], blockNumber: b });
        return { perplBalance: String(acct.balanceCNS) };
      },
    });
    d.refreshAll();
  };

  const faucet = () =>
    act.run({
      label: "Get testnet AUSD",
      expect: async () => ({ ok: "true" }),
      send: () => sendWrite(a.account!, { address: network.ausdFaucet!.address, abi: parseAbi(["function requestFunds(address)"]), functionName: "requestFunds", args: [a.address!] }),
      observe: async () => ({ ok: "true" }),
    });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <NetworkPill />
      {a.status !== "ready" ? (
        <Card title="Account">
          <Text style={s.body}>Sign in with a passkey. Your account is derived with Mera: no seed phrase, no extension, no custody.</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            <Button label={a.status === "connecting" ? "Waiting for passkey…" : "Create passkey account"} onPress={a.createAccount} disabled={a.status === "connecting"} />
            <Button label="I already have one" variant="secondary" onPress={a.signIn} disabled={a.status === "connecting"} />
          </View>
          {a.error ? <View style={{ marginTop: 10 }}><Notice tone="warn" title={a.error.code} body={a.error.message} /></View> : null}
        </Card>
      ) : (
        <Card title="Account">
          <Text style={[s.value, { fontSize: 12 }]} selectable>{a.address}</Text>
          <Row k="AUSD" v={ausd(d.balances.data?.ausd)} />
          <Row k={network.nativeSymbol} v={d.balances.data ? formatUnitsFixed(d.balances.data.native, 18, 4) : "—"} />
          {network.ausdFaucet ? <View style={{ marginTop: 8 }}><Button label="Get 10,000 testnet AUSD" variant="secondary" onPress={faucet} disabled={busy} /></View> : null}
        </Card>
      )}

      {!deployed ? <Notice tone="warn" title="Contracts pending deployment on this network" /> : null}

      {a.status === "ready" && deployed && !d.desk ? (
        <Card title="Open an evaluation desk">
          <Text style={s.body}>Stake AUSD as first-loss capital. The desk opens its own Perpl account; graduation adds restricted credit.</Text>
          <TextInput value={stake} onChangeText={setStake} keyboardType="decimal-pad" accessibilityLabel="Stake in AUSD" style={{ borderColor: c.lineStrong, borderWidth: 1, borderRadius: 6, padding: 10, marginTop: 10, fontFamily: "monospace" }} />
          <View style={{ marginTop: 10 }}><Button label="Approve and open desk" onPress={openDesk} disabled={busy} /></View>
        </Card>
      ) : null}

      {r ? (
        <Card title={`Desk · ${TIER_NAMES[r.tier] ?? `Tier ${r.tier}`} · ${DESK_STATUS[r.status]}`}>
          <Row k="Equity" v={`${ausd(r.equity)} AUSD`} />
          <Row k="Your stake" v={ausd(r.originalStake)} />
          <Row k="Restricted credit" v={ausd(r.borrowed)} />
          <Row k="Unrealized PnL" v={ausd(unrealized)} tone={unrealized >= 0n ? "safe" : "breach"} />
          <Row k="High-water mark" v={ausd(r.hwm)} />
          <Row k="Risk floor" v={ausd(r.floor)} />
          <Row k="Distance to floor" v={ausd(r.equity - r.floor)} tone={r.equity < r.floor ? "breach" : undefined} />
          <Row k="Daily loss remaining" v={r.dailyFloor === INT256_MIN ? "no trade today" : ausd(r.equity - r.dailyFloor)} />
          <Row k="Open positions" v={String(open.length)} />
        </Card>
      ) : null}

      <TxStatusView state={act.state} />
    </ScrollView>
  );
}
