/**
 * Envio HyperIndex v3 handlers for Imprest. Display data only: the app and keeper never
 * use indexed state to authorize money movement.
 */
import { indexer } from "envio";

const STATUS = ["Active", "Enforcing", "Closed"];
const REASON = ["Voluntary close", "Trading floor", "Daily loss", "Fee cap"];
const ZERO = 0n;

const json = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const eid = (e: any) => `${e.transaction.hash}-${e.logIndex}`;

async function pool(context: any) {
  return context.PoolTotals.getOrCreate({
    id: "pool",
    lpDeposited: ZERO,
    lpWithdrawn: ZERO,
    deployedPrincipal: ZERO,
    principalLoss: ZERO,
    feesCollected: ZERO,
    feesWrittenOff: ZERO,
    profitShare: ZERO,
    keeperPaid: ZERO,
    desksFunded: 0,
    desksSettled: 0,
  });
}

async function logEvent(context: any, event: any, kind: string) {
  const desk = event.srcAddress.toLowerCase();
  context.DeskEvent.set({
    id: eid(event),
    desk_id: desk,
    kind,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    argsJson: json(event.params),
  });
  const d = await context.Desk.get(desk);
  if (d) context.Desk.set({ ...d, lastEventBlock: BigInt(event.block.number) });
}

// ---------- factory: dynamic registration of desks ----------
indexer.contractRegister({ contract: "DeskFactory", event: "DeskOpened" }, async ({ event, context }: any) => {
  context.chain.Desk.add(event.params.desk);
});

indexer.onEvent({ contract: "DeskFactory", event: "DeskOpened" }, async ({ event, context }: any) => {
  context.Desk.set({
    id: event.params.desk.toLowerCase(),
    trader: event.params.trader.toLowerCase(),
    cohortId: event.params.cohortId,
    accountId: undefined,
    stake: event.params.stake,
    tier: 0,
    status: "Active",
    borrowed: ZERO,
    trades: 0,
    claims: 0,
    totalPaidToTrader: ZERO,
    feesAccrued: ZERO,
    openedBlock: BigInt(event.block.number),
    openedAt: BigInt(event.block.timestamp),
    lastEventBlock: BigInt(event.block.number),
    settleReason: undefined,
  });
});

indexer.onEvent({ contract: "DeskFactory", event: "CohortAdded" }, async () => {});

// ---------- desks ----------
indexer.onEvent({ contract: "Desk", event: "DeskActivated" }, async ({ event, context }: any) => {
  const desk = event.srcAddress.toLowerCase();
  const d = await context.Desk.get(desk);
  if (d) context.Desk.set({ ...d, accountId: event.params.accountId });
  context.AccountIndex.set({ id: event.params.accountId.toString(), desk_id: desk });
  await logEvent(context, event, "DeskActivated");
});

indexer.onEvent({ contract: "Desk", event: "TradeExecuted" }, async ({ event, context }: any) => {
  const desk = event.srcAddress.toLowerCase();
  const p = event.params;
  context.Trade.set({
    id: eid(event),
    desk_id: desk,
    perpId: p.perpId,
    side: Number(p.side),
    orderType: Number(p.orderType),
    priceLimit: p.priceLimit,
    lots: p.lots,
    leverage: p.leverage,
    fillOrKill: p.fillOrKill,
    lotsBefore: p.lotsBefore,
    lotsAfter: p.lotsAfter,
    markPrice: p.markPrice,
    equityBefore: p.equityBefore,
    equityAfter: p.equityAfter,
    nonce: p.nonce,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  });
  const d = await context.Desk.get(desk);
  if (d) context.Desk.set({ ...d, trades: d.trades + 1 });
  await logEvent(context, event, "Trade");
});

indexer.onEvent({ contract: "Desk", event: "Graduated" }, async ({ event, context }: any) => {
  const desk = event.srcAddress.toLowerCase();
  const d = await context.Desk.get(desk);
  if (d) context.Desk.set({ ...d, tier: Number(event.params.toTier), borrowed: d.borrowed + event.params.credit });
  await logEvent(context, event, "Graduated");
});

indexer.onEvent({ contract: "Desk", event: "Claimed" }, async ({ event, context }: any) => {
  const desk = event.srcAddress.toLowerCase();
  const d = await context.Desk.get(desk);
  if (d) context.Desk.set({ ...d, claims: d.claims + 1, totalPaidToTrader: d.totalPaidToTrader + event.params.traderShare });
  await logEvent(context, event, "Claimed");
});

indexer.onEvent({ contract: "Desk", event: "FeesAccrued" }, async ({ event, context }: any) => {
  const desk = event.srcAddress.toLowerCase();
  const d = await context.Desk.get(desk);
  if (d) context.Desk.set({ ...d, feesAccrued: d.feesAccrued + event.params.added });
  await logEvent(context, event, "FeesAccrued");
});

