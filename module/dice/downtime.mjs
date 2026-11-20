/**
 * After the score: payoff, heat, entanglements, downtime, advancement.
 * @module duskwall/dice/downtime
 */

import DW, { SYSTEM_ID } from "../config.mjs";
import * as R from "./rules.mjs";
import { rollPool, resultLabel } from "./roller.mjs";
import { promptForm, liveSummary } from "./dialogs.mjs";
import { postCard, updateCard, t, esc, onCardButton, spendButton } from "../helpers/chat.mjs";

const actionChoices = (actor, selected) => Object.entries(DW.attributes).map(([attr, a]) => ({
  attr, label: t(a.label),
  actions: a.actions.map(key => ({ key, label: t(`DW.Action.${key}`), rating: actor.system.actions[key], selected: key === selected }))
}));

/* -------------------------------------------- */
/*  Payoff & heat                               */
/* -------------------------------------------- */

/**
 * Resolve payoff and heat after a score, in one form.
 * @param {Actor} crew
 */
export async function payoff(crew) {
  const sys = crew.system;
  const noTraces = crew.items.some(i => (i.type === "crewAbility") && (i.name === "No Traces") && i.system.taken);
  const crowsVeil = crew.items.some(i => (i.type === "crewAbility") && (i.name === "Crow's Veil" || i.name === "Crow’s Veil") && i.system.taken);
  const form = await promptForm({
    title: t("DW.Payoff.title", { name: crew.name }),
    template: "payoff",
    icon: "fa-solid fa-sack-dollar",
    ok: t("DW.Payoff.ok"),
    okIcon: "fa-solid fa-sack-dollar",
    width: 560,
    data: {
      target: sys.score.target, targetTier: sys.score.targetTier, type: sys.score.type,
      tier: sys.tier, tiers: DW.roman.map((label, value) => ({ value, label, selected: value === sys.score.targetTier })),
      coins: DW.payoffCoin.map((c, i) => ({ ...c, label: t(c.label), checked: i === 2 })),
      heats: DW.heatBase.map((h, i) => ({ ...h, label: t(h.label), checked: i === 1 })),
      atWar: sys.atWar, crowsVeil, noTraces,
      claimHeat: sys.bonus.heatPerScore, claimRep: sys.bonus.repPerScore, repFull: sys.repFull
    },
    onRender: f => liveSummary(f, d => summarize(crew, d, { noTraces, crowsVeil }).html)
  });
  if ( !form ) return null;
  const s = summarize(crew, form, { noTraces, crowsVeil });

  const heat = R.addHeat(sys.heat, sys.wanted, s.heat);
  const coinTotal = sys.coin + s.coin;
  const overflow = Math.max(0, coinTotal - sys.vaultMax);
  const update = {
    "system.rep": Math.min(sys.repMax, sys.rep + s.rep),
    "system.coin": Math.min(sys.vaultMax, coinTotal),
    "system.heat": heat.heat,
    "system.wanted": heat.wanted,
    "system.log": [...sys.toObject().log, {
      when: new Date().toISOString().slice(0, 10), target: form.target ?? "", type: form.type ?? "",
      coin: s.coin, rep: s.rep, heat: s.heat, notes: ""
    }],
    "system.score.target": form.target ?? "", "system.score.targetTier": Number(form.targetTier) || 0,
    "system.score.type": form.type ?? ""
  };
  await crew.update(update);

  const lines = [...s.lines];
  if ( heat.gained ) lines.push(`<strong>${t("DW.Heat.wantedUp", { n: heat.wanted })}</strong>`);
  if ( overflow ) lines.push(`<strong>${t("DW.Payoff.overflow", { n: overflow })}</strong>`);
  if ( sys.repFull ) lines.push(t("DW.Payoff.repFullNote"));
  await postCard({
    kind: "payoff",
    kicker: t("DW.Payoff.kicker"),
    title: form.target ? esc(form.target) : t("DW.Payoff.title", { name: crew.name }),
    subtitle: t("DW.Payoff.summary", { coin: s.coin, rep: s.rep, heat: s.heat }),
    lines,
    buttons: [{ action: "entanglement", who: "gm", label: t("DW.Card.entanglement"), icon: "fa-solid fa-spider", key: "entanglement" }]
  }, { actor: crew });
  if ( overflow ) await distributeCoin(crew, overflow);
}

