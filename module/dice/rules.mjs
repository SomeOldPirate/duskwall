/**
 * The arithmetic of Blades in the Dark, free of Foundry so it can be tested on its own.
 * @module duskwall/dice/rules
 */

/** Result bands, worst to best. */
export const RESULT_ORDER = ["failure", "partial", "success", "critical"];

/**
 * How many dice to roll for a pool, and whether it is the zero-dice case.
 * @param {number} pool
 * @returns {{dice: number, zero: boolean}}
 */
export function dicePool(pool) {
  const n = Math.max(0, Math.floor(Number(pool) || 0));
  return n > 0 ? { dice: n, zero: false } : { dice: 2, zero: true };
}

/**
 * Read a set of d6 results.
 * A zero pool rolls two and keeps the lowest, and cannot crit.
 * @param {number[]} values
 * @param {boolean} [zero=false]
 * @returns {{top: number, sixes: number, result: string, kept: number}}   kept is the index of the die read.
 */
export function readDice(values, zero = false) {
  if ( !values.length ) return { top: 0, sixes: 0, result: "failure", kept: -1 };
  const top = zero ? Math.min(...values) : Math.max(...values);
  const kept = values.indexOf(top);
  const sixes = values.filter(v => v === 6).length;
  let result;
  if ( !zero && (sixes >= 2) ) result = "critical";
  else if ( top === 6 ) result = "success";
  else if ( top >= 4 ) result = "partial";
  else result = "failure";
  return { top, sixes, result, kept };
}

/**
 * The stress a resistance roll costs: 6 minus the highest die. A critical clears 1 stress (-1).
 * @param {number[]} values
 * @param {boolean} [zero=false]
 * @returns {number}
 */
export function resistanceStress(values, zero = false) {
  const { top, result } = readDice(values, zero);
  if ( result === "critical" ) return -1;
  return 6 - top;
}

/**
 * Move a result up by a number of levels (spending coin in downtime).
 * @param {string} result
 * @param {number} steps
 */
export function bumpResult(result, steps = 0) {
  const i = RESULT_ORDER.indexOf(result);
  return RESULT_ORDER[Math.min(RESULT_ORDER.length - 1, Math.max(0, i + steps))];
}

/** Segments a long-term project, recovery or heat reduction achieves. */
export function downtimeTicks(result) {
  return { failure: 1, partial: 2, success: 3, critical: 5 }[result] ?? 0;
}

/** Acquire asset quality relative to Tier. */
export function acquireQuality(result, tier) {
  const offset = { failure: -1, partial: 0, success: 1, critical: 2 }[result] ?? 0;
  return Math.max(0, tier + offset);
}

/** Engagement result to starting position. */
export function engagementPosition(result) {
  return { critical: "controlled", success: "controlled", partial: "risky", failure: "desperate" }[result];
}

/**
 * Rep for a score.
 * @param {number} crewTier
 * @param {number} targetTier
 * @param {object} [opts]
 * @param {boolean} [opts.quiet]      Kept completely quiet: no rep (unless noTraces).
 * @param {boolean} [opts.noTraces]   Assassins' No Traces: half the rep value, rounded up, when quiet.
 * @param {number}  [opts.bonus]      Victim Trophies and the like.
 */
export function scoreRep(crewTier, targetTier, { quiet = false, noTraces = false, bonus = 0 } = {}) {
  const base = Math.max(0, 2 + (targetTier - crewTier));
  if ( quiet ) return noTraces ? Math.ceil(base / 2) : 0;
  return base + bonus;
}

/**
 * Add heat, rolling over into wanted level at 9.
 * @param {number} heat
 * @param {number} wanted
 * @param {number} add
 * @returns {{heat: number, wanted: number, gained: number}}
 */
export function addHeat(heat, wanted, add) {
  let h = Math.max(0, heat + add);
  let w = wanted;
  let gained = 0;
  while ( h >= 9 ) {
    if ( w >= 4 ) { h = 9; break; }
    h -= 9; w += 1; gained += 1;
  }
  return { heat: h, wanted: w, gained };
}

/** The entanglement column for a heat level. */
export function heatBand(heat) {
  if ( heat >= 6 ) return "high";
  if ( heat >= 4 ) return "mid";
  return "low";
}

/**
 * Indulge vice: clear stress equal to the highest die. Overindulge if that clears more than you had.
 * @param {number} highest
 * @param {number} stress
 */
export function indulge(highest, stress) {
  const cleared = Math.min(highest, stress);
  return { cleared, overindulged: highest > stress, remaining: stress - cleared };
}

/**
 * Take stress. Filling the track means trauma: stress clears and a condition is marked.
 * @param {number} value
 * @param {number} add
 * @param {number} max
 * @returns {{value: number, trauma: boolean}}
 */
export function takeStress(value, add, max) {
  const next = value + add;
  if ( next > max ) return { value: 0, trauma: true };
  if ( (next === max) && (add > 0) ) return { value: max, trauma: false };
  return { value: Math.max(0, next), trauma: false };
}

/**
 * Develop the crew when rep fills.
 * @param {{tier: number, hold: string, rep: number, coin: number}} crew
 * @param {number} cost    The coin it costs to advance Tier.
 * @returns {{ok: boolean, tier: number, hold: string, rep: number, coin: number, reason?: string}}
 */
export function develop(crew, cost) {
  if ( crew.hold === "weak" ) return { ok: true, tier: crew.tier, hold: "strong", rep: 0, coin: crew.coin };
  if ( crew.coin < cost ) return { ok: false, ...crew, reason: "coin" };
  return { ok: true, tier: crew.tier + 1, hold: "weak", rep: 0, coin: crew.coin - cost };
}

/**
 * Fill an xp track. Returns the new value and how many advances were earned.
 * @param {number} value
 * @param {number} add
 * @param {number} max
 */
export function markXp(value, add, max) {
  const total = value + add;
  // "When you fill an xp track, clear all the marks and take an advance."
  if ( total >= max ) return { value: 0, advances: 1 };
  return { value: Math.max(0, total), advances: 0 };
}

/** Stash to lifestyle quality (one level per full row of ten). */
export function lifestyle(stash) {
  return Math.floor(Math.max(0, stash) / 10);
}
