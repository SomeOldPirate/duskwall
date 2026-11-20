/**
 * Constants and rules tables for Blades in the Dark.
 * @module duskwall/config
 */

export const SYSTEM_ID = "duskwall";

/** Paths. */
export const PATH = `systems/${SYSTEM_ID}`;
export const TEMPLATES = `${PATH}/templates`;

const DW = {};

/** The three attributes and the actions beneath them, in sheet order. */
DW.attributes = {
  insight: { label: "DW.Attribute.insight", actions: ["hunt", "study", "survey", "tinker"] },
  prowess: { label: "DW.Attribute.prowess", actions: ["finesse", "prowl", "skirmish", "wreck"] },
  resolve: { label: "DW.Attribute.resolve", actions: ["attune", "command", "consort", "sway"] }
};

/** Action -> attribute. */
DW.actions = Object.fromEntries(Object.entries(DW.attributes)
  .flatMap(([attr, a]) => a.actions.map(action => [action, attr])));

DW.positions = {
  controlled: { label: "DW.Position.controlled", hint: "DW.Position.controlledHint" },
  risky: { label: "DW.Position.risky", hint: "DW.Position.riskyHint" },
  desperate: { label: "DW.Position.desperate", hint: "DW.Position.desperateHint" }
};

DW.effects = {
  zero: { label: "DW.Effect.zero" },
  limited: { label: "DW.Effect.limited" },
  standard: { label: "DW.Effect.standard" },
  great: { label: "DW.Effect.great" },
  extreme: { label: "DW.Effect.extreme" }
};
DW.effectOrder = ["zero", "limited", "standard", "great", "extreme"];

/** Result bands. */
DW.results = {
  critical: { label: "DW.Result.critical" },
  success: { label: "DW.Result.success" },
  partial: { label: "DW.Result.partial" },
  failure: { label: "DW.Result.failure" }
};

/** Plans and their detail. */
DW.plans = {
  assault: { label: "DW.Plan.assault", detail: "DW.Plan.assaultDetail" },
  deception: { label: "DW.Plan.deception", detail: "DW.Plan.deceptionDetail" },
  stealth: { label: "DW.Plan.stealth", detail: "DW.Plan.stealthDetail" },
  occult: { label: "DW.Plan.occult", detail: "DW.Plan.occultDetail" },
  social: { label: "DW.Plan.social", detail: "DW.Plan.socialDetail" },
  transport: { label: "DW.Plan.transport", detail: "DW.Plan.transportDetail" }
};

DW.heritages = ["Akoros", "The Dagger Isles", "Iruvia", "Severos", "Skovlan", "Tycheros"];
DW.backgrounds = ["Academic", "Labor", "Law", "Trade", "Military", "Noble", "Underworld"];
DW.vices = ["Faith", "Gambling", "Luxury", "Obligation", "Pleasure", "Stupor", "Weird"];

/** Trauma conditions, by the kind of creature that suffers them. */
DW.traumaConditions = {
  standard: ["Cold", "Haunted", "Obsessed", "Paranoid", "Reckless", "Soft", "Unstable", "Vicious"],
  gloom: ["Chaotic", "Destructive", "Furious", "Obsessive", "Territorial", "Savage"],
  wear: ["Clanking", "Leaking", "Fixated", "Smoking", "Sparking", "Unstable"],
  vampire: ["Cold", "Haunted", "Obsessed", "Paranoid", "Ruthless", "Secretive", "Unstable", "Vicious"]
};

DW.loadLevels = {
  light: { label: "DW.Load.light", hint: "DW.Load.lightHint" },
  normal: { label: "DW.Load.normal", hint: "DW.Load.normalHint" },
  heavy: { label: "DW.Load.heavy", hint: "DW.Load.heavyHint" }
};

/** Item quality categories, matched to the crew's quality upgrades. */
DW.qualityCategories = {
  documents: "DW.Quality.documents",
  gear: "DW.Quality.gear",
  implements: "DW.Quality.implements",
  supplies: "DW.Quality.supplies",
  tools: "DW.Quality.tools",
  weapons: "DW.Quality.weapons"
};

/** The generic crew upgrades: key -> boxes. */
DW.crewUpgrades = {
  lair: { carriage: 2, boat: 2, hidden: 1, quarters: 1, secure: 2, vault: 2, workshop: 1 },
  training: { insight: 1, prowess: 1, resolve: 1, personal: 1, mastery: 4 },
  quality: { documents: 1, gear: 1, implements: 1, supplies: 1, tools: 1, weapons: 1 }
};

