/**
 * The rolls of play: action, resistance, fortune, engagement, flashback, group actions.
 * @module duskwall/dice/flows
 */

import DW, { SYSTEM_ID } from "../config.mjs";
import * as R from "./rules.mjs";
import { rollPool, resultLabel, actionOutcome, fortuneOutcome, shiftEffect } from "./roller.mjs";
import { promptForm, liveSummary } from "./dialogs.mjs";
import { postCard, updateCard, t, esc, onCardButton, myCharacter, spendButton } from "../helpers/chat.mjs";

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** Action choices grouped by attribute. */
function actionGroups(actor, selected) {
  return Object.entries(DW.attributes).map(([attr, a]) => ({
    attr, label: t(a.label),
    actions: a.actions.map(key => ({
      key, label: t(`DW.Action.${key}`), rating: actor.system.actions[key], selected: key === selected
    }))
  }));
}

const choiceList = (obj, checked) => Object.entries(obj).map(([key, v]) => ({
  key, label: t(v.label ?? v), hint: v.hint ? t(v.hint) : "", checked: key === checked
}));

/** A scoundrel's name and what they rolled, for card kickers. */
const kickerFor = (action, rating) => `${t(`DW.Action.${action}`)} ${"●".repeat(rating)}${"○".repeat(Math.max(0, 4 - rating))}`;

/** Scoundrels other than this one, for assistance. */
function teammates(actor) {
  return game.actors.filter(a => (a.type === "scoundrel") && (a.id !== actor?.id) && !a.system.retired)
    .map(a => ({ id: a.id, name: a.name }));
}

/** Buttons common to rolls that may bring consequences. */
function consequenceButtons(actor) {
  return [
    { action: "resist", who: "owner", label: t("DW.Card.resist"), icon: "fa-solid fa-shield-halved" },
    { action: "armor", who: "owner", label: t("DW.Card.armor"), icon: "fa-solid fa-vest" },
    { action: "protect", who: "others", label: t("DW.Card.protect"), icon: "fa-solid fa-people-arrows" }
  ];
}

/* -------------------------------------------- */
/*  Action roll                                 */
/* -------------------------------------------- */

/**
 * Prompt for and make an action roll.
 * @param {Actor} actor
 * @param {object} [preset]
 * @param {string} [preset.action]
 * @param {string} [preset.position]
 * @param {string} [preset.effect]
 * @param {boolean} [preset.locked]     Position and effect set by the GM.
 * @param {string} [preset.goal]
 * @param {string} [preset.groupOf]     Joining a group action led on this message.
 * @param {boolean} [preset.group]      Lead a group action.
 */
export async function actionRoll(actor, preset = {}) {
  const sys = actor.system;
  if ( sys.harmPenalty.dead ) return ui.notifications.warn(t("DW.Roll.dead", { name: actor.name }));
  const data = {
    groups: actionGroups(actor, preset.action ?? "skirmish"),
    positions: choiceList(DW.positions, preset.position ?? "risky"),
    effects: choiceList({ limited: DW.effects.limited, standard: DW.effects.standard, great: DW.effects.great }, preset.effect ?? "standard"),
    locked: !!preset.locked,
    lockedPosition: preset.position, lockedEffect: preset.effect,
    teammates: teammates(actor),
    canSpecialArmor: sys.hasSpecialArmor && !sys.armor.special,
    stressLabel: sys.labels.stress,
    harm: sys.harmPenalty,
    goal: preset.goal ?? "",
    canLead: !preset.groupOf,
    joining: !!preset.groupOf,
    group: !!preset.group
  };
  const form = await promptForm({
    title: t("DW.Roll.actionTitle", { name: actor.name }),
    template: "action",
    data,
    width: 520,
    onRender: f => liveSummary(f, d => summarizeAction(actor, d))
  });
  if ( !form ) return null;
  const position = preset.locked ? pick(preset.position, DW.positions, "risky") : pick(form.position, DW.positions, preset.position ?? "risky");
  const effect = preset.locked ? pick(preset.effect, DW.effects, "standard") : pick(form.effect, DW.effects, preset.effect ?? "standard");
  return resolveAction(actor, { ...form, position, effect, groupOf: preset.groupOf ?? null });
}

