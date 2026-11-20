/**
 * A scoundrel: one player character, on any playbook (spirits included).
 * @module duskwall/data/scoundrel
 */

import DW from "../config.mjs";
import { int, str, bool, html, people, clamp } from "./fields.mjs";

const fields = foundry.data.fields;

export default class ScoundrelData extends foundry.abstract.TypeDataModel {

  /** @inheritdoc */
  static defineSchema() {
    const actions = {};
    for ( const a of Object.keys(DW.actions) ) actions[a] = int(0, 0, 5);
    return {
      alias: str(),
      look: str(),
      heritage: str(),
      heritageDetail: str(),
      background: str(),
      backgroundDetail: str(),
      vice: str(),
      purveyor: str(),
      crewId: str(),
      actions: new fields.SchemaField(actions),
      xp: new fields.SchemaField({
        insight: int(0, 0, 20), prowess: int(0, 0, 20), resolve: int(0, 0, 20), playbook: int(0, 0, 20)
      }),
      stress: new fields.SchemaField({ value: int(0, 0, 30), bonus: int(0, -10, 10) }),
      trauma: new fields.SchemaField({ conditions: new fields.ArrayField(new fields.StringField()), bonus: int(0, -4, 4) }),
      harm: new fields.SchemaField({
        l1a: str(), l1b: str(), l2a: str(), l2b: str(), l3: str(), l4: str()
      }),
      healing: int(0, 0, 8),
      armor: new fields.SchemaField({ armor: bool(), heavy: bool(), special: bool() }),
      coin: int(0, 0, 4),
      stash: int(0, 0, 40),
      load: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "light", "normal", "heavy"] }),
      friends: people(),
      // Spirit playbooks: functions, frames, features, strictures…  key -> [chosen options]
      extras: new fields.ObjectField({ initial: {} }),
      // Vampire Dark Talent: the attribute whose actions may reach 5.
      darkTalent: str(),
      outOfAction: bool(),
      retired: bool(),
      downtime: new fields.SchemaField({
        used: int(0, 0, 10),
        trained: new fields.ArrayField(new fields.StringField())
      }),
      notes: html()
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    const actor = this.parent;
    const items = actor.items;
    const playbookItem = items.find(i => i.type === "playbook") ?? null;
    const pb = playbookItem?.system ?? null;
    this.playbook = playbookItem;
    this.spirit = pb?.spirit ?? "";

    const abilities = items.filter(i => i.type === "ability");
    const taken = abilities.filter(a => a.system.taken > 0);
    const autoSum = key => taken.reduce((n, a) => n + ((Number(a.system.auto?.[key]) || 0) * a.system.taken), 0);
    const crew = this.crew;
    const crewSys = crew?.system;

    // Labels and limits from the playbook.
    this.labels = {
      stress: pb?.stressLabel || "stress",
      trauma: pb?.traumaLabel || "trauma"
    };
    this.traumaList = DW.traumaConditions[pb?.traumaConditions || "standard"] ?? DW.traumaConditions.standard;

    // Stress and trauma.
    this.stress.max = Math.max(1, (pb?.stress ?? 9) + autoSum("stress") + (crewSys?.pcStressBonus ?? 0) + this.stress.bonus);
    this.stress.value = clamp(this.stress.value, 0, this.stress.max);
    this.trauma.max = Math.max(1, (pb?.trauma ?? 4) + (crewSys?.pcTraumaBonus ?? 0) + this.trauma.bonus);
    this.trauma.value = this.trauma.conditions.length;

    // Attributes: one die for each action with at least one dot.
    this.attributes = {};
    const masteryCap = crewSys?.mastery ? 4 : 3;
    for ( const [key, attr] of Object.entries(DW.attributes) ) {
      const rating = attr.actions.filter(a => this.actions[a] > 0).length;
      const cap = (this.darkTalent === key) ? 5 : Math.min(pb?.maxRating ?? 4, masteryCap);
      this.attributes[key] = {
        rating, cap,
        xpMax: pb?.attributeXp ?? 6,
        label: attr.label,
        actions: attr.actions
      };
    }
    this.xpMax = { playbook: pb?.playbookXp ?? 8 };
    for ( const k of Object.keys(DW.attributes) ) this.xpMax[k] = this.attributes[k].xpMax;
    this.lowestAttribute = Math.min(...Object.values(this.attributes).map(a => a.rating));

    // Load: playbook limits, or Mule-style overrides, plus bonuses.
    const base = foundry.utils.deepClone(pb?.load ?? { light: 3, normal: 5, heavy: 6 });
    for ( const a of taken ) {
      const l = a.system.auto?.load;
      if ( l ) for ( const k of ["light", "normal", "heavy"] ) base[k] = Math.max(base[k], Number(l[k]) || 0);
    }
    const bonus = autoSum("loadBonus");
    for ( const k of ["light", "normal", "heavy"] ) base[k] += bonus;
    this.loadLimits = base;
    const gear = items.filter(i => i.type === "gear");
    this.loadCarried = gear.filter(g => g.system.used).reduce((n, g) => n + g.system.load, 0);
    this.loadLimit = this.load ? base[this.load] : null;
    this.overloaded = (this.loadLimit !== null) && (this.loadCarried > this.loadLimit);

    // Healing.
    const healingMax = taken.find(a => a.system.auto?.healingMax)?.system.auto.healingMax;
    this.healingMax = healingMax ?? pb?.healing ?? 4;
    this.healing = clamp(this.healing, 0, this.healingMax);

    // Harm.
    const h = this.harm;
    this.harmLevel = h.l4 ? 4 : h.l3 ? 3 : (h.l2a || h.l2b) ? 2 : (h.l1a || h.l1b) ? 1 : 0;
    this.harmPenalty = {
      lessEffect: !!(h.l1a || h.l1b),
      minusDie: !!(h.l2a || h.l2b),
      needHelp: !!h.l3,
      dead: !!h.l4
    };

    this.hasSpecialArmor = taken.some(a => a.system.auto?.specialArmor);
    this.lifestyle = Math.floor(this.stash / 10);
    this.retirementLabel = DW.retirement.find(r => this.stash <= r.max)?.label ?? DW.retirement.at(-1).label;
    this.hasCoin = pb?.hasCoin ?? true;
    this.hasVice = pb?.hasVice ?? true;
    this.freeDowntime = (crewSys?.atWar ? 1 : 2);
  }

  /* -------------------------------------------- */

  /** The crew this scoundrel belongs to. */
  get crew() {
    const id = this.crewId;
    const actor = id ? game.actors?.get(id) : null;
    if ( actor?.type === "crew" ) return actor;
    // Fall back to the only crew in the world, if there is just one.
    const crews = game.actors?.filter(a => a.type === "crew") ?? [];
    return (crews.length === 1) ? crews[0] : null;
  }

  /**
   * The dice for an action, before bonuses.
   * @param {string} action
   */
  rating(action) {
    if ( action in DW.attributes ) return this.attributes[action].rating;
    return this.actions[action] ?? 0;
  }
}