DW.cohortKinds = { gang: "DW.Cohort.gang", expert: "DW.Cohort.expert" };
DW.gangTypes = {
  Adepts: "DW.Cohort.adepts", Rooks: "DW.Cohort.rooks", Rovers: "DW.Cohort.rovers",
  Skulks: "DW.Cohort.skulks", Thugs: "DW.Cohort.thugs"
};
DW.edges = ["Fearsome", "Independent", "Loyal", "Tenacious"];
DW.flaws = ["Principled", "Savage", "Unreliable", "Wild"];
DW.vehicleEdges = ["Nimble", "Simple", "Sturdy"];
DW.vehicleFlaws = ["Costly", "Distinct", "Finicky"];
DW.cohortHarm = ["DW.Cohort.harm0", "DW.Cohort.harm1", "DW.Cohort.harm2", "DW.Cohort.harm3", "DW.Cohort.harm4"];

/** Gang scale by Tier. */
DW.gangScale = ["DW.Scale.0", "DW.Scale.1", "DW.Scale.2", "DW.Scale.3", "DW.Scale.4", "DW.Scale.5", "DW.Scale.6"];

DW.reputations = ["Ambitious", "Brutal", "Daring", "Honorable", "Professional", "Savvy", "Subtle", "Strange"];

DW.factionCategories = {
  underworld: "DW.Faction.underworld",
  institutions: "DW.Faction.institutions",
  labor: "DW.Faction.labor",
  citizenry: "DW.Faction.citizenry",
  fringe: "DW.Faction.fringe",
  other: "DW.Faction.other"
};
DW.statusLabels = {
  "3": "DW.Status.allies", "2": "DW.Status.friendly", "1": "DW.Status.helpful", "0": "DW.Status.neutral",
  "-1": "DW.Status.interfering", "-2": "DW.Status.hostile", "-3": "DW.Status.war"
};

DW.clockSizes = [4, 6, 8, 10, 12];
DW.clockKinds = {
  progress: "DW.Clock.progress",
  danger: "DW.Clock.danger",
  racing: "DW.Clock.racing",
  tugofwar: "DW.Clock.tugofwar",
  project: "DW.Clock.project",
  faction: "DW.Clock.faction"
};

/** Payoff options. */
DW.payoffCoin = [
  { coin: 2, label: "DW.Payoff.coin2" }, { coin: 4, label: "DW.Payoff.coin4" }, { coin: 6, label: "DW.Payoff.coin6" },
  { coin: 8, label: "DW.Payoff.coin8" }, { coin: 10, label: "DW.Payoff.coin10" }
];
DW.heatBase = [
  { heat: 0, label: "DW.Heat.base0" }, { heat: 2, label: "DW.Heat.base2" },
  { heat: 4, label: "DW.Heat.base4" }, { heat: 6, label: "DW.Heat.base6" }
];

/** Entanglements by heat band (low 0-3, mid 4/5, high 6+) and result. */
DW.entanglementTable = {
  low: { failure: ["gangTrouble", "usualSuspects"], partial: ["rivals", "unquietDead"], success: ["cooperation"] },
  mid: { failure: ["gangTrouble", "questioning"], partial: ["reprisals", "unquietDead"], success: ["showOfForce"] },
  high: { failure: ["flipped", "interrogation"], partial: ["demonicNotice", "showOfForce"], success: ["arrest"] }
};
DW.entanglements = ["arrest", "cooperation", "demonicNotice", "flipped", "gangTrouble", "interrogation",
  "questioning", "reprisals", "rivals", "showOfForce", "unquietDead", "usualSuspects"];

DW.downtime = {
  acquire: { label: "DW.Downtime.acquire", icon: "fa-solid fa-box-open" },
  project: { label: "DW.Downtime.project", icon: "fa-solid fa-hourglass-half" },
  recover: { label: "DW.Downtime.recover", icon: "fa-solid fa-kit-medical" },
  heat: { label: "DW.Downtime.heat", icon: "fa-solid fa-temperature-arrow-down" },
  train: { label: "DW.Downtime.train", icon: "fa-solid fa-dumbbell" },
  vice: { label: "DW.Downtime.vice", icon: "fa-solid fa-wine-bottle" }
};
DW.overindulge = ["attractTrouble", "brag", "lost", "tapped"];

/** Segments ticked by a downtime result (project, recover, reduce heat). */
DW.downtimeTicks = { failure: 1, partial: 2, success: 3, critical: 5 };

/** Lifestyle from stash. */
DW.retirement = [
  { max: 10, label: "DW.Stash.poor" }, { max: 20, label: "DW.Stash.meager" },
  { max: 39, label: "DW.Stash.modest" }, { max: 40, label: "DW.Stash.fine" }
];

/** The xp an advance costs is the length of the track. */
DW.crewXpMax = 8;
DW.maxStash = 40;
DW.maxCoin = 4;
DW.heatMax = 9;
DW.wantedMax = 4;
DW.repMax = 12;
DW.turfMax = 6;

DW.roman = ["0", "I", "II", "III", "IV", "V", "VI"];

export default DW;