/**
 * A valid key from a form value, which may arrive as a string, an array or nothing at all.
 * @param {*} value
 * @param {object} valid      Object whose keys are the allowed values.
 * @param {string} fallback
 */
function pick(value, valid, fallback) {
  const options = Array.isArray(value) ? value : [value];
  const found = options.find(v => (typeof v === "string") && (v in valid));
  return found ?? ((fallback in valid) ? fallback : Object.keys(valid)[0]);
}

/** The dice and stress an action form adds up to. */
function poolFor(actor, d) {
  const sys = actor.system;
  const rating = sys.actions[d.action] ?? 0;
  const parts = [{ n: rating, label: t(`DW.Action.${d.action}`) }];
  let stress = 0;
  if ( d.assist ) parts.push({ n: 1, label: t("DW.Roll.assist") });
  if ( d.die === "push" ) { parts.push({ n: 1, label: t("DW.Roll.push") }); stress += 2; }
  else if ( d.die === "special" ) parts.push({ n: 1, label: t("DW.Roll.special") });
  else if ( d.die === "bargain" ) parts.push({ n: 1, label: t("DW.Roll.bargain") });
  if ( d.pushEffect ) stress += 2;
  if ( d.pushHarm ) stress += 2;
  if ( sys.harmPenalty.minusDie ) parts.push({ n: -1, label: t("DW.Harm.minusDie") });
  const bonus = Number(d.bonus) || 0;
  if ( bonus ) parts.push({ n: bonus, label: t("DW.Roll.bonus") });
  const pool = parts.reduce((n, p) => n + p.n, 0);
  return { pool, parts, stress, rating };
}

function summarizeAction(actor, d) {
  const { pool, stress } = poolFor(actor, d);
  const sys = actor.system;
  const bits = [pool > 0 ? t("DW.Roll.poolN", { n: pool }) : t("DW.Roll.poolZero")];
  if ( stress ) bits.push(t("DW.Roll.costs", { n: stress, label: sys.labels.stress }));
  if ( d.assist ) bits.push(t("DW.Roll.assistCost"));
  const warn = [];
  if ( sys.harmPenalty.needHelp && !d.assist && !d.pushHarm ) warn.push(t("DW.Harm.needHelpWarn"));
  if ( (sys.stress.value + stress) > sys.stress.max ) warn.push(t("DW.Roll.traumaWarn", { label: sys.labels.trauma }));
  return `<strong>${bits.join(" · ")}</strong>${warn.map(w => `<span class="dw-warn">${w}</span>`).join("")}`;
}

/**
 * Roll an action from a completed form.
 * @param {Actor} actor
 * @param {object} d
 */
