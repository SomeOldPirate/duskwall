/**
 * Table-wide panels: the toolbar, the clocks on the wall, and the faction ledger.
 * @module duskwall/apps/panels
 */

import DW, { SYSTEM_ID, TEMPLATES } from "../config.mjs";
import * as Flows from "../dice/flows.mjs";
import { t } from "../helpers/chat.mjs";
import { clockSegments } from "./faction-sheet.mjs";
import { fetchFromPack } from "../documents/actor.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* -------------------------------------------- */
/*  Clocks                                      */
/* -------------------------------------------- */

export class ClocksPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dw-clocks",
    classes: ["duskwall", "dw-panel", "dw-clocks-panel"],
    position: { width: 300, height: "auto", top: 80, left: 120 },
    window: { title: "DW.Clock.panel", icon: "fa-solid fa-clock", resizable: true, minimizable: true },
    actions: {
      tick: ClocksPanel.#onTick,
      open: ClocksPanel.#onOpen,
      create: ClocksPanel.#onCreate,
      unpin: ClocksPanel.#onUnpin
    }
  };

  static PARTS = { body: { template: `${TEMPLATES}/apps/clocks.hbs`, scrollable: [""] } };

  /** The one panel. */
  static get instance() {
    return foundry.applications.instances.get("dw-clocks") ?? new ClocksPanel();
  }

  static toggle() {
    const app = ClocksPanel.instance;
    if ( app.rendered ) return app.close();
    return app.render({ force: true });
  }

  static refresh() {
    const app = foundry.applications.instances.get("dw-clocks");
    if ( app?.rendered ) app.render();
  }

  async _prepareContext() {
    const clocks = game.actors.filter(a => (a.type === "clock") && a.system.pinned && a.testUserPermission(game.user, "OBSERVER"))
      .sort((a, b) => a.sort - b.sort)
      .map(a => ({
        id: a.id, name: a.name, kind: a.system.kind, kindLabel: t(DW.clockKinds[a.system.kind]),
        value: a.system.value, size: a.system.size, full: a.system.full, owner: a.isOwner,
        segments: clockSegments(a.system.value, a.system.size)
      }));
    return { clocks, isGM: game.user.isGM, canCreate: game.user.can("ACTOR_CREATE") };
  }

  static async #onTick(event, target) {
    const actor = game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId);
    if ( !actor?.isOwner ) return;
    const n = Number(target.dataset.n);
    return actor.update({ "system.value": (n === actor.system.value) ? n - 1 : n });
  }

  static #onOpen(event, target) {
    return game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId)?.sheet.render({ force: true });
  }

  static async #onUnpin(event, target) {
    const actor = game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId);
    return actor?.update({ "system.pinned": false });
  }

  static async #onCreate() {
    const actor = await Actor.create({ name: t("DW.Clock.new"), type: "clock", system: { size: 4, pinned: true } });
    return actor?.sheet.render({ force: true });
  }
}

/* -------------------------------------------- */
/*  Faction ledger                              */
/* -------------------------------------------- */

export class FactionLedger extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dw-factions",
    classes: ["duskwall", "dw-panel", "dw-ledger"],
    position: { width: 760, height: 720 },
    window: { title: "DW.Faction.ledger", icon: "fa-solid fa-flag", resizable: true },
    actions: {
      status: FactionLedger.#onStatus,
      open: FactionLedger.#onOpen,
      import: FactionLedger.#onImport
    }
  };

  static PARTS = { body: { template: `${TEMPLATES}/apps/ledger.hbs`, scrollable: [".dw-ledger__cols"] } };

  static show() {
    const app = foundry.applications.instances.get("dw-factions") ?? new FactionLedger();
    return app.render({ force: true });
  }

  static refresh() {
    const app = foundry.applications.instances.get("dw-factions");
    if ( app?.rendered ) app.render();
  }

  async _prepareContext() {
    const factions = game.actors.filter(a => (a.type === "faction") && a.testUserPermission(game.user, "LIMITED"));
    const groups = Object.entries(DW.factionCategories).map(([key, label]) => ({
      key, label: t(label),
      factions: factions.filter(f => f.system.category === key).sort((a, b) => (b.system.tier - a.system.tier) || a.name.localeCompare(b.name))
        .map(f => ({
          id: f.id, name: f.name, tier: f.system.tierLabel, hold: f.system.hold === "strong" ? "S" : "W",
          status: f.system.status, statusLabel: (f.system.status > 0 ? "+" : "") + f.system.status,
          statusName: t(f.system.statusLabel), owner: f.isOwner, war: f.system.atWar
        }))
    })).filter(g => g.factions.length);
    const atWar = factions.filter(f => f.system.atWar).map(f => f.name);
    return { groups, isGM: game.user.isGM, empty: !factions.length, atWar };
  }

  static async #onStatus(event, target) {
    const actor = game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId);
    if ( !actor?.isOwner ) return;
    const step = Number(target.dataset.step);
    return actor.update({ "system.status": Math.max(-3, Math.min(3, actor.system.status + step)) });
  }

  static #onOpen(event, target) {
    return game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId)?.sheet.render({ force: true });
  }

  /** Bring the Doskvol factions into the world. */
  static async #onImport() {
    if ( !game.user.isGM ) return;
    const docs = await fetchFromPack("factions", () => true);
    const have = new Set(game.actors.filter(a => a.type === "faction").map(a => a.name));
    const folder = await Folder.create({ name: t("DW.Faction.folder"), type: "Actor", color: "#3a2b25" });
    const data = docs.filter(d => !have.has(d.name)).map(d => {
      const o = d.toObject();
      delete o._id;
      o.folder = folder.id;
      o.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
      return o;
    });
    await Actor.createDocuments(data);
    ui.notifications.info(t("DW.Faction.imported", { n: data.length }));
  }
}

/* -------------------------------------------- */
/*  Toolbar                                     */
/* -------------------------------------------- */

export class Toolbar extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dw-toolbar",
    classes: ["duskwall", "dw-toolbar"],
    window: { frame: false, positioned: false },
    actions: {
      clocks: () => ClocksPanel.toggle(),
      factions: () => FactionLedger.show(),
      fortune: () => Flows.fortuneRoll(),
      call: () => Flows.callForRoll(),
      crew: Toolbar.#onCrew,
      rules: Toolbar.#onRules,
      collapse: Toolbar.#onCollapse
    }
  };

  static PARTS = { body: { template: `${TEMPLATES}/apps/toolbar.hbs` } };

  #collapsed = false;

  async _prepareContext() {
    return { isGM: game.user.isGM, collapsed: this.#collapsed };
  }

  /** Mount the toolbar inside the UI's left column, under the scene controls. */
  _insertElement(element) {
    const host = document.getElementById("ui-left-column-1") ?? document.getElementById("ui-left") ?? document.body;
    const existing = document.getElementById(element.id);
    if ( existing ) existing.replaceWith(element);
    else host.append(element);
  }

  static #onCollapse() {
    this.#collapsed = !this.#collapsed;
    return this.render();
  }

  static #onCrew() {
    const mine = game.user.character?.system?.crew;
    const crew = mine ?? game.actors.find(a => a.type === "crew");
    if ( crew ) return crew.sheet.render({ force: true });
    ui.notifications.info(t("DW.Crew.none"));
  }

  static async #onRules() {
    const pack = game.packs.get(`${SYSTEM_ID}.rules`);
    const [entry] = pack ? await pack.getDocuments() : [];
    return entry?.sheet.render({ force: true });
  }
}
