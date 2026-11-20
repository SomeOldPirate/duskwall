/**
 * One sheet for every item type, with a body per type.
 * @module duskwall/apps/item-sheet
 */

import DW, { TEMPLATES } from "../config.mjs";
import { t } from "../helpers/chat.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

export default class DWItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    classes: ["duskwall", "dw-sheet", "dw-item-sheet"],
    position: { width: 560, height: "auto" },
    window: { resizable: true, icon: "fa-solid fa-scroll" },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      toggleList: this.#onToggleList,
      setHarm: this.#onSetHarm
    }
  };

  /** @inheritdoc */
  static PARTS = {
    body: { template: `${TEMPLATES}/item/item.hbs`, scrollable: [""] }
  };

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const sys = item.system;
    const enrich = html => TextEditor.implementation.enrichHTML(html ?? "", { relativeTo: item, secrets: item.isOwner });
    Object.assign(context, {
      item, system: sys, fields: sys.schema.fields, editable: this.isEditable,
      type: item.type, typeLabel: t(`TYPES.Item.${item.type}`),
      enrichedDescription: await enrich(sys.description),
      [`is_${item.type}`]: true,
      categories: Object.entries(DW.qualityCategories).map(([k, v]) => ({ key: k, label: t(v), selected: sys.category === k })),
      playbooks: ["cutter", "hound", "leech", "lurk", "slide", "spider", "whisper", "ghost", "hull", "vampire"]
        .map(k => ({ key: k, label: t(`DW.Playbook.${k}`), selected: sys.playbook === k }))
    });
    if ( item.type === "cohort" ) {
      const types = sys.kind === "gang" ? Object.keys(DW.gangTypes) : [];
      Object.assign(context, {
        kinds: Object.entries(DW.cohortKinds).map(([k, v]) => ({ key: k, label: t(v), selected: sys.kind === k })),
        gangTypes: types.map(k => ({ key: k, label: t(DW.gangTypes[k]), on: sys.types.includes(k) })),
        expertType: sys.kind !== "gang" ? sys.types.join(", ") : "",
        edgeList: (sys.kind === "vehicle" ? DW.vehicleEdges : DW.edges).map(e => ({ key: e, on: sys.edges.includes(e) })),
        flawList: (sys.kind === "vehicle" ? DW.vehicleFlaws : DW.flaws).map(f => ({ key: f, on: sys.flaws.includes(f) })),
        harm: sys.harmBoxes.map(h => ({ ...h, label: t(h.label) }))
      });
    }
    if ( item.type === "playbook" ) {
      context.startingActions = Object.entries(sys.startingActions ?? {}).map(([k, v]) => `${t(`DW.Action.${k}`)} ${v}`).join(", ");
    }
    if ( item.type === "crewType" ) {
      context.upgradesList = (sys.upgrades ?? []).map(u => u.name).join(", ");
      context.claimsList = (sys.claims?.tiles ?? []).filter(c => !c.turf && !c.lair).map(c => c.name).join(", ");
    }
    return context;
  }

  /** @inheritdoc */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // The expert type is typed as text; a gang's types are toggled.
    if ( (this.document.type === "cohort") && ("expertType" in (data.system ?? {})) ) {
      data.system.types = String(data.system.expertType).split(",").map(s => s.trim()).filter(Boolean);
      delete data.system.expertType;
    }
    return data;
  }

  static async #onToggleList(event, target) {
    const { list, value } = target.dataset;
    const current = [...(this.document.system[list] ?? [])];
    const i = current.indexOf(value);
    if ( i >= 0 ) current.splice(i, 1);
    else {
      if ( (list === "types") && (current.length >= 2) ) current.shift();
      current.push(value);
    }
    return this.document.update({ [`system.${list}`]: current });
  }

  static async #onSetHarm(event, target) {
    const n = Number(target.dataset.n);
    return this.document.update({ "system.harm": (n === this.document.system.harm) ? n - 1 : n });
  }
}