/** Work out payoff and heat from the form. */
function summarize(crew, d, { noTraces, crowsVeil }) {
  const sys = crew.system;
  const quiet = !!d.quiet;
  const targetTier = Number(d.targetTier) || 0;
  const rep = sys.repFull ? 0 : R.scoreRep(sys.tier, targetTier, { quiet, noTraces, bonus: sys.bonus.repPerScore });
  let coin = (d.coinChoice === "custom") ? (Number(d.coinCustom) || 0) : (Number(d.coinChoice) || 0);
  coin += Number(d.coinBonus) || 0;
  if ( d.tithe ) coin -= (sys.tier + 1);
  coin = Math.max(0, coin);
  let heat = Number(d.heatBase) || 0;
  const lines = [];
  if ( d.profile ) heat += 1;
  if ( d.hostile ) heat += 1;
  if ( d.war ) heat += 1;
  if ( d.killing && !crowsVeil ) heat += 2;
  heat += Number(d.heatExtra) || 0;
  heat += sys.bonus.heatPerScore;
  heat = Math.max(0, heat);
  if ( d.killing && crowsVeil ) lines.push(t("DW.Heat.crowsVeil"));
  if ( sys.bonus.heatPerScore ) lines.push(t("DW.Heat.claims", { n: sys.bonus.heatPerScore }));
  if ( sys.bonus.repPerScore && !quiet ) lines.push(t("DW.Payoff.claimRep", { n: sys.bonus.repPerScore }));
  if ( d.tithe ) lines.push(t("DW.Payoff.titheNote", { n: sys.tier + 1 }));
  const html = `<strong>${t("DW.Payoff.summary", { coin, rep, heat })}</strong>`;
  return { rep, coin, heat, lines, html };
}

/** Coin beyond the vault's capacity goes to the scoundrels' stashes. */
async function distributeCoin(crew, n) {
  const members = crew.system.members;
  if ( !members.length ) return;
  const share = Math.floor(n / members.length);
  const lines = [];
  for ( const m of members ) {
    if ( !share || !m.isOwner ) continue;
    await m.update({ "system.stash": Math.min(DW.maxStash, m.system.stash + share) });
    lines.push(`${esc(m.name)}: +${share} ${t("DW.Stash.label")}`);
  }
  if ( lines.length ) await postCard({ kind: "note", title: t("DW.Payoff.distributed"), lines }, { actor: crew });
}

/* -------------------------------------------- */
/*  Entanglements                               */
/* -------------------------------------------- */

/**
 * Roll entanglements: dice equal to wanted level, read on the heat column.
 * @param {Actor} crew
 */
export async function entanglements(crew) {
  const sys = crew.system;
  const r = await rollPool(sys.wanted);
  const band = R.heatBand(sys.heat);
  const read = (r.result === "critical") ? "success" : r.result;
  const options = DW.entanglementTable[band][read];
  const body = options.map(k => `<div class="dw-entangle"><h4>${t(`DW.Entanglement.${k}.name`)}</h4><p>${t(`DW.Entanglement.${k}.text`, {
    tier: sys.tier, payoff: sys.wanted + 3, rep: sys.tier + 1 })}</p></div>`).join("");
  return postCard({
    kind: "entanglement",
    kicker: t("DW.Entanglement.kicker"),
    title: options.map(k => t(`DW.Entanglement.${k}.name`)).join(t("DW.Entanglement.or")),
    subtitle: t("DW.Entanglement.subtitle", { heat: sys.heat, wanted: sys.wanted }),
    dice: r.dice, zero: r.zero, result: r.result, resultLabel: resultLabel(r.result),
    body
  }, { actor: crew, rolls: [r.roll] });
}

/* -------------------------------------------- */
/*  Downtime                                    */
/* -------------------------------------------- */

/**
 * Begin downtime: armor back, cohorts mend, activity counters reset.
 * @param {Actor} crew
 */
