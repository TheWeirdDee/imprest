import { decodeErrorResult, type Hex } from "viem";
import { deskAbi, deskFactoryAbi, imprestPoolAbi, perplExchangeAbi } from "./abi/generated";

/** Application error codes (PRD directive Phase 31). Stable strings; UI keys off these. */
export type AppErrorCode =
  | "MARK_INVALID"
  | "MARK_STALE"
  | "LEVERAGE_EXCEEDED"
  | "PRICE_OUTSIDE_BAND"
  | "FLOOR_BREACH"
  | "DAILY_LOSS_EXCEEDED"
  | "MARKET_NOT_ALLOWED"
  | "ORDER_TYPE_NOT_ALLOWED"
  | "REDUCE_ONLY_INVALID"
  | "NONCE_INVALID"
  | "DEADLINE_EXPIRED"
  | "INVALID_SIGNATURE"
  | "POSITION_NOT_FLAT"
  | "CLAIM_UNREALIZED_PROFIT"
  | "NOTHING_TO_CLAIM"
  | "FEE_CAP_REACHED"
  | "EXPOSURE_CAP_REACHED"
  | "DESK_NOTIONAL_CAP_REACHED"
  | "DESK_NOT_ACTIVE"
  | "DESK_HEALTHY"
  | "GRADUATION_NOT_ELIGIBLE"
  | "MAX_TIER_REACHED"
  | "PAUSED"
  | "STAKE_TOO_LOW"
  | "INSUFFICIENT_IDLE"
  | "UNAUTHORIZED"
  | "VENUE_REJECTED"
  | "VENUE_NO_LIQUIDITY"
  | "VENUE_NEG_PNL_CAP"
  | "VERIFICATION_FAILED"
  | "EXTERNAL_DEPENDENCY_UNAVAILABLE"
  | "USER_REJECTED"
  | "UNKNOWN";

export interface AppError {
  code: AppErrorCode;
  title: string;
  message: string;
  /** Which layer refused: the desk contract, the Perpl venue, the pool, or the client. */
  layer: "contract" | "venue" | "pool" | "frontend" | "verification" | "network" | "wallet";
  contractError?: string;
  args?: readonly unknown[];
}

const GRADUATION_REASONS: Record<number, string> = {
  1: "Equity has not reached the tier's profit target.",
  2: "Not enough closed round-trip trades in this tier yet.",
  3: "The tier's minimum time has not elapsed.",
  4: "A paid-out profit claim is required first.",
  5: "Outstanding credit fees must be paid before moving up a tier.",
};

const fmt6 = (v: unknown) => (typeof v === "bigint" ? (Number(v) / 1e6).toFixed(2) : String(v));

