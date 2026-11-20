import assert from "node:assert/strict";
import * as R from "../module/dice/rules.mjs";
const t = (name, fn) => { try { fn(); console.log("ok  ", name); } catch (e) { console.error("FAIL", name, e.message); process.exitCode = 1; } };
t("zero pool rolls two, keeps lowest", () => {
  assert.deepEqual(R.dicePool(0), { dice: 2, zero: true });
  assert.equal(R.readDice([6, 6], true).result, "success");
  assert.equal(R.readDice([6, 3], true).result, "failure");
  assert.equal(R.readDice([5, 6], true).top, 5);
});
t("results", () => {
  assert.equal(R.readDice([6, 6, 1]).result, "critical");
  assert.equal(R.readDice([6, 2]).result, "success");
  assert.equal(R.readDice([4, 5, 1]).result, "partial");
  assert.equal(R.readDice([1, 2, 3]).result, "failure");
});
t("resistance stress", () => {
  assert.equal(R.resistanceStress([6, 6]), -1);
  assert.equal(R.resistanceStress([6]), 0);
  assert.equal(R.resistanceStress([2, 4]), 2);
  assert.equal(R.resistanceStress([1]), 5);
  assert.equal(R.resistanceStress([1, 5], true), 5);
});
t("bump result", () => {
  assert.equal(R.bumpResult("failure", 1), "partial");
  assert.equal(R.bumpResult("success", 5), "critical");
});
t("rep", () => {
  assert.equal(R.scoreRep(0, 2), 4);
  assert.equal(R.scoreRep(2, 0), 0);
  assert.equal(R.scoreRep(1, 0), 1);
  assert.equal(R.scoreRep(1, 2, { quiet: true }), 0);
  assert.equal(R.scoreRep(1, 2, { quiet: true, noTraces: true }), 2);
  assert.equal(R.scoreRep(0, 0, { bonus: 1 }), 3);
});
t("heat rolls over", () => {
  assert.deepEqual(R.addHeat(7, 0, 4), { heat: 2, wanted: 1, gained: 1 });
  assert.deepEqual(R.addHeat(5, 4, 6), { heat: 9, wanted: 4, gained: 0 });
  assert.deepEqual(R.addHeat(3, 1, -5), { heat: 0, wanted: 1, gained: 0 });
});
t("bands", () => { assert.equal(R.heatBand(3), "low"); assert.equal(R.heatBand(5), "mid"); assert.equal(R.heatBand(6), "high"); });
t("vice", () => {
  assert.deepEqual(R.indulge(4, 6), { cleared: 4, overindulged: false, remaining: 2 });
  assert.equal(R.indulge(6, 3).overindulged, true);
});
t("stress & trauma", () => {
  assert.deepEqual(R.takeStress(7, 2, 9), { value: 9, trauma: false });
  assert.deepEqual(R.takeStress(8, 2, 9), { value: 0, trauma: true });
  assert.deepEqual(R.takeStress(3, -5, 9), { value: 0, trauma: false });
});
t("develop", () => {
  assert.equal(R.develop({ tier: 0, hold: "weak", rep: 12, coin: 0 }, 8).hold, "strong");
  assert.equal(R.develop({ tier: 0, hold: "strong", rep: 12, coin: 5 }, 8).ok, false);
  assert.deepEqual(R.develop({ tier: 1, hold: "strong", rep: 12, coin: 20 }, 16), { ok: true, tier: 2, hold: "weak", rep: 0, coin: 4 });
});
t("xp", () => {
  assert.deepEqual(R.markXp(5, 1, 6), { value: 0, advances: 1 });
  assert.deepEqual(R.markXp(2, 2, 8), { value: 4, advances: 0 });
});
t("downtime", () => {
  assert.equal(R.downtimeTicks("critical"), 5);
  assert.equal(R.acquireQuality("failure", 0), 0);
  assert.equal(R.acquireQuality("critical", 1), 3);
  assert.equal(R.engagementPosition("partial"), "risky");
});