export async function resolveAction(actor, d) {
  const sys = actor.system;
  const { pool, parts, stress, rating } = poolFor(actor, d);
  const attr = DW.actions[d.action];
  let effect = pick(d.effect, DW.effects, "standard");
  const lines = [];
  if ( sys.harmPenalty.lessEffect ) { effect = shiftEffect(effect, -1); lines.push(t("DW.Harm.lessEffectNote")); }
  if ( d.pushEffect ) { effect = shiftEffect(effect, +1); lines.push(t("DW.Roll.pushEffectNote")); }
  if ( d.pushHarm ) lines.push(t("DW.Roll.pushHarmNote"));
  if ( d.die === "bargain" ) lines.push(`${t("DW.Roll.bargainNote")}${d.bargain ? `: <em>${esc(d.bargain)}</em>` : ""}`);
  for ( const p of parts.slice(1) ) lines.push(`${p.n > 0 ? "+" : ""}${p.n}d ${esc(p.label)}`);

  const r = await rollPool(pool);
  const position = pick(d.position, DW.positions, "risky");
  const buttons = [];
  if ( (r.result !== "critical") && (r.result !== "success") ) buttons.push(...consequenceButtons(actor));

  let assister = null;
  if ( d.assist ) {
    assister = game.actors.get(d.assist);
    if ( assister ) {
      if ( assister.isOwner ) {
        lines.push(t("DW.Roll.assistedBy", { name: esc(assister.name) }));
      } else {
        lines.push(t("DW.Roll.assistPending", { name: esc(assister.name) }));
        buttons.push({ action: "assistStress", who: "target", target: assister.uuid, key: "assistStress",
          label: t("DW.Card.assistStress", { name: assister.name }), icon: "fa-solid fa-hand-holding-hand" });
      }
    }
  }
  const leading = !!d.lead && !d.groupOf;
  if ( leading ) {
    buttons.push({ action: "joinGroup", who: "others", label: t("DW.Card.joinGroup"), icon: "fa-solid fa-people-group", key: "joinGroup" });
    buttons.push({ action: "closeGroup", who: "owner", label: t("DW.Card.closeGroup"), icon: "fa-solid fa-flag-checkered", key: "closeGroup" });
  }

  const card = {
    kind: leading ? "group" : "action",
    kicker: kickerFor(d.action, rating) + (leading ? ` · ${t("DW.Roll.leading")}` : d.groupOf ? ` · ${t("DW.Roll.joining")}` : ""),
    title: d.goal ? esc(d.goal) : t(`DW.Action.${d.action}`),
    stakes: true, position, effect,
    positionLabel: t(DW.positions[position].label),
    effectLabel: t(DW.effects[effect].label),
    dice: r.dice, zero: r.zero,
    result: r.result, resultLabel: resultLabel(r.result),
    outcome: actionOutcome(position, r.result) + ((r.result === "critical") ? ` ${t("DW.Outcome.criticalEffect")}` : ""),
    lines, buttons
  };
  const message = await postCard(card, {
    actor, rolls: [r.roll],
    flags: { roll: { action: d.action, attr, position, effect, result: r.result, top: r.top, groupOf: d.groupOf ?? null, leader: leading } }
  });

  // Costs and consequences, after the dice are seen.
  if ( d.die === "special" ) await actor.update({ "system.armor.special": true });
  if ( stress ) await actor.addStress(stress, { reason: t("DW.Roll.pushReason"), quiet: true });
  if ( assister?.isOwner ) await assister.addStress(1, { reason: t("DW.Roll.assistReason", { name: actor.name }), quiet: true });
  if ( position === "desperate" ) await actor.markXp(attr, 1, { quiet: true });
  return message;
}

/* -------------------------------------------- */
/*  Resistance                                  */
/* -------------------------------------------- */

/**
 * Resist a consequence.
 * @param {Actor} actor
 * @param {object} [preset]
 * @param {string} [preset.attribute]
 * @param {string} [preset.consequence]
 * @param {boolean} [preset.protecting]   Taking it for someone else.
 */
export async function resistRoll(actor, preset = {}) {
  const sys = actor.system;
  const form = await promptForm({
    title: t("DW.Resist.title", { name: actor.name }),
    template: "resist",
    icon: "fa-solid fa-shield-halved",
    data: {
      attributes: Object.entries(sys.attributes).map(([key, a]) => ({
        key, label: t(a.label), rating: a.rating, checked: key === (preset.attribute ?? "prowess")
      })),
      consequence: preset.consequence ?? "",
      stressLabel: sys.labels.stress
    },
    onRender: f => liveSummary(f, d => {
      const n = (sys.attributes[d.attribute]?.rating ?? 0) + (Number(d.bonus) || 0);
      return `<strong>${n > 0 ? t("DW.Roll.poolN", { n }) : t("DW.Roll.poolZero")}</strong>`;
    })
  });
  if ( !form ) return null;
  const pool = (sys.attributes[form.attribute]?.rating ?? 0) + (Number(form.bonus) || 0);
  const r = await rollPool(pool);
  const stress = R.resistanceStress(r.values, r.zero);
  const label = sys.labels.stress;
  const card = {
    kind: "resist",
    kicker: `${t("DW.Resist.kicker")} · ${t(DW.attributes[form.attribute].label)}`,
    title: form.consequence ? esc(form.consequence) : t("DW.Resist.generic"),
    subtitle: preset.protecting ? t("DW.Resist.protecting", { name: esc(preset.protecting) }) : "",
    dice: r.dice, zero: r.zero, result: r.result,
    resultLabel: (stress < 0) ? t("DW.Resist.critical", { label }) : t("DW.Resist.cost", { n: stress, label }),
    outcome: t("DW.Resist.outcome")
  };
  const message = await postCard(card, { actor, rolls: [r.roll] });
  if ( stress ) await actor.addStress(stress, { reason: t("DW.Resist.reason"), quiet: true });
  return message;
}