/** Maps a decoded custom error (desk, pool, factory or Perpl) to a human-readable error. */
export function describeContractError(name: string, args: readonly unknown[] = []): AppError {
  const a = args;
  switch (name) {
    case "LeverageExceeded":
      return {
        code: "LEVERAGE_EXCEEDED",
        layer: "contract",
        title: "Leverage above desk limit",
        message: `Requested ${(Number(a[0]) / 100).toFixed(2)}x; this desk allows at most ${(Number(a[1]) / 100).toFixed(2)}x.`,
      };
    case "PriceOutsideBand":
      return {
        code: "PRICE_OUTSIDE_BAND",
        layer: "contract",
        title: "Limit price too far from mark",
        message: `Every order, closes included, must sit within ${String(a[2])} bps of the mark price.`,
      };
    case "MarkStale":
      return {
        code: "MARK_STALE",
        layer: "contract",
        title: "Mark price is stale",
        message: "Perpl's mark price for this market is not currently valid. New risk is refused; reduce-only orders are still allowed.",
      };
    case "FloorBreach":
      return {
        code: "FLOOR_BREACH",
        layer: "contract",
        title: "Order would breach the equity floor",
        message: `Equity ${fmt6(a[0])} vs floor ${fmt6(a[1])} AUSD. The whole transaction reverts; nothing stays on the book.`,
      };
    case "DailyLossExceeded":
      return {
        code: "DAILY_LOSS_EXCEEDED",
        layer: "contract",
        title: "Daily loss limit reached",
        message: `Equity ${fmt6(a[0])} vs today's floor ${fmt6(a[1])} AUSD.`,
      };
    case "MarketNotAllowed":
      return { code: "MARKET_NOT_ALLOWED", layer: "contract", title: "Market not allowed", message: `Perp ${String(a[0])} is not on this desk's allowlist.` };
    case "InvalidSide":
    case "InvalidLots":
      return { code: "ORDER_TYPE_NOT_ALLOWED", layer: "contract", title: "Invalid order", message: "Side must be buy or sell and size must be above zero." };
    case "ReduceOnlyInvalid":
      return { code: "REDUCE_ONLY_INVALID", layer: "contract", title: "Reduce-only mismatch", message: "A reduce-only order must close an existing position on the opposite side and cannot exceed its size." };
    case "NonceInvalid":
      return { code: "NONCE_INVALID", layer: "contract", title: "Order already used", message: `Nonce ${String(a[0])} is not above the last executed nonce ${String(a[1])}. Signed orders execute at most once.` };
    case "DeadlineExpired":
      return { code: "DEADLINE_EXPIRED", layer: "contract", title: "Signed order expired", message: "The order's deadline passed before it was submitted." };
    case "InvalidSignature":
      return { code: "INVALID_SIGNATURE", layer: "contract", title: "Signature rejected", message: "The order was not signed by this desk's trader, or a field was changed after signing." };
    case "PositionNotFlat":
      return { code: "POSITION_NOT_FLAT", layer: "contract", title: "Close all positions first", message: "Claims, graduation and closing a desk require every position to be closed. Unrealized profit cannot be claimed." };
    case "NothingToClaim":
      return { code: "NOTHING_TO_CLAIM", layer: "contract", title: "Nothing to claim", message: "Realized equity is not above the high-water mark." };
    case "FeeCapReached":
      return { code: "FEE_CAP_REACHED", layer: "contract", title: "Credit-fee cap reached", message: `Outstanding fees ${fmt6(a[0])} AUSD hit the ${fmt6(a[1])} AUSD cap. New risk is refused; reduce, claim or close.` };
    case "ExposureCapReached":
      return { code: "EXPOSURE_CAP_REACHED", layer: "pool", title: "Pool exposure cap reached", message: `This order would take the pool's gross funded exposure on perp ${String(a[0])} above its cap. Nothing was sent to Perpl.` };
    case "DeskNotionalCapReached":
      return { code: "DESK_NOTIONAL_CAP_REACHED", layer: "pool", title: "Desk notional cap reached", message: `Desk gross notional would be ${fmt6(a[0])} AUSD; the cap is ${fmt6(a[1])}. Nothing was sent to Perpl.` };
    case "DeskNotActive":
      return { code: "DESK_NOT_ACTIVE", layer: "contract", title: "Desk is not active", message: Number(a[0]) === 1 ? "The desk is under enforcement and reduce-only until settled." : "The desk is closed and settled." };
    case "DeskHealthy":
      return { code: "DESK_HEALTHY", layer: "contract", title: "Desk is healthy", message: "enforce() only proceeds for a trading breach or a fee liability at its cap." };
    case "GraduationNotEligible":
      return { code: "GRADUATION_NOT_ELIGIBLE", layer: "contract", title: "Not eligible to graduate", message: GRADUATION_REASONS[Number(a[0])] ?? "Graduation rule not met." };
    case "MaxTierReached":
      return { code: "MAX_TIER_REACHED", layer: "contract", title: "Top tier", message: "This desk is already at the highest tier its cohort defines." };
    case "Paused":
      return { code: "PAUSED", layer: "contract", title: "Paused", message: "New desks and graduations are paused. Trading limits, claims and closes keep working." };
    case "StakeTooLow":
      return { code: "STAKE_TOO_LOW", layer: "contract", title: "Stake too low", message: `Minimum stake is ${fmt6(a[1])} AUSD.` };
    case "InsufficientIdle":
      return { code: "INSUFFICIENT_IDLE", layer: "pool", title: "Not enough idle funds", message: "The requested amount exceeds funds that are free to move right now." };
    case "Unauthorized":
    case "UnknownDesk":
    case "OwnableUnauthorizedAccount":
      return { code: "UNAUTHORIZED", layer: "contract", title: "Not authorized", message: "This address cannot perform that action." };
    case "UnmatchedLotRemainsInFillOrKill":
      return { code: "VENUE_NO_LIQUIDITY", layer: "venue", title: "Not enough liquidity", message: "Perpl could not fill the whole fill-or-kill order inside the price limit, so nothing executed." };
    case "TakerOrderSettlementFailed":
      return { code: "VENUE_NEG_PNL_CAP", layer: "venue", title: "Perpl refused the fill", message: "The fill would collateralize more negative PnL than the stamped 50 bps cap allows (for example, adding to an underwater position)." };
    default:
      return { code: "VENUE_REJECTED", layer: "venue", title: "Rejected", message: `Contract error ${name}.`, contractError: name, args };
  }
}

const decodeAbis = [deskAbi, imprestPoolAbi, deskFactoryAbi, perplExchangeAbi] as const;

/** Decodes raw revert data against Imprest and Perpl ABIs. */
export function decodeRevert(data: Hex | undefined): AppError {
  if (!data || data === "0x") {
    return { code: "UNKNOWN", layer: "contract", title: "Reverted", message: "The transaction reverted without a reason." };
  }
  for (const abi of decodeAbis) {
    try {
      const r = decodeErrorResult({ abi: abi as never, data });
      const e = describeContractError(r.errorName, (r.args ?? []) as readonly unknown[]);
      return { ...e, contractError: r.errorName, args: r.args as readonly unknown[] | undefined };
    } catch {
      // try next ABI
    }
  }
  return { code: "UNKNOWN", layer: "contract", title: "Reverted", message: `Unrecognized revert data ${data.slice(0, 10)}.` };
}

/** Finds revert data inside a viem error chain. */
export function revertDataFromError(err: unknown): Hex | undefined {
  let e: any = err;
  for (let i = 0; i < 8 && e; i++) {
    if (typeof e.data === "string" && e.data.startsWith("0x")) return e.data as Hex;
    if (e.data && typeof e.data.data === "string") return e.data.data as Hex;
    e = e.cause;
  }
  return undefined;
}

export function toAppError(err: unknown): AppError {
  const msg = String((err as any)?.shortMessage ?? (err as any)?.message ?? err);
  if (/user rejected|denied|cancel/i.test(msg)) {
    return { code: "USER_REJECTED", layer: "wallet", title: "Request cancelled", message: "The signing request was cancelled. Nothing was sent." };
  }
  const data = revertDataFromError(err);
  if (data) return decodeRevert(data);
  if (/fetch|network|timeout|ECONN|429/i.test(msg)) {
    return { code: "EXTERNAL_DEPENDENCY_UNAVAILABLE", layer: "network", title: "Network unavailable", message: msg };
  }
  return { code: "UNKNOWN", layer: "contract", title: "Failed", message: msg };
}