export async function beginDowntime(crew) {
  if ( !game.user.isGM ) return;
  for ( const m of crew.system.members ) {
    await m.update({
      "system.armor.armor": false, "system.armor.heavy": false, "system.armor.special": false,
      "system.downtime.used": 0, "system.downtime.trained": [], "system.outOfAction": false, "system.load": ""
    });
    const used = m.items.filter(i => (i.type === "gear") && i.system.used).map(i => ({ _id: i.id, "system.used": false }));
    if ( used.length ) await m.updateEmbeddedDocuments("Item", used);
  }
  const cohorts = crew.items.filter(i => (i.type === "cohort") && (i.system.harm > 0) && (i.system.harm < 4))
    .map(i => ({ _id: i.id, "system.harm": i.system.harm - 1, "system.armorUsed": false }));
  if ( cohorts.length ) await crew.updateEmbeddedDocuments("Item", cohorts);
  await crew.update({ "system.downtimeOpen": true, "system.score.engagement": "" });
  const lines = [t("DW.Downtime.armorBack"), t("DW.Downtime.cohortsMend"),
    t("DW.Downtime.activities", { n: crew.system.atWar ? 1 : 2 })];
  if ( crew.system.bonus.income.length ) lines.push(t("DW.Downtime.income", { claims: crew.system.bonus.income.join(", ") }));
  return postCard({
    kind: "downtime", kicker: t("DW.Downtime.kicker"), title: t("DW.Downtime.begins"), lines,
    buttons: crew.system.bonus.income.length ? [{ action: "income", who: "gm", label: t("DW.Card.income"), icon: "fa-solid fa-coins", key: "income" }] : []
  }, { actor: crew });
}

/** Income claims: roll Tier, earn coin equal to the highest die minus heat. */
async function rollIncome(crew) {
  const sys = crew.system;
  const results = [];
  for ( const claim of sys.bonus.income ) {
    const r = await rollPool(sys.tier);
    const coin = Math.max(0, r.top - sys.heat);
    results.push({ claim, r, coin });
  }
  const total = results.reduce((n, x) => n + x.coin, 0);
  const coin = Math.min(sys.vaultMax, sys.coin + total);
  await crew.update({ "system.coin": coin });
  return postCard({
    kind: "income", kicker: t("DW.Downtime.kicker"), title: t("DW.Income.title"),
    lines: results.map(x => t("DW.Income.line", { claim: esc(x.claim), top: x.r.top, heat: sys.heat, coin: x.coin })),
    subtitle: t("DW.Income.total", { n: total })
  }, { actor: crew, rolls: results.map(x => x.r.roll) });
}

/**
 * Pay for a downtime activity beyond the free ones. Returns false if cancelled or unaffordable.
 * @param {Actor} actor
 */
async function payForActivity(actor) {
  const sys = actor.system;
  if ( sys.downtime.used < sys.freeDowntime ) return true;
  const crew = sys.crew;
  const form = await promptForm({
    title: t("DW.Downtime.extraTitle"), template: "pay", icon: "fa-solid fa-coins",
    ok: t("DW.Downtime.pay"), okIcon: "fa-solid fa-coins",
    data: { coin: sys.coin, rep: crew?.system.rep ?? 0, canRep: !!crew?.isOwner }
  });
  if ( !form ) return false;
  if ( form.with === "rep" ) {
    if ( !crew || crew.system.rep < 1 ) { ui.notifications.warn(t("DW.Downtime.noRep")); return false; }
    await crew.update({ "system.rep": crew.system.rep - 1 });
  } else {
    if ( sys.coin < 1 ) { ui.notifications.warn(t("DW.Downtime.noCoin")); return false; }
    await actor.update({ "system.coin": sys.coin - 1 });
  }
  return true;
}

/**
 * A downtime activity.
 * @param {Actor} actor
 * @param {"acquire"|"project"|"recover"|"heat"|"train"|"vice"} kind
 */
