/**
 * Blades in the Dark for Foundry Virtual Tabletop (V14).
 * Scoundrels, crews, factions and clocks in the haunted city of Doskvol.
 *
 * Blades in the Dark is © John Harper / One Seven Design, and its text is used here under
 * the Creative Commons Attribution 3.0 Unported licence.
 * @module duskwall
 */

import DW, { SYSTEM_ID } from "./config.mjs";

import ScoundrelData from "./data/scoundrel.mjs";
import CrewData from "./data/crew.mjs";
import { FactionData, ClockData } from "./data/faction.mjs";
import { PlaybookData, AbilityData, GearData, CrewTypeData, CrewAbilityData, CohortData } from "./data/items.mjs";

import DWActor from "./documents/actor.mjs";

import ScoundrelSheet from "./apps/scoundrel-sheet.mjs";
import CrewSheet from "./apps/crew-sheet.mjs";
import { FactionSheet, ClockSheet } from "./apps/faction-sheet.mjs";
import DWItemSheet from "./apps/item-sheet.mjs";
import { ClocksPanel, FactionLedger, Toolbar } from "./apps/panels.mjs";

import * as Rules from "./dice/rules.mjs";
import * as Flows from "./dice/flows.mjs";
import * as Downtime from "./dice/downtime.mjs";
import * as Chat from "./helpers/chat.mjs";

/* -------------------------------------------- */
/*  Init                                        */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log("Duskwall | The city is dark. The ghosts are restless. Get to work.");

  CONFIG.DW = DW;
  game.duskwall = {
    DW,
    rules: Rules,
    roll: {
      action: (actor, preset) => Flows.actionRoll(actor ?? Chat.myCharacter(), preset),
      resist: (actor, preset) => Flows.resistRoll(actor ?? Chat.myCharacter(), preset),
      fortune: preset => Flows.fortuneRoll(preset),
      engagement: crew => Flows.engagementRoll(crew ?? game.actors.find(a => a.type === "crew")),
      callForRoll: () => Flows.callForRoll()
    },
    downtime: Downtime,
    apps: { ClocksPanel, FactionLedger, Toolbar },
    clocks: () => ClocksPanel.toggle(),
    factions: () => FactionLedger.show()
  };

  /* ---------- Documents ---------- */
  CONFIG.Actor.documentClass = DWActor;
  CONFIG.Actor.dataModels = { scoundrel: ScoundrelData, crew: CrewData, faction: FactionData, clock: ClockData };
  CONFIG.Item.dataModels = {
    playbook: PlaybookData, ability: AbilityData, gear: GearData,
    crewType: CrewTypeData, crewAbility: CrewAbilityData, cohort: CohortData
  };
  CONFIG.Actor.trackableAttributes = {
    scoundrel: { bar: ["stress"], value: ["coin", "stash"] },
    crew: { bar: [], value: ["heat", "wanted", "rep", "coin", "tier"] },
    faction: { bar: [], value: ["tier", "status"] },
    clock: { bar: [], value: ["value"] }
  };
  CONFIG.Combat.initiative = { formula: "1d6", decimals: 0 };

  /* ---------- Fonts ---------- */
  const fonts = `systems/${SYSTEM_ID}/assets/fonts`;
  CONFIG.fontDefinitions.Oswald = {
    editor: true,
    fonts: [
      { urls: [`${fonts}/oswald-latin-500-normal.woff2`], weight: 500 },
      { urls: [`${fonts}/oswald-latin-700-normal.woff2`], weight: 700 }
    ]
  };
  CONFIG.fontDefinitions["Crimson Pro"] = {
    editor: true,
    fonts: [
      { urls: [`${fonts}/crimson-pro-latin-400-normal.woff2`] },
      { urls: [`${fonts}/crimson-pro-latin-400-italic.woff2`], style: "italic" },
      { urls: [`${fonts}/crimson-pro-latin-600-normal.woff2`], weight: 600 },
      { urls: [`${fonts}/crimson-pro-latin-600-italic.woff2`], weight: 600, style: "italic" }
    ]
  };

  /* ---------- Sheets ---------- */
  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, ScoundrelSheet, { types: ["scoundrel"], makeDefault: true, label: "DW.SheetLabel.scoundrel" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, CrewSheet, { types: ["crew"], makeDefault: true, label: "DW.SheetLabel.crew" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, FactionSheet, { types: ["faction"], makeDefault: true, label: "DW.SheetLabel.faction" });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, ClockSheet, { types: ["clock"], makeDefault: true, label: "DW.SheetLabel.clock" });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, DWItemSheet, {
    types: ["playbook", "ability", "gear", "crewType", "crewAbility", "cohort"], makeDefault: true, label: "DW.SheetLabel.item"
  });

  /* ---------- Templates ---------- */
  foundry.applications.handlebars.loadTemplates([`systems/${SYSTEM_ID}/templates/chat/card.hbs`]);

  registerSettings();
  Flows.registerCardButtons();
  Downtime.registerDowntimeButtons();
});

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

