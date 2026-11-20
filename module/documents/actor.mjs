/**
 * The Actor document: scoundrels, crews, factions and clocks.
 * @module duskwall/documents/actor
 */

import DW, { SYSTEM_ID } from "../config.mjs";
import * as R from "../dice/rules.mjs";
import { clockImage } from "../data/faction.mjs";
import CrewData from "../data/crew.mjs";
import { postCard, t, esc } from "../helpers/chat.mjs";
import { promptForm } from "../dice/dialogs.mjs";

const PACK = name => game.packs.get(`${SYSTEM_ID}.${name}`);

export default class DWActor extends Actor {

  /* -------------------------------------------- */
  /*  Creation defaults                           */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    const changes = {};
    const img = data.img && (data.img !== Actor.DEFAULT_ICON) ? null : `systems/${SYSTEM_ID}/assets/icons/${this.type}.svg`;
    if ( img ) {
      changes.img = img;
      changes["prototypeToken.texture.src"] = img;
    }
    switch ( this.type ) {
      case "scoundrel":
        changes["prototypeToken.actorLink"] = true;
        changes["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
        break;
      case "crew":
        changes["prototypeToken.actorLink"] = true;
        // Everyone at the table keeps the crew sheet.
        if ( !data.ownership || (Object.keys(data.ownership).length <= 1) ) {
          changes["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
        if ( !data.system?.prison?.tiles?.length ) changes["system.prison"] = CrewData.prisonMap();
        break;
      case "faction":
        changes["prototypeToken.actorLink"] = true;
        break;
      case "clock": {
        const size = data.system?.size ?? 4;
        const value = data.system?.value ?? 0;
        changes.img = clockImage(size, value);
        changes["prototypeToken.texture.src"] = clockImage(size, value);
        changes["prototypeToken.actorLink"] = true;
        changes["prototypeToken.displayName"] = CONST.TOKEN_DISPLAY_MODES.ALWAYS;
        if ( !data.ownership || (Object.keys(data.ownership).length <= 1) ) {
          changes["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        }
        break;
      }
    }
    this.updateSource(changes);
  }

  /** @inheritdoc */
  async _preUpdate(changed, options, user) {
    if ( (await super._preUpdate(changed, options, user)) === false ) return false;
    // A clock's picture follows its state.
    if ( (this.type === "clock") && (("system" in changed) && (("size" in changed.system) || ("value" in changed.system))) ) {
      const size = changed.system.size ?? this.system.size;
      const value = Math.min(changed.system.value ?? this.system.value, size);
      const src = clockImage(size, value);
      const auto = this.img.includes("/assets/clocks/") || (this.img === Actor.DEFAULT_ICON);
      if ( auto ) {
        changed.img = src;
        foundry.utils.setProperty(changed, "prototypeToken.texture.src", src);
      }
    }
  }

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    // Keep placed clock tokens' pictures in step (only one client need do it).
    if ( (this.type === "clock") && changed.img && (game.user.id === userId) ) {
      for ( const token of this.getActiveTokens(false, true) ) {
        if ( token.texture?.src !== changed.img ) token.update({ "texture.src": changed.img });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Stress, trauma, xp, armor                   */
  /* -------------------------------------------- */

  /**
   * Take (or clear, if negative) stress. Overflow means trauma.
   * @param {number} amount
   * @param {object} [options]
   * @param {string} [options.reason]    For the chat note.
   * @param {boolean} [options.quiet]    Don't post a note for ordinary stress.
   * @returns {Promise<{value: number, trauma: boolean}>}
   */
  async addStress(amount, { reason = "", quiet = false } = {}) {
    if ( this.type !== "scoundrel" ) return null;
    const sys = this.system;
    const out = R.takeStress(sys.stress.value, amount, sys.stress.max);
    await this.update({ "system.stress.value": out.value });
    if ( out.trauma ) await this.sufferTrauma({ reason });
    else if ( !quiet && amount ) {
      const label = sys.labels.stress;
      await postCard({
        kind: "note",
        title: amount > 0
          ? t("DW.Stress.took", { name: this.name, n: amount, label })
          : t("DW.Stress.cleared", { name: this.name, n: -amount, label }),
        subtitle: reason ? esc(reason) : ""
      }, { actor: this });
    }
    return out;
  }

  /**
   * The stress track is full: mark a trauma condition, clear stress, leave the scene.
   * @param {object} [options]
   * @param {string} [options.reason]
   */
  async sufferTrauma({ reason = "" } = {}) {
    const sys = this.system;
    const available = sys.traumaList.filter(c => !sys.trauma.conditions.includes(c));
    const chosen = await promptForm({
      title: t("DW.Trauma.title", { name: this.name, label: sys.labels.trauma }),
      template: "trauma",
      icon: "fa-solid fa-heart-crack",
      ok: t("DW.Trauma.mark"),
      okIcon: "fa-solid fa-heart-crack",
      data: { name: this.name, label: sys.labels.trauma, conditions: available, reason, custom: true }
    });
    let condition = (chosen?.custom?.trim()) || chosen?.condition || available[0] || t("DW.Trauma.unnamed");
    const conditions = [...sys.trauma.conditions, condition];
    await this.update({
      "system.stress.value": 0,
      "system.trauma.conditions": conditions,
      "system.outOfAction": true
    });
    // Vampires live with their trauma maxed out; everyone else retires at the last box.
    const retire = (sys.spirit !== "vampire") && (conditions.length >= sys.trauma.max);
    await postCard({
      kind: "trauma",
      kicker: t("DW.Trauma.kicker", { label: sys.labels.trauma }),
      title: t("DW.Trauma.suffered", { name: this.name, condition }),
      lines: [t("DW.Trauma.out"), retire ? `<strong>${t("DW.Trauma.retire")}</strong>` : ""].filter(Boolean)
    }, { actor: this });
  }

  /**
   * Mark xp on a track; announce any advance.
   * @param {"insight"|"prowess"|"resolve"|"playbook"} track
   * @param {number} amount
   * @param {object} [options]
   * @param {boolean} [options.quiet]
   */
  async markXp(track, amount = 1, { quiet = false } = {}) {
    if ( this.type !== "scoundrel" ) return null;
    const max = this.system.xpMax[track];
    const out = R.markXp(this.system.xp[track], amount, max);
    await this.update({ [`system.xp.${track}`]: out.value });
    if ( out.advances ) {
      await postCard({
        kind: "advance",
        kicker: t("DW.Advance.kicker"),
        title: t("DW.Advance.title", { name: this.name }),
        subtitle: (track === "playbook") ? t("DW.Advance.playbook") : t("DW.Advance.attribute", { attr: t(DW.attributes[track].label) })
      }, { actor: this });
    } else if ( !quiet ) {
      ui.notifications.info(t("DW.Xp.marked", { name: this.name, n: amount, track: t(`DW.Xp.${track}`) }));
    }
    return out;
  }

  /**
   * Mark an armor box.
   * @param {"armor"|"heavy"|"special"} kind
   */
  async useArmor(kind) {
    if ( this.system.armor[kind] ) return false;
    await this.update({ [`system.armor.${kind}`]: true });
    await postCard({
      kind: "armor",
      title: t("DW.Armor.used", { name: this.name, armor: t(`DW.Armor.${kind}`) }),
      subtitle: t("DW.Armor.usedHint")
    }, { actor: this });
    return true;
  }

  /* -------------------------------------------- */
  /*  Playbook and crew type                      */
  /* -------------------------------------------- */

  /**
   * Adopt a playbook: its abilities, gear, friends and starting actions.
   * @param {Item} playbook    A playbook item (from a compendium or the world).
   */
  async applyPlaybook(playbook) {
    if ( this.type !== "scoundrel" ) return;
    const pb = playbook.system;
    const old = this.items.find(i => i.type === "playbook");
    const isSpirit = !!pb.spirit;
    const hadDots = Object.values(this.system.actions).some(v => v > 0);

    // What goes: the old playbook, its untaken abilities, its gear. Spirits keep only ghost abilities.
    const remove = [];
    if ( old ) remove.push(old.id);
    for ( const i of this.items ) {
      if ( (i.type === "ability") ) {
        const ghostly = /^Ghost /.test(i.name);
        if ( !i.system.taken ) remove.push(i.id);
        else if ( isSpirit && !ghostly && (i.system.playbook !== pb.key) ) remove.push(i.id);
      }
      if ( (i.type === "gear") && (i.system.playbook || (!pb.standardGear && i.system.standard)) ) remove.push(i.id);
    }
    if ( remove.length ) await this.deleteEmbeddedDocuments("Item", [...new Set(remove)]);

    const create = [playbook.toObject()];
    const have = new Set(this.items.map(i => `${i.type}:${i.name}`));
    const abilities = await fetchFromPack("abilities", d => d.system.playbook === pb.key);
    for ( const a of abilities ) if ( !have.has(`ability:${a.name}`) ) {
      const data = a.toObject();
      if ( data.system.starting ) data.system.taken = 1;
      create.push(data);
    }
    const gear = await fetchFromPack("gear", d => (d.system.playbook === (pb.spirit === "vampire" ? "vampire" : pb.key))
      || (pb.standardGear && d.system.standard));
    for ( const g of gear ) if ( !have.has(`gear:${g.name}`) ) create.push(g.toObject());
    for ( const c of create ) delete c._id;
    await this.createEmbeddedDocuments("Item", create);

    // Actions: new characters take the starting dots; spirits add theirs (to a maximum of 4).
    const update = {};
    if ( !hadDots || isSpirit ) {
      for ( const [k, v] of Object.entries(pb.startingActions ?? {}) ) {
        update[`system.actions.${k}`] = Math.min(4, (hadDots ? this.system.actions[k] : 0) + v);
      }
    }
    if ( !this.system.friends.length || old ) {
      update["system.friends"] = pb.friends.map(f => ({ ...f, relation: "" }));
    }
    if ( isSpirit ) {
      update["system.trauma.conditions"] = (pb.spirit === "vampire") ? [] : [];
      update["system.stress.value"] = 0;
    }
    if ( !this.img || this.img.includes("/assets/icons/scoundrel.svg") ) update.img = playbook.img;
    if ( Object.keys(update).length ) await this.update(update);
    ui.notifications.info(t("DW.Playbook.applied", { name: this.name, playbook: playbook.name }));
  }

  /**
   * Adopt a crew type: abilities, claims, upgrades, contacts and starting upgrades.
   * @param {Item} crewType
   */
  async applyCrewType(crewType) {
    if ( this.type !== "crew" ) return;
    const ct = crewType.system;
    const old = this.items.find(i => i.type === "crewType");
    const remove = [];
    if ( old ) remove.push(old.id);
    for ( const i of this.items ) if ( (i.type === "crewAbility") && !i.system.taken ) remove.push(i.id);
    if ( remove.length ) await this.deleteEmbeddedDocuments("Item", remove);

    const create = [crewType.toObject()];
    const have = new Set(this.items.map(i => `${i.type}:${i.name}`));
    const abilities = await fetchFromPack("crew-abilities", d => d.system.crewType === ct.key);
    for ( const a of abilities ) if ( !have.has(`crewAbility:${a.name}`) ) create.push(a.toObject());
    const start = ct.startingUpgrades ?? {};
    if ( start.cohort && !this.items.some(i => i.type === "cohort") ) {
      create.push({
        name: t("DW.Cohort.newGang", { type: start.cohort.type }), type: "cohort",
        img: `systems/${SYSTEM_ID}/assets/icons/cohort.svg`,
        system: { kind: start.cohort.kind, types: [start.cohort.type] }
      });
    }
    for ( const c of create ) delete c._id;
    await this.createEmbeddedDocuments("Item", create);

    const update = {
      "system.claims": foundry.utils.deepClone(ct.claims),
      "system.specialUpgrades": ct.upgrades.map(u => ({ ...u, value: 0 })),
      "system.contacts": ct.contacts.map(c => ({ ...c, relation: "" }))
    };
    if ( !old ) {
      for ( const [k, v] of Object.entries(start.training ?? {}) ) update[`system.upgrades.training.${k}`] = v;
      for ( const [k, v] of Object.entries(start.lair ?? {}) ) update[`system.upgrades.lair.${k}`] = v;
    }
    if ( !this.img || this.img.includes("/assets/icons/crew.svg") ) update.img = crewType.img;
    await this.update(update);
    ui.notifications.info(t("DW.CrewType.applied", { name: this.name, type: crewType.name }));
  }
}

/**
 * Fetch documents from one of the system's packs that pass a test.
 * @param {string} name
 * @param {(doc: object) => boolean} test
 * @returns {Promise<Document[]>}
 */
export async function fetchFromPack(name, test) {
  const pack = PACK(name);
  if ( !pack ) return [];
  const docs = await pack.getDocuments();
  return docs.filter(d => (d.documentName !== "Folder") && test(d)).sort((a, b) => a.sort - b.sort);
}