/* -------------------------------------------- */
/*  Fortune                                     */
/* -------------------------------------------- */

/**
 * A fortune roll: how much does a trait manifest?
 * @param {object} [preset]
 * @param {number} [preset.dice]
 * @param {string} [preset.trait]
 * @param {Actor} [preset.actor]
 */
export async function fortuneRoll(preset = {}) {
  const form = await promptForm({
    title: t("DW.Fortune.title"),
    template: "fortune",
    icon: "fa-solid fa-dice",
    data: { dice: preset.dice ?? 2, trait: preset.trait ?? "", isGM: game.user.isGM }
  });
  if ( !form ) return null;
  const r = await rollPool(Number(form.dice) || 0);
  const card = {
    kind: "fortune",
    kicker: t("DW.Fortune.kicker"),
    title: form.trait ? esc(form.trait) : t("DW.Fortune.title"),
    subtitle: t("DW.Roll.poolN", { n: Number(form.dice) || 0 }),
    dice: r.dice, zero: r.zero, result: r.result,
    resultLabel: resultLabel(r.result),
    outcome: fortuneOutcome(r.result)
  };
  const whisper = form.secret ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : [];
  return postCard(card, { actor: preset.actor ?? null, rolls: [r.roll], whisper, blind: !!form.secret });
}

/**
 * A quick roll of a known pool with a fortune reading (Tier, quality, magnitude).
 * @param {number} pool
 * @param {string} title
 * @param {object} [options]
 */
export async function quickFortune(pool, title, { actor = null, subtitle = "", lines = [], outcome = null } = {}) {
  const r = await rollPool(pool);
  await postCard({
    kind: "fortune", kicker: t("DW.Fortune.kicker"), title, subtitle,
    dice: r.dice, zero: r.zero, result: r.result, resultLabel: resultLabel(r.result),
    outcome: outcome ? outcome(r) : fortuneOutcome(r.result), lines
  }, { actor, rolls: [r.roll] });
  return r;
}

/* -------------------------------------------- */
/*  Engagement                                  */
/* -------------------------------------------- */

/**
 * The engagement roll for a score.
 * @param {Actor} crew
 */
