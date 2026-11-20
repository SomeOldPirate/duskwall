/**
 * Rolling dice pools and describing them for chat.
 * @module duskwall/dice/roller
 */

import DW from "../config.mjs";
import { dicePool, readDice } from "./rules.mjs";
import { t } from "../helpers/chat.mjs";

/** Pip layouts for d6 faces (3x3 grid positions). */
const PIPS = { 1: ["c"], 2: ["tl", "br"], 3: ["tl", "c", "br"], 4: ["tl", "tr", "bl", "br"],
  5: ["tl", "tr", "c", "bl", "br"], 6: ["tl", "tr", "ml", "mr", "bl", "br"] };

/**
 * Roll a pool of d6.
 * @param {number} pool     Dice in the pool; zero or less rolls two and keeps the lowest.
 * @returns {Promise<{roll: Roll, values: number[], zero: boolean, top: number, result: string, dice: object[]}>}
 */
export async function rollPool(pool) {
  const { dice, zero } = dicePool(pool);
  const roll = await new Roll(`${dice}d6`).evaluate();
  const values = roll.dice[0].results.map(r => r.result);
  const read = readDice(values, zero);
  return {
    roll, values, zero, pool: Math.max(0, pool), ...read,
    dice: values.map((value, i) => ({ value, kept: i === read.kept, pips: PIPS[value] }))
  };
}

/** The localised label for a result. */
export function resultLabel(result) {
  return t(DW.results[result]?.label ?? "");
}

/**
 * The outcome text for an action roll at a position.
 * @param {string} position
 * @param {string} result
 */
export function actionOutcome(position, result) {
  if ( result === "critical" ) return t("DW.Outcome.critical");
  if ( result === "success" ) return t("DW.Outcome.success");
  return t(`DW.Outcome.${position}.${result}`);
}

/** Fortune roll outcome text. */
export function fortuneOutcome(result) {
  return t(`DW.Fortune.${result}`);
}

/**
 * Step an effect level up or down.
 * @param {string} effect
 * @param {number} steps
 */
export function shiftEffect(effect, steps) {
  const order = DW.effectOrder;
  const i = order.indexOf(effect);
  return order[Math.max(0, Math.min(order.length - 1, i + steps))];
}

/** Show 3D dice if Dice So Nice is active, and wait for them. */
export async function showDice(roll) {
  if ( game.dice3d && roll ) {
    try { await game.dice3d.showForRoll(roll, game.user, true); } catch ( err ) { /* cosmetic */ }
  }
}
