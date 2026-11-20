/**
 * Item models: playbooks, special abilities, gear, crew types, crew abilities and cohorts.
 * @module duskwall/data/items
 */

import DW from "../config.mjs";
import { int, str, bool, html, strings, clamp } from "./fields.mjs";

const fields = foundry.data.fields;

/* -------------------------------------------- */
/*  Playbook                                    */
/* -------------------------------------------- */

export class PlaybookData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      key: str(),
      spirit: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "ghost", "hull", "vampire"] }),
      tagline: str(),
      description: html(),
      need: str(),
      xpTriggers: strings(),
      startingActions: new fields.ObjectField({ initial: {} }),
      friendsLabel: str("Friends"),
      friends: new fields.ArrayField(new fields.SchemaField({ name: str(), role: str() })),
      gatherInfo: strings(),
      abilities: strings(),
      gear: strings(),
      standardGear: bool(true),
      stress: int(9, 1, 20),
      trauma: int(4, 1, 8),
      playbookXp: int(8, 1, 20),
      attributeXp: int(6, 1, 20),
      maxRating: int(4, 1, 5),
      load: new fields.SchemaField({ light: int(3), normal: int(5), heavy: int(6) }),
      healing: int(4, 1, 8),
      hasCoin: bool(true),
      hasVice: bool(true),
      stressLabel: str("stress"),
      traumaLabel: str("trauma"),
      traumaConditions: str("standard"),
      extras: new fields.ArrayField(new fields.ObjectField())
    };
  }
}

/* -------------------------------------------- */
/*  Special ability                             */
/* -------------------------------------------- */

export class AbilityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      playbook: str(),
      rules: str(),
      description: html(),
      max: int(1, 1, 6),
      taken: int(0, 0, 6),
      starting: bool(false),
      // Automation hints: {stress, load:{light,normal,heavy}, loadBonus, healingMax, specialArmor}.
      auto: new fields.ObjectField({ initial: {} })
    };
  }

  prepareDerivedData() {
    this.taken = clamp(this.taken, 0, this.max);
    this.isTaken = this.taken > 0;
    this.boxes = Array.from({ length: this.max }, (_, i) => ({ n: i + 1, on: i < this.taken }));
  }
}

/* -------------------------------------------- */
/*  Gear                                        */
/* -------------------------------------------- */

export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      playbook: str(),
      description: html(),
      load: int(1, 0, 6),
      category: str(),
      standard: bool(false),
      // Carried on the current score.
      used: bool(false),
      // Bandoliers and the like.
      uses: int(0, 0, 10),
      maxUses: int(0, 0, 10)
    };
  }

  prepareDerivedData() {
    this.boxes = Array.from({ length: Math.max(1, this.load) }, (_, i) => i);
    this.weightless = this.load === 0;
    this.useBoxes = Array.from({ length: this.maxUses }, (_, i) => ({ n: i + 1, on: i < this.uses }));
  }
}

/* -------------------------------------------- */
/*  Crew type                                   */
/* -------------------------------------------- */

export class CrewTypeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      key: str(),
      tagline: str(),
      description: html(),
      xpTriggers: strings(),
      huntingGroundsLabel: str("Hunting Grounds"),
      huntingGrounds: new fields.ArrayField(new fields.SchemaField({ name: str(), description: str() })),
      contacts: new fields.ArrayField(new fields.SchemaField({ name: str(), role: str() })),
      startingUpgrades: new fields.ObjectField({ initial: {} }),
      claims: new fields.ObjectField({ initial: { tiles: [], links: [] } }),
      upgrades: new fields.ArrayField(new fields.ObjectField()),
      abilities: strings(),
      deity: bool(false),
      vehicle: bool(false)
    };
  }
}

/* -------------------------------------------- */
/*  Crew ability                                */
/* -------------------------------------------- */

export class CrewAbilityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      crewType: str(),
      rules: str(),
      description: html(),
      max: int(1, 1, 6),
      taken: int(0, 0, 6)
    };
  }

  prepareDerivedData() {
    this.taken = clamp(this.taken, 0, this.max);
    this.isTaken = this.taken > 0;
    this.boxes = Array.from({ length: this.max }, (_, i) => ({ n: i + 1, on: i < this.taken }));
  }
}

/* -------------------------------------------- */
/*  Cohort                                      */
/* -------------------------------------------- */

export class CohortData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new fields.StringField({ required: true, initial: "gang", choices: ["gang", "expert", "vehicle"] }),
      types: strings(),
      harm: int(0, 0, 4),
      armor: bool(false),
      armorUsed: bool(false),
      edges: strings(),
      flaws: strings(),
      description: html()
    };
  }

  /** @inheritdoc */
  prepareDerivedData() {
    const crew = this.parent?.parent;
    const tier = (crew?.type === "crew") ? crew.system.tier : 0;
    const elite = (crew?.type === "crew") ? crew.system.eliteTypes : new Set();
    this.quality = Math.max(0, tier + ((this.kind === "expert") ? 1 : 0));
    this.scale = (this.kind === "gang") ? tier : 0;
    this.scaleLabel = DW.gangScale[this.scale] ?? "";
    // Harm: 1 weakened (less effect), 2 impaired (-1d), 3 broken (can't act), 4 dead.
    this.impaired = this.harm >= 2;
    this.broken = this.harm >= 3;
    this.dead = this.harm >= 4;
    this.elite = this.types.some(t => elite.has(t));
    this.pool = Math.max(0, this.quality + (this.elite ? 1 : 0) - (this.impaired ? 1 : 0));
    this.harmBoxes = [1, 2, 3, 4].map(n => ({ n, on: this.harm >= n, label: DW.cohortHarm[n] }));
  }
}
