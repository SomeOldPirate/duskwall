/**
 * The crew sheet: rep and turf, heat and wanted, the claims map, upgrades, cohorts, and the score.
 * @module duskwall/apps/crew-sheet
 */

import DW, { SYSTEM_ID, TEMPLATES } from "../config.mjs";
import * as Flows from "../dice/flows.mjs";
import * as Downtime from "../dice/downtime.mjs";
import { t, esc } from "../helpers/chat.mjs";
import { confirm } from "../dice/dialogs.mjs";
import { activateListInputs, addListEntry, removeListEntry } from "./list-editing.mjs";
import { DWSheetMixin } from "./sheet-mixin.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

/** Lay a claims map out on a grid with connector cells between tiles. */
export function layoutClaims(map, columns) {
  const tiles = map.tiles.map((tile, i) => {
    const r = Math.floor(i / columns), c = i % columns;
    return { ...tile, index: i, row: (2 * r) + 1, col: (2 * c) + 1 };
  });
  const links = map.links.filter(l => l?.length === 2).map(([a, b]) => {
    const ra = Math.floor(a / columns), ca = a % columns, rb = Math.floor(b / columns), cb = b % columns;
    const horizontal = ra === rb;
    const held = tiles[a]?.held && tiles[b]?.held;
    return horizontal
      ? { row: (2 * ra) + 1, col: (2 * Math.min(ca, cb)) + 2, horizontal, held }
      : { row: (2 * Math.min(ra, rb)) + 2, col: (2 * ca) + 1, horizontal, held };
  });
  // A tile can be claimed if it touches one already held.
  const adjacent = new Set();
  for ( const [a, b] of map.links ) {
    if ( tiles[a]?.held ) adjacent.add(b);
    if ( tiles[b]?.held ) adjacent.add(a);
  }
  for ( const tile of tiles ) tile.reachable = !tile.held && adjacent.has(tile.index);
  return { tiles, links, columns, rows: Math.ceil(map.tiles.length / columns) };
}

