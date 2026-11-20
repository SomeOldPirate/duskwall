/**
 * The scoundrel's sheet, laid out like the paper playbook: who you are and what's been done to you
 * on the left, your playbook's abilities in the middle, your actions on the right.
 * @module duskwall/apps/scoundrel-sheet
 */

import DW, { SYSTEM_ID, TEMPLATES } from "../config.mjs";
import * as Flows from "../dice/flows.mjs";
import * as Downtime from "../dice/downtime.mjs";
import { t } from "../helpers/chat.mjs";
import { activateListInputs, addListEntry, removeListEntry } from "./list-editing.mjs";
import { DWSheetMixin } from "./sheet-mixin.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

export default class ScoundrelSheet extends DWSheetMixin(HandlebarsApplicationMixin(ActorSheetV2)) {

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    classes: ["duskwall", "dw-sheet", "dw-scoundrel"],
    position: { width: 1040, height: 820 },
    window: { resizable: true, icon: "fa-solid fa-mask" },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      roll: this.#onRoll,
      resist: this.#onResist,
      setAction: this.#onSetAction,
      setTrack: this.#onSetTrack,
      toggleTrauma: this.#onToggleTrauma,
      toggleArmor: this.#onToggleArmor,
      setHealing: this.#onSetHealing,
      takeAbility: this.#onTakeAbility,
      toggleGear: this.#onToggleGear,
      setUses: this.#onSetUses,
      setLoad: this.#onSetLoad,
      flashback: this.#onFlashback,
      downtime: this.#onDowntime,
      sessionXp: this.#onSessionXp,
      gather: this.#onGather,
      relation: this.#onRelation,
      friendAdd: this.#onFriendAdd,
      friendRemove: this.#onFriendRemove,
      toggleExtra: this.#onToggleExtra,
      clearScene: this.#onClearScene,
      browse: this.#onBrowse
    }
  };

  /** @inheritdoc */
  static PARTS = {
    header: { template: `${TEMPLATES}/actor/scoundrel-header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    play: { template: `${TEMPLATES}/actor/scoundrel-play.hbs`, scrollable: [".dw-col"] },
    gear: { template: `${TEMPLATES}/actor/scoundrel-gear.hbs`, scrollable: [""] },
    people: { template: `${TEMPLATES}/actor/scoundrel-people.hbs`, scrollable: [""] },
    notes: { template: `${TEMPLATES}/actor/notes.hbs`, scrollable: [""] }
  };

  /** @inheritdoc */
  static TABS = {
    primary: {
      tabs: [
        { id: "play", icon: "fa-solid fa-mask" },
        { id: "gear", icon: "fa-solid fa-suitcase" },
        { id: "people", icon: "fa-solid fa-user-group" },
        { id: "notes", icon: "fa-solid fa-feather" }
      ],
      initial: "play",
      labelPrefix: "DW.Tab"
    }
  };

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const pb = sys.playbook?.system ?? null;
    const items = actor.items;

    const track = (value, max, key) => Array.from({ length: max }, (_, i) => ({ n: i + 1, on: i < value, key }));

    const abilities = items.filter(i => i.type === "ability").sort((a, b) => {
      const own = x => (x.system.playbook === pb?.key ? 0 : 1);
      return (own(a) - own(b)) || (a.sort - b.sort);
    });
    const gear = items.filter(i => i.type === "gear").sort((a, b) => a.sort - b.sort);
    const crews = game.actors.filter(a => a.type === "crew");

    Object.assign(context, {
      actor, system: sys, fields: sys.schema.fields, editable: this.isEditable, isGM: game.user.isGM,
      playbook: sys.playbook,
      pb,
      spirit: sys.spirit,
      labels: { stress: sys.labels.stress, trauma: sys.labels.trauma },
      crew: sys.crew,
      crews: crews.map(c => ({ id: c.id, name: c.name, selected: c.id === sys.crew?.id })),
      heritages: DW.heritages, backgrounds: DW.backgrounds, vices: DW.vices,
      stressTrack: track(sys.stress.value, sys.stress.max, "stress.value"),
      traumaList: sys.traumaList.map(c => ({ name: c, on: sys.trauma.conditions.includes(c) })),
      extraTrauma: sys.trauma.conditions.filter(c => !sys.traumaList.includes(c)),
      traumaPips: Array.from({ length: sys.trauma.max }, (_, i) => i < sys.trauma.value),
      healingSegments: this.#clockSegments(sys.healing, sys.healingMax),
      coinTrack: track(sys.coin, DW.maxCoin, "coin"),
      stashRows: [0, 1, 2, 3].map(r => Array.from({ length: 10 }, (_, i) => ({ n: r * 10 + i + 1, on: (r * 10 + i) < sys.stash }))),
      playbookXp: track(sys.xp.playbook, sys.xpMax.playbook, "xp.playbook"),
      attributes: Object.entries(sys.attributes).map(([key, a]) => ({
        key, label: t(a.label), rating: a.rating,
        xp: track(sys.xp[key], a.xpMax, `xp.${key}`),
        actions: a.actions.map(action => ({
          key: action, label: t(`DW.Action.${action}`), hint: t(`DW.ActionHint.${action}`), rating: sys.actions[action],
          // Four dots as on the paper sheet (five with Dark Talent); dots past the cap are locked until Mastery.
          dots: Array.from({ length: Math.max(4, a.cap) }, (_, i) => ({
            n: i + 1, on: i < sys.actions[action], locked: (i >= a.cap) && (i >= sys.actions[action])
          }))
        }))
      })),
      abilities: abilities.map(a => ({
        id: a.id, name: a.name, rules: a.system.rules, boxes: a.system.boxes, taken: a.system.isTaken,
        foreign: pb && a.system.playbook && (a.system.playbook !== pb.key),
        source: a.system.playbook ? t(`DW.Playbook.${a.system.playbook}`) : "",
        hasMore: !!a.system.description
      })),
      triggers: pb?.xpTriggers ?? [],
      gather: pb?.gatherInfo ?? [],
      plans: Object.values(DW.plans).map(p => ({ label: t(p.label), detail: t(p.detail) })),
      harm: sys.harmPenalty,
      loads: Object.entries(DW.loadLevels).map(([key, l]) => ({
        key, label: t(l.label), hint: t(l.hint), limit: sys.loadLimits[key], on: sys.load === key,
        spiritLabel: (sys.spirit === "hull") ? t(`DW.Load.hull.${key}`) : null
      })),
      loadBar: this.#loadBar(sys),
      playbookGear: gear.filter(g => !g.system.standard).map(g => this.#gearRow(g)),
      standardGear: gear.filter(g => g.system.standard).map(g => this.#gearRow(g)),
      friends: sys.friends.map((f, index) => ({ ...f, index })),
      friendsLabel: pb?.friendsLabel ?? t("DW.Friends.label"),
      extras: (pb?.extras ?? []).map(x => ({
        key: x.key, label: x.label, max: x.max,
        options: (x.options ?? []).map(o => ({ value: o, on: (sys.extras?.[x.key] ?? []).includes(o) }))
      })),
      need: pb?.need ?? "",
      darkTalent: abilities.some(a => (a.name === "Dark Talent") && a.system.isTaken),
      talentOptions: Object.keys(DW.attributes).map(k => ({ key: k, label: t(DW.attributes[k].label), selected: sys.darkTalent === k })),
      downtime: Object.entries(DW.downtime).map(([key, d]) => ({ key, label: t(d.label), icon: d.icon,
        hidden: (key === "vice" && !sys.hasVice && sys.spirit !== "vampire") })),
      downtimeLeft: Math.max(0, sys.freeDowntime - sys.downtime.used),
      enrichedNotes: await TextEditor.implementation.enrichHTML(sys.notes, { relativeTo: actor, secrets: actor.isOwner })
    });
    return context;
  }

  /** @inheritdoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.tabs ??= this._prepareTabs("primary");
    if ( partId in context.tabs ) context.tab = context.tabs[partId];
    return context;
  }

  #gearRow(g) {
    return {
      id: g.id, name: g.name, load: g.system.load, used: g.system.used, weightless: g.system.weightless,
      boxes: g.system.boxes, uses: g.system.useBoxes, hasUses: g.system.maxUses > 0,
      description: g.system.description, category: g.system.category
    };
  }

  #loadBar(sys) {
    const limit = sys.loadLimit ?? sys.loadLimits.heavy;
    return {
      carried: sys.loadCarried, limit, chosen: !!sys.load, over: sys.overloaded,
      boxes: Array.from({ length: Math.max(limit, sys.loadCarried) }, (_, i) => ({ on: i < sys.loadCarried, over: i >= limit }))
    };
  }

  /** SVG segments for a small clock. */
  #clockSegments(value, size) {
    const r = 40, cx = 50, cy = 50;
    return Array.from({ length: size }, (_, i) => {
      const a0 = (i / size) * 2 * Math.PI - Math.PI / 2;
      const a1 = ((i + 1) / size) * 2 * Math.PI - Math.PI / 2;
      const p = a => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
      return { n: i + 1, on: i < value, d: `M${cx},${cy} L${p(a0)} A${r},${r} 0 0,1 ${p(a1)} Z` };
    });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const sys = this.document.system;
    this.element.dataset.spirit = sys.spirit || "none";
    this.element.classList.toggle("is-out", sys.outOfAction);
    this.element.classList.toggle("is-retired", sys.retired);
    activateListInputs(this);
  }

  /** @inheritdoc */
  async _onDropItem(event, item) {
    if ( !this.isEditable ) return null;
    if ( !(item instanceof Item) ) item = await Item.implementation.fromDropData(item);
    if ( !item ) return null;
    if ( item.type === "playbook" ) return this.document.applyPlaybook(item);
    if ( ["crewType", "crewAbility", "cohort"].includes(item.type) ) {
      ui.notifications.warn(t("DW.Drop.crewOnly"));
      return null;
    }
    return super._onDropItem(event, item);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onRoll(event, target) {
    return Flows.actionRoll(this.document, { action: target.dataset.action_key ?? target.dataset.key });
  }

  static async #onResist(event, target) {
    return Flows.resistRoll(this.document, { attribute: target.dataset.key });
  }

  /** Click a dot to set the rating; click the last lit dot to clear it. */
  static async #onSetAction(event, target) {
    const { key } = target.dataset;
    const n = Number(target.dataset.n);
    const current = this.document.system.actions[key];
    const cap = this.document.system.attributes[DW.actions[key]]?.cap ?? 4;
    // Past the cap is locked for everyone; a GM can force it with Shift-click.
    if ( (n > cap) && (n > current) && !(game.user.isGM && event.shiftKey) ) {
      return ui.notifications.warn(t(game.user.isGM ? "DW.Sheet.ratingCapGM" : "DW.Sheet.ratingCap", { n: cap }));
    }
    return this.document.update({ [`system.actions.${key}`]: (n === current) ? n - 1 : n });
  }

  /** Generic box tracks: stress, coin, stash, xp. */
  static async #onSetTrack(event, target) {
    const path = target.dataset.path;
    const n = Number(target.dataset.n);
    const current = foundry.utils.getProperty(this.document.system, path);
    return this.document.update({ [`system.${path}`]: (n === current) ? n - 1 : n });
  }

  static async #onToggleTrauma(event, target) {
    const name = target.dataset.name;
    const list = [...this.document.system.trauma.conditions];
    const i = list.indexOf(name);
    if ( i >= 0 ) list.splice(i, 1);
    else list.push(name);
    return this.document.update({ "system.trauma.conditions": list });
  }

  static async #onToggleArmor(event, target) {
    const k = target.dataset.kind;
    return this.document.update({ [`system.armor.${k}`]: !this.document.system.armor[k] });
  }

  static async #onSetHealing(event, target) {
    const n = Number(target.dataset.n);
    const current = this.document.system.healing;
    return this.document.update({ "system.healing": (n === current) ? n - 1 : n });
  }

  /** Cycle an ability's boxes. */
  static async #onTakeAbility(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( !item ) return;
    const n = Number(target.dataset.n);
    const taken = (n === item.system.taken) ? n - 1 : n;
    return item.update({ "system.taken": taken });
  }

  static async #onToggleGear(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    return item?.update({ "system.used": !item.system.used });
  }

  static async #onSetUses(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( !item ) return;
    const n = Number(target.dataset.n);
    return item.update({ "system.uses": (n === item.system.uses) ? n - 1 : n });
  }

  static async #onSetLoad(event, target) {
    const k = target.dataset.key;
    return this.document.update({ "system.load": (this.document.system.load === k) ? "" : k });
  }

  static async #onFlashback() {
    return Flows.flashback(this.document);
  }

  static async #onDowntime(event, target) {
    return Downtime.downtimeActivity(this.document, target.dataset.key);
  }

  static async #onSessionXp() {
    return Downtime.sessionXp(this.document);
  }

  /** A gather-information question opens an action roll with the question as its goal. */
  static async #onGather(event, target) {
    return Flows.actionRoll(this.document, { goal: target.dataset.question });
  }

  static async #onRelation(event, target) {
    const index = Number(target.dataset.index);
    const rel = target.dataset.relation;
    const list = this.document.system.toObject().friends;
    if ( !list[index] ) return;
    list[index].relation = (list[index].relation === rel) ? "" : rel;
    return this.document.update({ "system.friends": list });
  }

  static async #onFriendAdd() {
    return addListEntry(this.document, "friends");
  }

  static async #onFriendRemove(event, target) {
    return removeListEntry(this.document, "friends", Number(target.dataset.index));
  }

  static async #onToggleExtra(event, target) {
    const { key, value } = target.dataset;
    const pb = this.document.system.playbook?.system;
    const def = pb?.extras.find(x => x.key === key);
    const current = [...(this.document.system.extras?.[key] ?? [])];
    const i = current.indexOf(value);
    if ( i >= 0 ) current.splice(i, 1);
    else {
      if ( def?.max && (current.length >= def.max) ) current.shift();
      current.push(value);
    }
    return this.document.update({ [`system.extras.${key}`]: current });
  }

  static async #onClearScene() {
    return this.document.update({ "system.outOfAction": false });
  }

  /** Open the playbooks compendium. */
  static #onBrowse() {
    return game.packs.get(`${SYSTEM_ID}.playbooks`)?.render(true);
  }
}
