# Blades in the Dark — Duskwall

**Install:** in Foundry's *Install System* dialog, paste this manifest URL:

```
https://github.com/SomeOldPirate/duskwall/releases/latest/download/system.json
```

An unofficial Foundry VTT **V14** system for *Blades in the Dark*, built around the paper playbooks: ink-black bars on grey paper, the abilities in the middle, the actions down the right. System id: `duskwall`.

## Getting started

1. Create a **Crew** actor and drag a crew type onto it from the *Crew Types* compendium. You get the crew's abilities, claims map, upgrades, contacts and starting upgrades (and a starting cohort for Bravos and Cult).
2. Create a **Scoundrel** for each player and drag a playbook onto it from *Playbooks*. You get the playbook's special abilities, items, friends and starting action dots. Choose the crew in the sheet header (or drop the scoundrel on the crew sheet).
3. Open the **Factions** panel from the toolbar (under the scene controls) and click *Import the factions of Doskvol*.

## At the table

- **Action rolls**: click an action name. The dialog takes position, effect, assistance (the helper's stress is applied), push or Devil's Bargain (+1d, 2 stress applied, or special armor), push for +1 effect, and harm penalties. Zero dice rolls two and keeps the lowest. Desperate rolls mark attribute xp automatically.
- **The GM sets the stakes**: *Call for a roll* (toolbar, GM only) posts a card with position and effect locked; the player clicks *Roll*.
- **Consequences**: roll cards carry *Resist* (6 − highest die in stress, a critical clears 1), *Armor*, and *Protect* (another player's scoundrel resists in your place). Overflowing stress opens the trauma picker; the fourth trauma calls for retirement.
- **Group actions**: tick *Lead a group action*; others click *Join the group*; the leader settles it (best result for all, 1 stress per failure).
- **Gather information**: click a question on the sheet to roll with it as the goal.
- **Flashbacks**: pay 0–3 stress and post the flashback; roll from the card if it's challenging.
- **Load**: pick light/normal/heavy on the *Load* tab, then tick items as you reveal them. Mule and Compartments change the limits.
- **Clocks**: Clock actors show on the clocks panel and as tokens whose picture follows the clock.

## The score and after

The crew sheet's *Score & Downtime* tab walks the order of play: target and plan → **Engagement roll** (claims that help a plan add their die) → **Payoff & heat** (rep by Tier difference, quiet jobs, No Traces, tithes, vault overflow to stashes; heat modifiers, Crow's Veil, claims, wanted level roll-over) → **Entanglements** (wanted level dice read on the heat column) → **Downtime** (GM: armor back, cohorts mend, income claims). Scoundrels take downtime activities from their sheets: acquire asset, long-term project (with project clocks), recover (healing clock and harm step-down), reduce heat, train (crew training doubles it, once per track), indulge vice (overindulgence choices). Extra activities cost coin or rep; spend coin after a roll to raise the result.

Development (weak hold → strong; strong → pay Tier×8 coin) is a button on the rep track when it fills. End-of-session xp dialogs exist for scoundrels and the crew; a crew advance pays each scoundrel Tier+2 stash.

## Compendia

Playbooks (seven scoundrels plus Ghost, Hull and Vampire), special abilities with the book's explanations, items, crew types with their claims maps, crew abilities, the factions of Doskvol, and a rules reference journal. Sources are in `packs/_source`; rebuild with `node tools/build-packs.mjs` (needs `@foundryvtt/foundryvtt-cli`).

## Releasing

Bump `version` in `system.json`, add a section to `CHANGELOG.md` and push. Then on GitHub, draft a new release with a matching tag (`v0.9.1`) and publish it: the workflow builds `duskwall.zip` and attaches it and `system.json` to the release, with the changelog section as its notes. `bash tools/package.sh` builds the same zip locally in `dist/`. `tools/content.py` regenerates the sources from the text extracted from the rulebook.

## Licence

*Blades in the Dark* is © John Harper / One Seven Design, and this work is based on it, used under the [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/) licence. This is an unofficial fan implementation, not affiliated with or endorsed by One Seven Design or Evil Hat Productions. Fonts: Oswald and Crimson Pro (SIL Open Font Licence).