export default class CrewSheet extends DWSheetMixin(HandlebarsApplicationMixin(ActorSheetV2)) {

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    classes: ["duskwall", "dw-sheet", "dw-crew"],
    position: { width: 1000, height: 820 },
    window: { resizable: true, icon: "fa-solid fa-people-group" },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      setTrack: this.#onSetTrack,
      setHold: this.#onSetHold,
      setTier: this.#onSetTier,
      toggleClaim: this.#onToggleClaim,
      takeAbility: this.#onTakeAbility,
      setUpgrade: this.#onSetUpgrade,
      setSpecial: this.#onSetSpecial,
      cohortHarm: this.#onCohortHarm,
      cohortRoll: this.#onCohortRoll,
      cohortArmor: this.#onCohortArmor,
      engagement: this.#onEngagement,
      payoff: this.#onPayoff,
      entanglements: this.#onEntanglements,
      beginDowntime: this.#onBeginDowntime,
      endDowntime: this.#onEndDowntime,
      develop: this.#onDevelop,
      crewXp: this.#onCrewXp,
      tierRoll: this.#onTierRoll,
      relation: this.#onRelation,
      contactAdd: this.#onContactAdd,
      contactRemove: this.#onContactRemove,
      logRemove: this.#onLogRemove,
      browse: this.#onBrowse
    }
  };

  /** @inheritdoc */
  static PARTS = {
    header: { template: `${TEMPLATES}/actor/crew-header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    crew: { template: `${TEMPLATES}/actor/crew-main.hbs`, scrollable: [""] },
    upgrades: { template: `${TEMPLATES}/actor/crew-upgrades.hbs`, scrollable: [""] },
    score: { template: `${TEMPLATES}/actor/crew-score.hbs`, scrollable: [""] },
    contacts: { template: `${TEMPLATES}/actor/crew-contacts.hbs`, scrollable: [""] },
    notes: { template: `${TEMPLATES}/actor/notes.hbs`, scrollable: [""] }
  };

  /** @inheritdoc */
  static TABS = {
    primary: {
      tabs: [
        { id: "crew", icon: "fa-solid fa-chess-rook" },
        { id: "upgrades", icon: "fa-solid fa-screwdriver-wrench" },
        { id: "score", icon: "fa-solid fa-sack-dollar" },
        { id: "contacts", icon: "fa-solid fa-address-book" },
        { id: "notes", icon: "fa-solid fa-feather" }
      ],
      initial: "crew",
      labelPrefix: "DW.Tab"
    }
  };

  /** Which claims map is showing. */
  #map = "claims";

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const ct = sys.crewType?.system ?? null;
    const track = (value, max, path, extra = {}) => Array.from({ length: max }, (_, i) => ({ n: i + 1, on: i < value, path, ...extra }));
    const map = this.#map;

    const abilities = actor.items.filter(i => i.type === "crewAbility").sort((a, b) => a.sort - b.sort);
    const cohorts = actor.items.filter(i => i.type === "cohort").sort((a, b) => a.sort - b.sort);
    const upgradeGroup = (group, keys) => keys.map(([key, max]) => ({
      group, key, label: t(`DW.Upgrade.${key}`), hint: t(`DW.Upgrade.${key}Hint`),
      boxes: Array.from({ length: max }, (_, i) => ({ n: i + 1, on: i < (sys.upgrades[group][key] ?? 0) }))
    }));
    const lairKeys = Object.entries(DW.crewUpgrades.lair).filter(([k]) => !(ct?.vehicle && ["carriage", "boat"].includes(k)));
    if ( ct?.vehicle ) lairKeys.unshift(["vehicle", 2]);

    Object.assign(context, {
      actor, system: sys, fields: sys.schema.fields, editable: this.isEditable, isGM: game.user.isGM,
      crewType: sys.crewType, ct,
      repTrack: Array.from({ length: DW.repMax }, (_, i) => ({
        n: i + 1, on: i < sys.rep, turf: i >= sys.repMax, path: "rep"
      })),
      heatTrack: track(sys.heat, DW.heatMax, "heat"),
      wantedTrack: track(sys.wanted, DW.wantedMax, "wanted"),
      coinTrack: track(sys.coin, sys.vaultMax, "coin", {}).map((c, i) => ({ ...c, vault: i >= 4 })),
      xpTrack: track(sys.xp, DW.crewXpMax, "xp"),
      tiers: [1, 2, 3, 4].map(n => ({ n, on: n <= sys.tier })),
      holdStrong: sys.hold === "strong",
      map,
      isPrison: map === "prison",
      claims: layoutClaims(sys[map], (map === "prison") ? 4 : 5),
      abilities: abilities.map(a => ({ id: a.id, name: a.name, rules: a.system.rules, boxes: a.system.boxes, taken: a.system.isTaken })),
      lair: upgradeGroup("lair", lairKeys),
      training: upgradeGroup("training", Object.entries(DW.crewUpgrades.training)),
      quality: upgradeGroup("quality", Object.entries(DW.crewUpgrades.quality)),
      special: sys.specialUpgrades.map((u, index) => ({
        ...u, index, boxes: Array.from({ length: u.boxes }, (_, i) => ({ n: i + 1, on: i < u.value }))
      })),
      cohorts: cohorts.map(c => ({
        id: c.id, name: c.name, img: c.img, kind: c.system.kind, kindLabel: t(DW.cohortKinds[c.system.kind] ?? "DW.Cohort.vehicle"),
        types: c.system.types.join(", "), quality: c.system.quality, scale: t(c.system.scaleLabel), pool: c.system.pool,
        elite: c.system.elite, harm: c.system.harmBoxes.map(h => ({ ...h, label: t(h.label) })),
        armor: c.system.armor, armorUsed: c.system.armorUsed, dead: c.system.dead, broken: c.system.broken,
        edges: c.system.edges.join(", "), flaws: c.system.flaws.join(", ")
      })),
      triggers: ct?.xpTriggers ?? [],
      huntingOps: (ct?.huntingGrounds ?? []).map(h => ({ ...h, selected: h.name === sys.huntingOp })),
      reputations: DW.reputations,
      plans: Object.entries(DW.plans).map(([key, p]) => ({ key, label: t(p.label), selected: key === sys.score.plan })),
      tierOptions: DW.roman.map((label, value) => ({ value, label, selected: value === sys.score.targetTier })),
      contacts: sys.contacts.map((c, index) => ({ ...c, index })),
      log: sys.log.map((l, index) => ({ ...l, index })).reverse(),
      members: sys.members.map(m => ({ id: m.id, name: m.name, img: m.img, playbook: m.system.playbook?.name ?? "",
        stress: m.system.stress.value, stressMax: m.system.stress.max, trauma: m.system.trauma.value,
        downtime: Math.max(0, m.system.freeDowntime - m.system.downtime.used) })),
      engagementLabel: sys.score.engagement ? t(DW.positions[sys.score.engagement]?.label ?? "") : "",
      bonus: sys.bonus,
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

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    activateListInputs(this);
    for ( const b of this.element.querySelectorAll("[data-map-switch]") ) {
      b.addEventListener("click", () => {
        this.#map = b.dataset.mapSwitch;
        this.render({ parts: ["crew"] });
      });
    }
  }

  /** @inheritdoc */
  async _onDropItem(event, item) {
    if ( !this.isEditable ) return null;
    if ( !(item instanceof Item) ) item = await Item.implementation.fromDropData(item);
    if ( !item ) return null;
    if ( item.type === "crewType" ) return this.document.applyCrewType(item);
    if ( ["playbook", "ability", "gear"].includes(item.type) ) {
      ui.notifications.warn(t("DW.Drop.scoundrelOnly"));
      return null;
    }
    return super._onDropItem(event, item);
  }

  /** @inheritdoc */
  async _onDropActor(event, actor) {
    if ( actor && !(actor instanceof Actor) ) actor = await Actor.implementation.fromDropData(actor);
    // Drop a scoundrel on the crew sheet to enlist them.
    if ( (actor?.type === "scoundrel") && actor.isOwner ) {
      await actor.update({ "system.crewId": this.document.id });
      return this.render();
    }
    return super._onDropActor?.(event, actor);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onSetTrack(event, target) {
    const path = target.dataset.path;
    const n = Number(target.dataset.n);
    const current = foundry.utils.getProperty(this.document.system, path);
    return this.document.update({ [`system.${path}`]: (n === current) ? n - 1 : n });
  }

  static async #onSetHold() {
    return this.document.update({ "system.hold": (this.document.system.hold === "strong") ? "weak" : "strong" });
  }

  static async #onSetTier(event, target) {
    const n = Number(target.dataset.n);
    return this.document.update({ "system.tier": (n === this.document.system.tier) ? n - 1 : n });
  }

  static async #onToggleClaim(event, target) {
    const map = target.dataset.map;
    const index = Number(target.dataset.index);
    const data = this.document.system.toObject()[map];
    const tile = data.tiles[index];
    if ( !tile || tile.lair ) return;
    if ( !tile.held ) {
      const layout = layoutClaims(this.document.system[map], (map === "prison") ? 4 : 5);
      if ( !layout.tiles[index].reachable ) {
        const ok = await confirm(t("DW.Claims.offPathTitle"), `<p>${t("DW.Claims.offPath", { name: esc(tile.name) })}</p>`);
        if ( !ok ) return;
      }
    }
    tile.held = !tile.held;
    return this.document.update({ [`system.${map}`]: data });
  }

  static async #onTakeAbility(event, target) {
    const item = this._itemFor(target);
    if ( !item ) return;
    const n = Number(target.dataset.n);
    return item.update({ "system.taken": (n === item.system.taken) ? n - 1 : n });
  }

  static async #onSetUpgrade(event, target) {
    const { group, key } = target.dataset;
    const n = Number(target.dataset.n);
    const current = this.document.system.upgrades[group][key];
    return this.document.update({ [`system.upgrades.${group}.${key}`]: (n === current) ? n - 1 : n });
  }

  static async #onSetSpecial(event, target) {
    const index = Number(target.dataset.index);
    const n = Number(target.dataset.n);
    const list = this.document.system.toObject().specialUpgrades;
    if ( !list[index] ) return;
    list[index].value = (n === list[index].value) ? n - 1 : n;
    await this.document.update({ "system.specialUpgrades": list });
    // Stress and trauma boxes on the scoundrels may have changed.
    for ( const m of this.document.system.members ) m.reset();
  }

  static async #onCohortHarm(event, target) {
    const item = this._itemFor(target);
    if ( !item ) return;
    const n = Number(target.dataset.n);
    return item.update({ "system.harm": (n === item.system.harm) ? n - 1 : n });
  }

  static async #onCohortArmor(event, target) {
    const item = this._itemFor(target);
    return item?.update({ "system.armorUsed": !item.system.armorUsed });
  }

  /** A cohort acting on its own rolls its quality. */
  static async #onCohortRoll(event, target) {
    const item = this._itemFor(target);
    if ( !item ) return;
    const s = item.system;
    if ( s.broken ) return ui.notifications.warn(t("DW.Cohort.brokenWarn", { name: item.name }));
    const lines = [t("DW.Cohort.quality", { n: s.quality })];
    if ( s.elite ) lines.push(t("DW.Cohort.eliteNote"));
    if ( s.impaired ) lines.push(t("DW.Cohort.impairedNote"));
    return Flows.quickFortune(s.pool, esc(item.name), { actor: this.document, subtitle: `${s.types.join(", ")}`, lines });
  }

  static async #onEngagement() { return Flows.engagementRoll(this.document); }
  static async #onPayoff() { return Downtime.payoff(this.document); }
  static async #onEntanglements() { return Downtime.entanglements(this.document); }
  static async #onBeginDowntime() { return Downtime.beginDowntime(this.document); }
  static async #onEndDowntime() { return this.document.update({ "system.downtimeOpen": false }); }
  static async #onDevelop() { return Downtime.develop(this.document); }
  static async #onCrewXp() { return Downtime.crewXp(this.document); }

  static async #onTierRoll() {
    const sys = this.document.system;
    return Flows.quickFortune(sys.tier, t("DW.Crew.tierRoll", { name: this.document.name }), { actor: this.document, subtitle: `${t("DW.Crew.tier")} ${sys.tierLabel}` });
  }

  static async #onRelation(event, target) {
    const index = Number(target.dataset.index);
    const rel = target.dataset.relation;
    const list = this.document.system.toObject().contacts;
    if ( !list[index] ) return;
    list[index].relation = (list[index].relation === rel) ? "" : rel;
    return this.document.update({ "system.contacts": list });
  }

  static async #onContactAdd() { return addListEntry(this.document, "contacts"); }
  static async #onContactRemove(event, target) { return removeListEntry(this.document, "contacts", Number(target.dataset.index)); }
  static async #onLogRemove(event, target) { return removeListEntry(this.document, "log", Number(target.dataset.index)); }

  static #onBrowse() {
    return game.packs.get(`${SYSTEM_ID}.crew-types`)?.render(true);
  }
}