export async function engagementRoll(crew) {
  const sys = crew?.system;
  const score = sys?.score ?? {};
  const form = await promptForm({
    title: t("DW.Engagement.title"),
    template: "engagement",
    icon: "fa-solid fa-chess-knight",
    data: {
      plans: choiceList(DW.plans, score.plan || "stealth"),
      detail: score.detail ?? "",
      target: score.target ?? "",
      claimBonus: sys?.bonus.engagement ?? []
    },
    onRender: f => liveSummary(f, d => {
      const bonus = (sys?.bonus.engagement ?? []).includes(d.plan) ? 1 : 0;
      const n = 1 + (Number(d.advantages) || 0) - (Number(d.disadvantages) || 0) + (Number(d.bonus) || 0) + bonus;
      return `<strong>${n > 0 ? t("DW.Roll.poolN", { n }) : t("DW.Roll.poolZero")}</strong>${bonus ? ` · ${t("DW.Engagement.claimBonus")}` : ""}`;
    })
  });
  if ( !form ) return null;
  const claim = (sys?.bonus.engagement ?? []).includes(form.plan) ? 1 : 0;
  const pool = 1 + (Number(form.advantages) || 0) - (Number(form.disadvantages) || 0) + (Number(form.bonus) || 0) + claim;
  const r = await rollPool(pool);
  const position = R.engagementPosition(r.result);
  const plan = DW.plans[form.plan];
  const lines = [`<strong>${t(plan.detail)}:</strong> ${esc(form.detail || "—")}`];
  if ( claim ) lines.push(t("DW.Engagement.claimBonus"));
  const card = {
    kind: "engagement",
    kicker: t("DW.Engagement.kicker"),
    title: form.target ? esc(form.target) : t(plan.label),
    subtitle: t(plan.label),
    dice: r.dice, zero: r.zero, result: r.result,
    resultLabel: t(`DW.Engagement.${r.result}`),
    outcome: t(`DW.Engagement.${r.result}Hint`),
    stakes: true, position, positionLabel: t(DW.positions[position].label),
    lines,
    buttons: [{ action: "loadout", who: "any", label: t("DW.Card.loadout"), icon: "fa-solid fa-suitcase" }]
  };
  const message = await postCard(card, { actor: crew, rolls: [r.roll] });
  if ( crew?.isOwner ) await crew.update({
    "system.score.plan": form.plan, "system.score.detail": form.detail, "system.score.target": form.target || score.target,
    "system.score.engagement": position
  });
  return message;
}

/* -------------------------------------------- */
/*  Flashback                                   */
/* -------------------------------------------- */

/** Call a flashback, paying its stress. */
export async function flashback(actor) {
  const form = await promptForm({
    title: t("DW.Flashback.title", { name: actor.name }),
    template: "flashback",
    icon: "fa-solid fa-clock-rotate-left",
    ok: t("DW.Flashback.ok"),
    okIcon: "fa-solid fa-clock-rotate-left",
    data: { stressLabel: actor.system.labels.stress }
  });
  if ( !form ) return null;
  const cost = Number(form.cost) || 0;
  await postCard({
    kind: "flashback",
    kicker: t("DW.Flashback.kicker"),
    title: form.what ? esc(form.what) : t("DW.Flashback.kicker"),
    subtitle: t("DW.Flashback.cost", { n: cost, label: actor.system.labels.stress }),
    buttons: [{ action: "rollFrom", who: "owner", label: t("DW.Card.rollAction"), icon: "fa-solid fa-dice-d6" }]
  }, { actor });
  if ( cost ) await actor.addStress(cost, { reason: t("DW.Flashback.kicker"), quiet: true });
}

/* -------------------------------------------- */
/*  The GM calls for a roll                     */
/* -------------------------------------------- */

/** Set the stakes and ask a player to roll. */
export async function callForRoll() {
  const pcs = game.actors.filter(a => (a.type === "scoundrel") && a.hasPlayerOwner);
  const form = await promptForm({
    title: t("DW.Call.title"),
    template: "call",
    icon: "fa-solid fa-bullhorn",
    ok: t("DW.Call.ok"),
    okIcon: "fa-solid fa-bullhorn",
    data: {
      actors: pcs.map(a => ({ id: a.id, name: a.name })),
      actions: Object.keys(DW.actions).map(k => ({ key: k, label: t(`DW.Action.${k}`) })),
      positions: choiceList(DW.positions, "risky"),
      effects: choiceList({ limited: DW.effects.limited, standard: DW.effects.standard, great: DW.effects.great }, "standard")
    }
  });
  if ( !form ) return null;
  const actors = (Array.isArray(form.actors) ? form.actors : [form.actors]).filter(Boolean).map(id => game.actors.get(id)).filter(Boolean);
  form.position = pick(form.position, DW.positions, "risky");
  form.effect = pick(form.effect, DW.effects, "standard");
  const card = {
    kind: "call",
    kicker: t("DW.Call.kicker"),
    title: form.goal ? esc(form.goal) : (form.action ? t(`DW.Action.${form.action}`) : t("DW.Call.anyAction")),
    subtitle: actors.length ? actors.map(a => esc(a.name)).join(", ") : t("DW.Call.anyone"),
    stakes: true, position: form.position, effect: form.effect,
    positionLabel: t(DW.positions[form.position].label), effectLabel: t(DW.effects[form.effect].label),
    lines: form.consequence ? [`<strong>${t("DW.Call.consequence")}:</strong> ${esc(form.consequence)}`] : [],
    buttons: [{ action: "answerCall", who: "any", label: t("DW.Card.rollAction"), icon: "fa-solid fa-dice-d6",
      data: { "roll-action": form.action ?? "", position: form.position, effect: form.effect } }]
  };
  return postCard(card, { flags: { call: { actors: actors.map(a => a.id), goal: form.goal ?? "" } } });
}

