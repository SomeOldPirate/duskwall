/**
 * Faction and clock sheets.
 * @module duskwall/apps/faction-sheet
 */

import DW, { TEMPLATES } from "../config.mjs";
import { t } from "../helpers/chat.mjs";
import { activateListInputs, addListEntry, removeListEntry } from "./list-editing.mjs";
import { DWSheetMixin } from "./sheet-mixin.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

/** SVG wedge paths for a clock. */
export function clockSegments(value, size, r = 44) {
  const cx = 50, cy = 50;
  return Array.from({ length: size }, (_, i) => {
    const a0 = (i / size) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / size) * 2 * Math.PI - Math.PI / 2;
    const p = a => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    return { n: i + 1, on: i < value, d: `M${cx},${cy} L${p(a0)} A${r},${r} 0 0,1 ${p(a1)} Z` };
  });
}

export class FactionSheet extends DWSheetMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: ["duskwall", "dw-sheet", "dw-faction"],
    position: { width: 620, height: 760 },
    window: { resizable: true, icon: "fa-solid fa-flag" },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      setTier: this.#onSetTier,
      setHold: this.#onSetHold,
      setStatus: this.#onSetStatus,
      clockAdd: this.#onClockAdd,
      clockRemove: this.#onClockRemove,
      clockTick: this.#onClockTick
    }
  };

  static PARTS = { body: { template: `${TEMPLATES}/actor/faction.hbs`, scrollable: [""] } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    Object.assign(context, {
      actor, system: sys, fields: sys.schema.fields, editable: this.isEditable, isGM: game.user.isGM,
      categories: Object.entries(DW.factionCategories).map(([k, v]) => ({ key: k, label: t(v), selected: sys.category === k })),
      tiers: [0, 1, 2, 3, 4, 5, 6].map(n => ({ n, label: DW.roman[n], on: n === sys.tier })),
      statuses: [-3, -2, -1, 0, 1, 2, 3].map(n => ({ n, label: (n > 0 ? `+${n}` : String(n)), on: n === sys.status,
        name: t(DW.statusLabels[String(n)]) })),
      statusName: t(sys.statusLabel),
      clocks: sys.clocks.map((c, index) => ({ ...c, index, segments: clockSegments(c.value, c.size) })),
      clockSizes: DW.clockSizes,
      enrichedNotes: await TextEditor.implementation.enrichHTML(sys.notes, { relativeTo: actor, secrets: actor.isOwner })
    });
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.dataset.status = String(this.document.system.status);
    activateListInputs(this);
  }

  static async #onSetTier(event, target) { return this.document.update({ "system.tier": Number(target.dataset.n) }); }
  static async #onSetHold() {
    return this.document.update({ "system.hold": this.document.system.hold === "strong" ? "weak" : "strong" });
  }
  static async #onSetStatus(event, target) { return this.document.update({ "system.status": Number(target.dataset.n) }); }
  static async #onClockAdd() { return addListEntry(this.document, "clocks", { name: t("DW.Clock.new"), size: 8, value: 0 }); }
  static async #onClockRemove(event, target) { return removeListEntry(this.document, "clocks", Number(target.dataset.index)); }
  static async #onClockTick(event, target) {
    const index = Number(target.dataset.index);
    const n = Number(target.dataset.n);
    const list = this.document.system.toObject().clocks;
    if ( !list[index] ) return;
    list[index].value = (n === list[index].value) ? n - 1 : n;
    return this.document.update({ "system.clocks": list });
  }
}

export class ClockSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["duskwall", "dw-sheet", "dw-clock-sheet"],
    position: { width: 380, height: "auto" },
    window: { resizable: false, icon: "fa-solid fa-clock" },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { tick: this.#onTick, step: this.#onStep }
  };

  static PARTS = { body: { template: `${TEMPLATES}/actor/clock.hbs` } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    Object.assign(context, {
      actor, system: sys, fields: sys.schema.fields, editable: this.isEditable,
      segments: clockSegments(sys.value, sys.size),
      sizes: DW.clockSizes.map(s => ({ s, selected: s === sys.size })),
      kinds: Object.entries(DW.clockKinds).map(([k, v]) => ({ key: k, label: t(v), selected: sys.kind === k })),
      enrichedDescription: await TextEditor.implementation.enrichHTML(sys.description, { relativeTo: actor })
    });
    return context;
  }

  static async #onTick(event, target) {
    const n = Number(target.dataset.n);
    return this.document.update({ "system.value": (n === this.document.system.value) ? n - 1 : n });
  }

  static async #onStep(event, target) {
    const v = this.document.system.value + Number(target.dataset.step);
    return this.document.update({ "system.value": Math.max(0, Math.min(this.document.system.size, v)) });
  }
}