export async function downtimeActivity(actor, kind) {
  const sys = actor.system;
  const crew = sys.crew;
  if ( !(await payForActivity(actor)) ) return null;
  const done = async () => actor.update({ "system.downtime.used": sys.downtime.used + 1 });

  if ( kind === "train" ) return train(actor, crew, done);
  if ( kind === "vice" ) return indulgeVice(actor, crew, done);

  const clocks = game.actors.filter(a => (a.type === "clock") && a.isOwner && (a.system.kind === "project"));
  const data = {
    kind, label: t(DW.downtime[kind].label),
    useAction: kind !== "acquire",
    groups: actionChoices(actor, { recover: "tinker", heat: "consort", project: "study" }[kind]),
    tier: crew?.system.tier ?? 0,
    clocks: clocks.map(c => ({ id: c.id, name: c.name, value: c.system.value, size: c.system.size })),
    claimBonus: (kind === "acquire" && crew?.system.bonus.acquire) || (kind === "recover" && crew?.system.bonus.healing)
      || (kind === "heat" && crew?.system.bonus.reduceHeat)
  };
  const form = await promptForm({
    title: t("DW.Downtime.title", { name: actor.name, activity: data.label }),
    template: "downtime", icon: DW.downtime[kind].icon, data, width: 500
  });
  if ( !form ) return null;
  let pool = (kind === "acquire") ? (crew?.system.tier ?? 0) : (sys.actions[form.action] ?? 0);
  if ( form.help ) pool += 1;
  if ( form.claim ) pool += 1;
  pool += Number(form.bonus) || 0;
  const r = await rollPool(pool);

  // Where the result goes.
  const flags = { downtime: { kind, result: r.result, applied: 0 } };
  let clock = null;
  if ( kind === "project" ) {
    if ( (form.clock === "new") && !game.user.can("ACTOR_CREATE") ) {
      ui.notifications.warn(t("DW.Downtime.noClockPermission"));
    } else if ( form.clock === "new" ) {
      clock = await Actor.create({ name: form.clockName || t("DW.Downtime.newProject"), type: "clock",
        system: { size: Number(form.clockSize) || 8, kind: "project", pinned: true },
        ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
    } else clock = game.actors.get(form.clock);
    flags.downtime.clock = clock?.uuid ?? null;
  }
  const applied = await applyDowntime(actor, kind, r.result, 0, clock);
  flags.downtime.applied = applied.amount;
  await postCard({
    kind: "downtime",
    kicker: t("DW.Downtime.kicker"),
    title: data.label + (form.what ? `: ${esc(form.what)}` : ""),
    subtitle: (kind === "acquire") ? t("DW.Downtime.tierRoll", { n: crew?.system.tier ?? 0 }) : t(`DW.Action.${form.action}`),
    dice: r.dice, zero: r.zero, result: r.result, resultLabel: resultLabel(r.result),
    outcome: applied.text,
    buttons: (r.result !== "critical") ? [{ action: "bumpDowntime", who: "owner", label: t("DW.Card.bump"), icon: "fa-solid fa-coins" }] : []
  }, { actor, rolls: [r.roll], flags });
  await done();
}

/**
 * Apply a downtime result (or the difference from a previous one).
 * @returns {Promise<{amount: number, text: string}>}
 */
async function applyDowntime(actor, kind, result, already, clock) {
  const sys = actor.system;
  const crew = sys.crew;
  const ticks = R.downtimeTicks(result);
  const add = ticks - already;
  switch ( kind ) {
    case "acquire": {
      const q = R.acquireQuality(result, crew?.system.tier ?? 0);
      return { amount: q, text: t("DW.Downtime.acquireResult", { q }) };
    }
    case "project": {
      if ( clock ) await clock.update({ "system.value": Math.min(clock.system.size, clock.system.value + add) });
      return { amount: ticks, text: t("DW.Downtime.projectResult", { n: ticks, clock: esc(clock?.name ?? "") }) };
    }
    case "recover": {
      const total = sys.healing + add;
      if ( total >= sys.healingMax ) {
        await actor.update({ "system.healing": 0, "system.harm": stepDownHarm(sys.harm) });
        return { amount: ticks, text: t("DW.Downtime.recoverHealed", { n: ticks }) };
      }
      await actor.update({ "system.healing": total });
      return { amount: ticks, text: t("DW.Downtime.recoverResult", { n: ticks, total, max: sys.healingMax }) };
    }
    case "heat": {
      if ( crew?.isOwner ) await crew.update({ "system.heat": Math.max(0, crew.system.heat - add) });
      return { amount: ticks, text: t("DW.Downtime.heatResult", { n: ticks }) };
    }
  }
  return { amount: 0, text: "" };
}

/** Every harm drops one level: 3 -> 2, 2 -> 1, 1 -> healed. */
function stepDownHarm(h) {
  const l1 = [h.l2a, h.l2b].filter(Boolean);
  return {
    l4: h.l4, l3: "",
    l2a: h.l3 || "", l2b: "",
    l1a: l1[0] ?? "", l1b: l1[1] ?? ""
  };
}

/** Spend a coin to bump a downtime result. */
async function bumpDowntime({ message, actor }) {
  if ( !actor?.isOwner ) return;
  const f = message.getFlag(SYSTEM_ID, "downtime");
  if ( !f || (f.result === "critical") ) return;
  if ( actor.system.coin < 1 ) return ui.notifications.warn(t("DW.Downtime.noCoin"));
  await actor.update({ "system.coin": actor.system.coin - 1 });
  const result = R.bumpResult(f.result, 1);
  const clock = f.clock ? await fromUuid(f.clock) : null;
  const before = (f.kind === "acquire") ? 0 : R.downtimeTicks(f.result);
  const applied = await applyDowntime(actor, f.kind, result, before, clock);
  await updateCard(message, {
    result, resultLabel: `${resultLabel(result)} (${t("DW.Downtime.bumped")})`, outcome: applied.text,
    buttons: (result === "critical") ? [] : message.getFlag(SYSTEM_ID, "card").buttons
  }, { downtime: { ...f, result, applied: applied.amount } });
}

/* -------------------------------------------- */
/*  Training and vice                           */
/* -------------------------------------------- */

async function train(actor, crew, done) {
  const sys = actor.system;
  const tracks = ["insight", "prowess", "resolve", "playbook"].map(k => ({
    key: k, label: t(`DW.Xp.${k}`), disabled: sys.downtime.trained.includes(k),
    bonus: !!crew?.system.hasTraining(k)
  }));
  const form = await promptForm({
    title: t("DW.Downtime.trainTitle", { name: actor.name }), template: "train", icon: "fa-solid fa-dumbbell",
    ok: t("DW.Downtime.trainOk"), okIcon: "fa-solid fa-dumbbell", data: { tracks }
  });
  if ( !form?.track ) return null;
  const n = crew?.system.hasTraining(form.track) ? 2 : 1;
  await actor.update({ "system.downtime.trained": [...sys.downtime.trained, form.track] });
  await actor.markXp(form.track, n, { quiet: true });
  await postCard({ kind: "downtime", kicker: t("DW.Downtime.kicker"), title: t("DW.Downtime.trained", { n, track: t(`DW.Xp.${form.track}`) }) }, { actor });
  return done();
}

async function indulgeVice(actor, crew, done) {
  const sys = actor.system;
  const form = await promptForm({
    title: t("DW.Vice.title", { name: actor.name }), template: "vice", icon: "fa-solid fa-wine-bottle",
    data: { vice: sys.vice, purveyor: sys.purveyor, lowest: sys.lowestAttribute, stress: sys.stress.value, label: sys.labels.stress }
  });
  if ( !form ) return null;
  const pool = sys.lowestAttribute + (Number(form.bonus) || 0);
  const r = await rollPool(pool);
  const highest = r.zero ? r.top : Math.max(...r.values);
  const out = R.indulge(highest, sys.stress.value);
  await actor.update({ "system.stress.value": out.remaining });
  const buttons = out.overindulged ? DW.overindulge.map(k => ({
    action: "overindulge", who: "owner", key: "overindulge", label: t(`DW.Vice.${k}`), data: { choice: k }
  })) : [];
  await postCard({
    kind: "vice",
    kicker: t("DW.Vice.kicker"),
    title: sys.vice ? esc(sys.vice) + (sys.purveyor ? ` · ${esc(sys.purveyor)}` : "") : t("DW.Vice.kicker"),
    dice: r.dice, zero: r.zero, result: r.result,
    resultLabel: t("DW.Vice.cleared", { n: out.cleared, label: sys.labels.stress }),
    outcome: out.overindulged ? `<strong>${t("DW.Vice.overindulged")}</strong> ${t("DW.Vice.overindulgedHint")}` : "",
    buttons
  }, { actor, rolls: [r.roll] });
  return done();
}

/* -------------------------------------------- */
/*  Advancement                                 */
/* -------------------------------------------- */

/**
 * Develop the crew when its rep is full.
 * @param {Actor} crew
 */
export async function develop(crew) {
  const sys = crew.system;
  if ( !sys.repFull ) return ui.notifications.warn(t("DW.Develop.notFull"));
  const out = R.develop({ tier: sys.tier, hold: sys.hold, rep: sys.rep, coin: sys.coin }, sys.advanceCost);
  if ( !out.ok ) return ui.notifications.warn(t("DW.Develop.coin", { n: sys.advanceCost }));
  await crew.update({ "system.tier": out.tier, "system.hold": out.hold, "system.rep": out.rep, "system.coin": out.coin });
  return postCard({
    kind: "advance", kicker: t("DW.Develop.kicker"),
    title: (out.tier > sys.tier) ? t("DW.Develop.tier", { name: crew.name, tier: DW.roman[out.tier] }) : t("DW.Develop.hold", { name: crew.name }),
    subtitle: (out.tier > sys.tier) ? t("DW.Develop.paid", { n: sys.advanceCost }) : ""
  }, { actor: crew });
}

/**
 * End-of-session xp for a scoundrel.
 * @param {Actor} actor
 */
export async function sessionXp(actor) {
  const sys = actor.system;
  const triggers = sys.playbook?.system.xpTriggers ?? [];
  const form = await promptForm({
    title: t("DW.Xp.sessionTitle", { name: actor.name }), template: "session-xp", icon: "fa-solid fa-star",
    ok: t("DW.Xp.mark"), okIcon: "fa-solid fa-star",
    data: {
      triggers: triggers.map((text, i) => ({ i, text })),
      tracks: ["playbook", "insight", "prowess", "resolve"].map((k, i) => ({ key: k, label: t(`DW.Xp.${k}`), checked: i === 0 }))
    },
    onRender: f => liveSummary(f, d => `<strong>${t("DW.Xp.total", { n: triggers.reduce((n, _, i) => n + (Number(d[`t${i}`]) || 0), 0) })}</strong>`)
  });
  if ( !form ) return null;
  const n = triggers.reduce((sum, _, i) => sum + (Number(form[`t${i}`]) || 0), 0);
  if ( n ) await actor.markXp(form.track, n);
  return n;
}

/**
 * End-of-session xp for the crew.
 * @param {Actor} crew
 */
export async function crewXp(crew) {
  const triggers = crew.system.crewType?.system.xpTriggers ?? [];
  const form = await promptForm({
    title: t("DW.Xp.crewTitle", { name: crew.name }), template: "session-xp", icon: "fa-solid fa-star",
    ok: t("DW.Xp.mark"), okIcon: "fa-solid fa-star",
    data: { triggers: triggers.map((text, i) => ({ i, text })), tracks: [] }
  });
  if ( !form ) return null;
  const n = triggers.reduce((sum, _, i) => sum + (Number(form[`t${i}`]) || 0), 0);
  if ( !n ) return 0;
  const out = R.markXp(crew.system.xp, n, DW.crewXpMax);
  await crew.update({ "system.xp": out.value });
  if ( out.advances ) {
    const stash = crew.system.tier + 2;
    const lines = [];
    for ( const m of crew.system.members ) {
      if ( !m.isOwner ) continue;
      await m.update({ "system.stash": Math.min(DW.maxStash, m.system.stash + stash) });
      lines.push(`${esc(m.name)}: +${stash} ${t("DW.Stash.label")}`);
    }
    await postCard({
      kind: "advance", kicker: t("DW.Advance.kicker"), title: t("DW.Advance.crew", { name: crew.name }),
      subtitle: t("DW.Advance.crewHint"), lines: [t("DW.Advance.profits", { n: stash }), ...lines]
    }, { actor: crew });
  }
  return n;
}

/* -------------------------------------------- */
/*  Card buttons                                */
/* -------------------------------------------- */

export function registerDowntimeButtons() {
  onCardButton("entanglement", async ({ message, actor }) => {
    if ( actor?.type !== "crew" ) return;
    await entanglements(actor);
    return spendButton(message, "entanglement");
  });
  onCardButton("income", async ({ message, actor }) => {
    if ( actor?.type !== "crew" ) return;
    await rollIncome(actor);
    return spendButton(message, "income");
  });
  onCardButton("bumpDowntime", bumpDowntime);
  onCardButton("overindulge", async ({ message, actor, data }) => {
    if ( !actor?.isOwner ) return;
    const choice = data.choice;
    const lines = [t(`DW.Vice.${choice}Hint`)];
    if ( choice === "brag" ) {
      const crew = actor.system.crew;
      if ( crew?.isOwner ) {
        const h = R.addHeat(crew.system.heat, crew.system.wanted, 2);
        await crew.update({ "system.heat": h.heat, "system.wanted": h.wanted });
        lines.push(t("DW.Vice.bragApplied"));
      }
    }
    await postCard({ kind: "vice", kicker: t("DW.Vice.overindulged"), title: t(`DW.Vice.${choice}`), lines }, { actor });
    return spendButton(message, "overindulge");
  });
}