/* -------------------------------------------- */
/*  Card buttons                                */
/* -------------------------------------------- */

/** Which character answers a button: the card's actor if the user owns it, else their own. */
function respondent(actor) {
  if ( actor?.isOwner && (actor.type === "scoundrel") ) return actor;
  return myCharacter();
}

export function registerCardButtons() {
  onCardButton("resist", async ({ actor }) => {
    const who = respondent(actor);
    if ( who ) return resistRoll(who);
  });
  onCardButton("protect", async ({ actor }) => {
    const me = myCharacter();
    if ( me ) return resistRoll(me, { protecting: actor?.name ?? "" });
  });
  onCardButton("armor", async ({ actor }) => {
    const who = respondent(actor);
    if ( !who ) return;
    const a = who.system.armor;
    const options = ["armor", "heavy", "special"].filter(k => !a[k] && ((k !== "special") || who.system.hasSpecialArmor));
    if ( !options.length ) return ui.notifications.warn(t("DW.Armor.none"));
    const form = await promptForm({
      title: t("DW.Armor.title"), template: "armor", icon: "fa-solid fa-vest", ok: t("DW.Armor.use"), okIcon: "fa-solid fa-vest",
      data: { options: options.map((k, i) => ({ key: k, label: t(`DW.Armor.${k}`), checked: i === 0 })) }
    });
    if ( form?.kind ) return who.useArmor(form.kind);
  });
  onCardButton("assistStress", async ({ message, button }) => {
    const target = button.dataset.dwTarget ? await fromUuid(button.dataset.dwTarget) : null;
    if ( !target?.isOwner ) return;
    await target.addStress(1, { reason: t("DW.Roll.assistReason", { name: message.speaker.alias }) });
    return spendButton(message, "assistStress");
  });
  onCardButton("joinGroup", async ({ message }) => {
    const me = myCharacter();
    if ( !me ) return ui.notifications.warn(t("DW.Roll.noCharacter"));
    const f = message.getFlag(SYSTEM_ID, "roll") ?? {};
    if ( game.messages.some(m => (m.getFlag(SYSTEM_ID, "roll")?.groupOf === message.id) && (m.speaker.actor === me.id)) ) {
      return ui.notifications.warn(t("DW.Group.already"));
    }
    return actionRoll(me, { action: f.action, position: f.position, effect: f.effect, locked: true, groupOf: message.id });
  });
  onCardButton("closeGroup", async ({ message, actor }) => closeGroup(message, actor));
  onCardButton("render:group", decorateGroup);
  onCardButton("rollFrom", async ({ actor }) => { if ( actor?.isOwner ) return actionRoll(actor); });
  onCardButton("answerCall", async ({ message, data }) => {
    const call = message.getFlag(SYSTEM_ID, "call") ?? {};
    let who = null;
    if ( game.user.isGM && call.actors?.length ) who = game.actors.get(call.actors[0]);
    else if ( call.actors?.length ) who = call.actors.map(id => game.actors.get(id)).find(a => a?.isOwner) ?? myCharacter();
    else who = myCharacter();
    if ( !who ) return ui.notifications.warn(t("DW.Roll.noCharacter"));
    return actionRoll(who, { action: data.rollAction || undefined, position: data.position, effect: data.effect, locked: true, goal: call.goal });
  });
  onCardButton("loadout", async () => {
    const me = myCharacter();
    if ( !me ) return;
    await me.sheet.render({ force: true });
    me.sheet.changeTab?.("gear", "primary");
  });
}

