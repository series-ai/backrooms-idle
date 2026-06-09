import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

/* ------------------------------------------------------------------ *
 *  Big numbers                                                        *
 *                                                                    *
 *  Idle economies grow exponentially, so any value that compounds    *
 *  (resource counts, upgrade costs, search power, node HP, damage)    *
 *  blows past JS's safe-integer ceiling (2^53 ≈ 9e15) and eventually *
 *  past Number.MAX_VALUE (~1.8e308 → Infinity). The platform ships a *
 *  break_eternity.js `Decimal` (sign/mag/layer — a tetration-based    *
 *  representation with NO practical ceiling: it can hold 10↑↑(huge)). *
 *  We funnel ALL unbounded math through this one typed module so the  *
 *  rest of the code stays readable and the SDK's `any`-typed Decimal  *
 *  can't be misused.                                                  *
 *                                                                    *
 *  NOTE: RundotGameAPI.numbers is populated by an ASYNC init, so it   *
 *  is NOT available at module-load time. Everything here resolves the *
 *  SDK lazily (at first call), never at import — by the time any game *
 *  code calls D()/fmt() the SDK is ready.                             *
 * ------------------------------------------------------------------ */

export type BigSource = Big | number | string;

/** Typed view of the SDK's Decimal instance (break_eternity.js API). */
export interface Big {
  add(o: BigSource): Big;
  sub(o: BigSource): Big;
  mul(o: BigSource): Big;
  div(o: BigSource): Big;
  pow(o: BigSource): Big;
  gt(o: BigSource): boolean;
  gte(o: BigSource): boolean;
  lt(o: BigSource): boolean;
  lte(o: BigSource): boolean;
  eq(o: BigSource): boolean;
  cmp(o: BigSource): number;
  floor(): Big;
  max(o: BigSource): Big;
  min(o: BigSource): Big;
  neg(): Big;
  log10(): number;
  toNumber(): number;
  toString(): string;
}

/**
 * Construct a Big from a number, decimal string, or another Big.
 *
 * NOTE: we go through `numbers.normalize`, NOT `new numbers.Decimal(...)`.
 * `numbers` is a proxied API object, so its `Decimal` property is a proxied
 * method, not the raw class — `new`-ing it throws "Cannot call a class as a
 * function". `normalize` does the real `new k(value)` internally (and passes
 * existing Decimals through untouched), so it's the supported constructor path.
 */
export function D(v: BigSource): Big {
  return RundotGameAPI.numbers.normalize(v) as Big;
}

/** Round a Big to the nearest integer (Big has floor() but no round()). */
export function roundD(v: BigSource): Big {
  return D(v).add(0.5).floor();
}

/**
 * Short idle-game display: "0".."999", then "1.23K".."9.99Dc" (decillion),
 * then scientific "1.23e+45". Never overflows or shows "Infinity".
 */
export function fmt(v: BigSource): string {
  return RundotGameAPI.numbers.format.incremental(typeof v === 'object' ? v : D(v));
}
