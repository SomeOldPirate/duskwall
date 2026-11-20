/**
 * The crew: the scoundrels' gang, its lair, claims, cohorts and standing.
 * @module duskwall/data/crew
 */

import DW from "../config.mjs";
import { int, str, bool, html, people, clamp } from "./fields.mjs";

const fields = foundry.data.fields;

/** A claims map: fifteen tiles (or twelve, for prison) and the paths between them. */
function claimMap() {
  return new fields.SchemaField({
    tiles: new fields.ArrayField(new fields.SchemaField({
      name: str(),
      effect: str(),
      description: str(),
      held: bool(),
      turf: bool(),
      lair: bool(),
      auto: new fields.ObjectField({ initial: {} })
    })),
    links: new fields.ArrayField(new fields.ArrayField(new fields.NumberField({ integer: true })))
  });
}

/** Counts of the generic upgrades. */
function upgradeCounts() {
  const group = obj => new fields.SchemaField(Object.fromEntries(Object.entries(obj).map(([k, max]) => [k, int(0, 0, max)])));
  return new fields.SchemaField({
    lair: group({ ...DW.crewUpgrades.lair, vehicle: 2 }),
    training: group(DW.crewUpgrades.training),
    quality: group(DW.crewUpgrades.quality)
  });
}

export default class CrewData extends foundry.abstract.TypeDataModel {

  /** @inheritdoc */
  static defineSchema() {
    return {
      reputation: str(),
      lair: str(),
      lairDistrict: str(),
      huntingGrounds: str(),
      huntingOp: str(),
      deity: str(),
      deityFeatures: str(),
      tier: int(0, 0, 6),
      hold: new fields.StringField({ required: true, initial: "strong", choices: ["weak", "strong"] }),
      rep: int(0, 0, 12),
      heat: int(0, 0, 9),
      wanted: int(0, 0, 4),
      coin: int(2, 0, 16),
      xp: int(0, 0, 8),
      upgrades: upgradeCounts(),
      specialUpgrades: new fields.ArrayField(new fields.SchemaField({
        name: str(), description: str(), boxes: int(1, 1, 6), value: int(0, 0, 6),
        auto: new fields.ObjectField({ initial: {} })
      })),
      claims: claimMap(),
      prison: claimMap(),
      contacts: people(),
      vehicle: new fields.SchemaField({ name: str(), edges: str(), flaws: str() }),
      score: new fields.SchemaField({
        target: str(), targetTier: int(0, 0, 6), type: str(), location: str(),
        plan: str(), detail: str(), engagement: str()
      }),
      log: new fields.ArrayField(new fields.SchemaField({
        when: str(), target: str(), type: str(), coin: int(0, 0, 99), rep: int(0, 0, 99), heat: int(0, 0, 99), notes: str()
      })),
      downtimeOpen: bool(false),
      notes: html()
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(source) {
    // A crew begins with the prison claims map; older data may lack it.
    if ( source.prison && !source.prison.tiles?.length ) source.prison = CrewData.prisonMap();
    return super.migrateData(source);
  }

  /** The prison claims map, which every crew shares. */
  static prisonMap() {
    const t = (name, effect, extra = {}) => ({ name, effect, description: "", held: false, turf: false, lair: false, auto: {}, ...extra });
    return {
      tiles: [
        t("Parole Influence", "Your prison terms are one level shorter."),
        t("Smuggling", "+2 load while incarcerated."),
        t("Allied Claim", "Take a non-turf claim from a different crew type."),
        t("Cell Block Control", "You don’t take trauma from incarceration."),
        t("Guard Payoff", "Take +1d to incarceration rolls."),
        t("Prison", "", { held: true, lair: true }),
        t("Guard Payoff", "Take +1d to incarceration rolls."),
        t("Allied Claim", "Take a non-turf claim from a different crew type."),
        t("Hardcase", "-2 coin cost to advance Tier."),
        t("Smuggling", "+2 load while incarcerated."),
        t("Allied Claim", "Take a non-turf claim from a different crew type."),
        t("Allied Claim", "Take a non-turf claim from a different crew type.")
      ],
      links: [[0, 1], [1, 2], [4, 5], [5, 6], [6, 7], [8, 9], [9, 10], [10, 11],
        [0, 4], [1, 5], [2, 6], [3, 7], [4, 8], [5, 9], [6, 10], [7, 11]]
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareBaseData() {
    // Values other documents read while they prepare: compute them from source alone.
    const full = u => u.value >= u.boxes;
    const held = this.specialUpgrades.filter(full);
    this.pcStressBonus = held.reduce((n, u) => n + (Number(u.auto?.stress) || 0), 0);
    this.pcTraumaBonus = held.reduce((n, u) => n + (Number(u.auto?.trauma) || 0), 0);
    this.eliteTypes = new Set(held.filter(u => /^Elite /.test(u.name)).map(u => u.name.replace(/^Elite /, "")));
    this.mastery = this.upgrades.training.mastery >= 4;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    const actor = this.parent;
    this.crewType = actor.items.find(i => i.type === "crewType") ?? null;
    const tiles = this.claims.tiles;
    this.turf = Math.min(DW.turfMax, tiles.filter(t => t.held && t.turf).length);
    this.repMax = DW.repMax - this.turf;
    this.repFull = this.rep >= this.repMax;
    this.vaultMax = [4, 8, 16][this.upgrades.lair.vault] ?? 4;
    this.coin = clamp(this.coin, 0, this.vaultMax);
    this.tierLabel = DW.roman[this.tier] ?? String(this.tier);
    this.advanceCost = (this.tier + 1) * 8 - (this.claimHeld("Hardcase", "prison") ? 2 : 0);

    // War: any faction at -3 status.
    const factions = game.actors?.filter(a => a.type === "faction") ?? [];
    this.atWar = factions.some(f => f.system.status <= -3);
    this.effectiveHold = this.atWar ? "weak" : this.hold;

    // Held claim bonuses.
    const auto = tiles.filter(t => t.held && !t.lair).map(t => t.auto ?? {});
    this.bonus = {
      heatPerScore: auto.reduce((n, a) => n + (Number(a.heatPerScore) || 0), 0),
      repPerScore: auto.reduce((n, a) => n + (Number(a.repPerScore) || 0), 0),
      gatherInfo: auto.some(a => a.gatherInfo),
      healing: auto.some(a => a.healing),
      acquire: auto.some(a => a.acquire),
      reduceHeat: auto.some(a => a.reduceHeat),
      engagement: [...new Set(auto.flatMap(a => a.engagement ?? []))],
      income: tiles.filter(t => t.held && t.auto?.income).map(t => t.name)
    };
    this.members = game.actors?.filter(a => (a.type === "scoundrel") && (a.system.crewId === actor.id)) ?? [];
    this.wantedBoxes = Array.from({ length: DW.wantedMax }, (_, i) => i < this.wanted);
  }

  /**
   * Is a claim held?
   * @param {string} name
   * @param {"claims"|"prison"} [map]
   */
  claimHeld(name, map = "claims") {
    return this[map].tiles.some(t => t.held && (t.name === name));
  }

  /** Does the crew have a training upgrade for this xp track? */
  hasTraining(track) {
    return (this.upgrades.training[track === "playbook" ? "personal" : track] ?? 0) > 0;
  }

  /** The quality bonus the crew's upgrades give an item category. */
  qualityBonus(category) {
    return this.upgrades.quality[category] ?? 0;
  }
}