/** Rolls that joined a group action. */
function groupRolls(message) {
  return game.messages.filter(m => m.getFlag(SYSTEM_ID, "roll")?.groupOf === message.id);
}

/** Show who has joined a group action, and the best result so far. */
function decorateGroup(message, el) {
  const slot = el.querySelector(".dw-card__slot");
  if ( !slot ) return;
  const lead = message.getFlag(SYSTEM_ID, "roll") ?? {};
  const joined = groupRolls(message);
  const all = [{ name: message.speaker.alias, ...lead }, ...joined.map(m => ({ name: m.speaker.alias, ...m.getFlag(SYSTEM_ID, "roll") }))];
  const best = all.reduce((b, r) => (R.RESULT_ORDER.indexOf(r.result) > R.RESULT_ORDER.indexOf(b.result) ? r : b), all[0]);
  const failures = joined.filter(m => m.getFlag(SYSTEM_ID, "roll")?.result === "failure").length;
  slot.innerHTML = `<div class="dw-group">
    <ul>${all.map(r => `<li class="dw-group__${r.result}"><span>${esc(r.name)}</span><span>${resultLabel(r.result)}</span></li>`).join("")}</ul>
    <p><strong>${t("DW.Group.best")}:</strong> ${resultLabel(best.result)}${failures ? ` · ${t("DW.Group.failures", { n: failures })}` : ""}</p>
  </div>`;
}

/** Re-render group cards when someone joins. */
export function onCreateChatMessage(message) {
  const groupOf = message.getFlag(SYSTEM_ID, "roll")?.groupOf;
  if ( !groupOf ) return;
  const lead = game.messages.get(groupOf);
  if ( lead ) ui.chat?.updateMessage?.(lead);
}

/** The leader settles a group action: best result for all, 1 stress per failure. */
async function closeGroup(message, leader) {
  if ( !leader?.isOwner ) return;
  const lead = message.getFlag(SYSTEM_ID, "roll") ?? {};
  const joined = groupRolls(message);
  const all = [{ name: leader.name, ...lead }, ...joined.map(m => ({ name: m.speaker.alias, ...m.getFlag(SYSTEM_ID, "roll") }))];
  const best = all.reduce((b, r) => (R.RESULT_ORDER.indexOf(r.result) > R.RESULT_ORDER.indexOf(b.result) ? r : b), all[0]);
  const failures = joined.filter(m => m.getFlag(SYSTEM_ID, "roll")?.result === "failure").length;
  await postCard({
    kind: "action",
    kicker: t("DW.Group.kicker"),
    title: t("DW.Group.result", { name: leader.name }),
    stakes: true, position: lead.position, effect: lead.effect,
    positionLabel: DW.positions[lead.position] ? t(DW.positions[lead.position].label) : "",
    effectLabel: DW.effects[lead.effect] ? t(DW.effects[lead.effect].label) : "",
    result: best.result, resultLabel: resultLabel(best.result),
    outcome: actionOutcome(lead.position, best.result),
    lines: [t("DW.Group.participants", { names: all.map(r => esc(r.name)).join(", ") }),
      failures ? t("DW.Group.leaderStress", { n: failures, label: leader.system.labels.stress }) : t("DW.Group.noStress")],
    buttons: (best.result === "success" || best.result === "critical") ? [] : consequenceButtons(leader)
  }, { actor: leader });
  if ( failures ) await leader.addStress(failures, { reason: t("DW.Group.kicker"), quiet: true });
  return spendButton(message, "closeGroup").then(() => spendButton(message, "joinGroup"));
}
