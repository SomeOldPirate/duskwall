/**
 * Factions and clocks.
 * @module duskwall/data/faction
 */

import DW from "../config.mjs";
import { int, str, bool, html, clamp } from "./fields.mjs";

const fields = foundry.data.fields;

export class FactionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new fields.StringField({ required: true, initial: "underworld", choices: Object.keys(DW.factionCategories) }),
      tier: int(1, 0, 6),
      hold: new fields.StringField({ required: true, initial: "strong", choices: ["weak", "strong"] }),
      status: int(0, -3, 3),
      turf: str(),
      notables: str(),
      assets: str(),
      allies: str(),
      enemies: str(),
      situation: str(),
      notes: html(),
      atWar: bool(false),
      clocks: new fields.ArrayField(new fields.SchemaField({
        name: str(), size: int(4, 2, 12), value: int(0, 0, 12)
      }))
    };
  }

  prepareDerivedData() {
    this.tierLabel = DW.roman[this.tier] ?? String(this.tier);
    this.statusLabel = DW.statusLabels[String(this.status)];
    this.atWar = this.status <= -3;
    for ( const c of this.clocks ) c.value = clamp(c.value, 0, c.size);
  }
}

export class ClockData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      size: new fields.NumberField({ required: true, integer: true, initial: 4, choices: DW.clockSizes }),
      value: int(0, 0, 12),
      kind: new fields.StringField({ required: true, initial: "progress", choices: Object.keys(DW.clockKinds) }),
      pinned: bool(true),
      // For tug-of-war and racing clocks: a clock this one is set against.
      rival: str(),
      description: html()
    };
  }

  prepareDerivedData() {
    this.value = clamp(this.value, 0, this.size);
    this.full = this.value >= this.size;
    this.image = clockImage(this.size, this.value);
  }
}

/**
 * The path of the image for a clock in a given state.
 * @param {number} size
 * @param {number} value
 */
export function clockImage(size, value) {
  const s = DW.clockSizes.includes(size) ? size : 4;
  return `systems/duskwall/assets/clocks/clock-${s}-${clamp(value, 0, s)}.svg`;
}