indexer.onEvent({ contract: "Desk", event: "EnforcementStarted" }, async ({ event, context }: any) => {
  const desk = event.srcAddress.toLowerCase();
  const d = await context.Desk.get(desk);
  if (d) context.Desk.set({ ...d, status: STATUS[1] });
  await logEvent(context, event, "EnforcementStarted");
});

indexer.onEvent({ contract: "Desk", event: "EnforceCloseFailed" }, async ({ event, context }: any) => {
  await logEvent(context, event, "EnforceCloseFailed");
});

indexer.onEvent({ contract: "Desk", event: "PartialClose" }, async ({ event, context }: any) => {
  await logEvent(context, event, "PartialClose");
});

indexer.onEvent({ contract: "Desk", event: "SettlementPending" }, async ({ event, context }: any) => {
  await logEvent(context, event, "SettlementPending");
});

indexer.onEvent({ contract: "Desk", event: "Settled" }, async ({ event, context }: any) => {
  const desk = event.srcAddress.toLowerCase();
  const p = event.params;
  context.Settlement.set({
    id: eid(event),
    desk_id: desk,
    reason: REASON[Number(p.reason)] ?? String(p.reason),
    borrowed: p.borrowed,
    equity: p.equity,
    principalRepaid: p.principalRepaid,
    principalLoss: p.principalLoss,
    keeper: p.keeper.toLowerCase(),
    keeperPaid: p.keeperPaid,
    feesAccruedTotal: p.feesAccruedTotal,
    feesCollected: p.feesCollected,
    feesWrittenOff: p.feesWrittenOff,
    traderRemainder: p.traderRemainder,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  });
  const d = await context.Desk.get(desk);
  if (d) {
    context.Desk.set({
      ...d,
      status: STATUS[2],
      borrowed: ZERO,
      settleReason: REASON[Number(p.reason)],
      totalPaidToTrader: d.totalPaidToTrader + p.traderRemainder,
    });
  }
  const t = await pool(context);
  context.PoolTotals.set({ ...t, keeperPaid: t.keeperPaid + p.keeperPaid });
  await logEvent(context, event, "Settled");
});

// ---------- pool ----------
indexer.onEvent({ contract: "ImprestPool", event: "Deposit" }, async ({ event, context }: any) => {
  const t = await pool(context);
  context.PoolTotals.set({ ...t, lpDeposited: t.lpDeposited + event.params.assets });
});

indexer.onEvent({ contract: "ImprestPool", event: "Withdraw" }, async ({ event, context }: any) => {
  const t = await pool(context);
  context.PoolTotals.set({ ...t, lpWithdrawn: t.lpWithdrawn + event.params.assets });
});

indexer.onEvent({ contract: "ImprestPool", event: "DeskFunded" }, async ({ event, context }: any) => {
  const t = await pool(context);
  context.PoolTotals.set({ ...t, deployedPrincipal: t.deployedPrincipal + event.params.credit, desksFunded: t.desksFunded + 1 });
});

indexer.onEvent({ contract: "ImprestPool", event: "DeskSettled" }, async ({ event, context }: any) => {
  const p = event.params;
  const t = await pool(context);
  context.PoolTotals.set({
    ...t,
    deployedPrincipal: t.deployedPrincipal - p.principalRepaid - p.principalLoss,
    principalLoss: t.principalLoss + p.principalLoss,
    feesCollected: t.feesCollected + p.feesCollected,
    feesWrittenOff: t.feesWrittenOff + p.feesWrittenOff,
    desksSettled: t.desksSettled + 1,
  });
});

indexer.onEvent({ contract: "ImprestPool", event: "IncomeReceived" }, async ({ event, context }: any) => {
  const t = await pool(context);
  context.PoolTotals.set({
    ...t,
    feesCollected: t.feesCollected + event.params.feesCollected,
    profitShare: t.profitShare + event.params.profitShare,
  });
});

indexer.onEvent({ contract: "ImprestPool", event: "ExposureRecorded" }, async ({ event, context }: any) => {
  context.PerpExposure.set({ id: event.params.perpId.toString(), gross: event.params.perpGross, updatedBlock: BigInt(event.block.number) });
});

// ---------- Perpl venue liquidations of desk accounts ----------
indexer.onEvent({ contract: "PerplExchange", event: "PositionLiquidated" }, async ({ event, context }: any) => {
  const idx = await context.AccountIndex.get(event.params.posAccountId.toString());
  if (!idx) return; // not an Imprest desk
  context.VenueLiquidation.set({
    id: eid(event),
    desk_id: idx.desk_id,
    perpId: event.params.perpId,
    liqLotLNS: event.params.liqLotLNS,
    markPricePNS: event.params.markPricePNS,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
  });
});