function registerSettings() {
  game.settings.register(SYSTEM_ID, "toolbar", {
    name: "DW.Settings.toolbar.name", hint: "DW.Settings.toolbar.hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: on => on ? new Toolbar().render({ force: true }) : foundry.applications.instances.get("dw-toolbar")?.close()
  });
  game.settings.register(SYSTEM_ID, "clocksOnLoad", {
    name: "DW.Settings.clocksOnLoad.name", hint: "DW.Settings.clocksOnLoad.hint",
    scope: "client", config: true, type: Boolean, default: true
  });
}

/* -------------------------------------------- */
/*  Ready                                       */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  // Scoundrels read their crew's upgrades; crews may have been prepared after them.
  for ( const a of game.actors ) if ( a.type === "crew" ) a.reset();
  for ( const a of game.actors ) if ( a.type === "scoundrel" ) a.reset();
  if ( game.settings.get(SYSTEM_ID, "toolbar") ) new Toolbar().render({ force: true });
  const pinned = game.actors.some(a => (a.type === "clock") && a.system.pinned && a.testUserPermission(game.user, "OBSERVER"));
  if ( pinned && game.settings.get(SYSTEM_ID, "clocksOnLoad") ) ClocksPanel.instance.render({ force: true });
});

Hooks.once("diceSoNiceReady", dice3d => {
  dice3d.addSystem({ id: SYSTEM_ID, name: "Blades in the Dark" }, "preferred");
  dice3d.addColorset({
    name: "dw-ink", description: "Duskwall — Ink & Bone", category: "Blades in the Dark",
    foreground: "#e8e0cf", background: "#151413", outline: "#000000", edge: "#2a2724",
    texture: "none", material: "metal", font: "Oswald", visibility: "visible"
  }, "default");
  dice3d.addColorset({
    name: "dw-electroplasm", description: "Duskwall — Electroplasm", category: "Blades in the Dark",
    foreground: "#0b1a1f", background: "#6fe3e6", outline: "#c8ffff", edge: "#2a9fa6",
    texture: "none", material: "glass", font: "Oswald", visibility: "visible"
  }, "no");
});

/* -------------------------------------------- */
/*  Chat                                        */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", Chat.onRenderChatMessage);
Hooks.on("createChatMessage", Flows.onCreateChatMessage);

/* -------------------------------------------- */
/*  Keeping things in step                      */
/* -------------------------------------------- */

/** Re-render the sheets of a crew's scoundrels after the crew changes. */
function refreshMembers(crew) {
  for ( const m of game.actors.filter(a => (a.type === "scoundrel") && (a.system.crewId === crew.id || a.system.crew?.id === crew.id)) ) {
    m.reset();
    if ( m.sheet?.rendered ) m.sheet.render();
  }
}

function onActorChange(actor) {
  switch ( actor.type ) {
    case "clock": ClocksPanel.refresh(); break;
    case "faction":
      FactionLedger.refresh();
      for ( const c of game.actors.filter(a => a.type === "crew") ) { c.reset(); if ( c.sheet?.rendered ) c.sheet.render(); }
      break;
    case "crew": refreshMembers(actor); break;
    case "scoundrel":
      for ( const c of game.actors.filter(a => a.type === "crew") ) { c.reset(); if ( c.sheet?.rendered ) c.sheet.render(); }
      break;
  }
}
Hooks.on("createActor", onActorChange);
Hooks.on("updateActor", onActorChange);
Hooks.on("deleteActor", onActorChange);

// Sensible default pictures for new items.
Hooks.on("preCreateItem", (item, data) => {
  if ( data.img && (data.img !== Item.DEFAULT_ICON) ) return;
  const icon = { ability: "ability", crewAbility: "ability", gear: "gear", cohort: "cohort", playbook: "scoundrel", crewType: "crew" }[item.type];
  if ( icon ) item.updateSource({ img: `systems/${SYSTEM_ID}/assets/icons/${icon}.svg` });
});
