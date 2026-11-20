/**
 * Chat cards: building, posting, and wiring up their buttons.
 * @module duskwall/helpers/chat
 */

import { SYSTEM_ID, TEMPLATES } from "../config.mjs";

const { renderTemplate } = foundry.applications.handlebars;
const CARD = `${TEMPLATES}/chat/card.hbs`;

/** Localise, with optional data. */
export const t = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

/** Escape user text before it goes into a card. */
export const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Card button handlers, registered by other modules: action -> async (message, card, button, event). */
const HANDLERS = new Map();

/**
 * Register a handler for a card button.
 * @param {string} action
 * @param {Function} fn
 */
export function onCardButton(action, fn) {
  HANDLERS.set(action, fn);
}

/**
 * Render and post a card.
 * @param {object} card                   Card data (see templates/chat/card.hbs).
 * @param {object} [options]
 * @param {Actor} [options.actor]
 * @param {Roll[]} [options.rolls]
 * @param {object} [options.flags]
 * @param {string[]} [options.whisper]
 * @param {boolean} [options.blind]
 * @returns {Promise<ChatMessage>}
 */
export async function postCard(card, { actor = null, rolls = [], flags = {}, whisper = [], blind = false } = {}) {
  const content = await renderCard(card, actor);
  const data = {
    content,
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
    flags: { [SYSTEM_ID]: { actorUuid: actor?.uuid ?? null, card, ...flags } }
  };
  if ( rolls.length ) {
    data.rolls = rolls;
    data.sound = CONFIG.sounds.dice;
  }
  if ( whisper.length ) data.whisper = whisper;
  if ( blind ) data.blind = true;
  return ChatMessage.create(data);
}

/** Render a card's HTML. */
export function renderCard(card, actor = null) {
  return renderTemplate(CARD, { img: actor?.img, actorName: actor?.name, ...card });
}

/**
 * Re-render a posted card with some of its data changed.
 * @param {ChatMessage} message
 * @param {object} changes
 * @param {object} [flags]
 */
export async function updateCard(message, changes, flags = {}) {
  const stored = message.getFlag(SYSTEM_ID, "card") ?? {};
  const card = { ...stored, ...changes };
  const actor = await actorOf(message);
  const content = await renderCard(card, actor);
  return message.update({ content, [`flags.${SYSTEM_ID}`]: { card, ...flags } });
}

/** The actor a card concerns. */
export async function actorOf(message) {
  const uuid = message.getFlag(SYSTEM_ID, "actorUuid");
  return uuid ? fromUuid(uuid) : null;
}

/** The character the current user plays, if any. */
export function myCharacter() {
  const c = game.user.character;
  if ( c?.type === "scoundrel" ) return c;
  const token = canvas?.tokens?.controlled?.find(t => t.actor?.type === "scoundrel" && t.actor.isOwner);
  if ( token ) return token.actor;
  if ( !game.user.isGM ) {
    const owned = game.actors.filter(a => (a.type === "scoundrel") && a.isOwner);
    if ( owned.length === 1 ) return owned[0];
  }
  return null;
}

/* -------------------------------------------- */
/*  Rendering hook                              */
/* -------------------------------------------- */

/**
 * Wire up a rendered chat message. V14 hands us a plain HTMLElement.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function onRenderChatMessage(message, html) {
  const el = html.querySelector?.(".dw-card");
  if ( !el ) return;
  html.classList.add("dw-message");
  const flags = message.flags?.[SYSTEM_ID] ?? {};
  const actor = flags.actorUuid ? fromUuidSync(flags.actorUuid) : null;
  if ( flags.spent?.length ) el.classList.add("is-resolved");

  for ( const button of el.querySelectorAll("[data-dw-action]") ) {
    const who = button.dataset.dwWho ?? "any";
    const action = button.dataset.dwAction;
    let allowed;
    switch ( who ) {
      case "gm": allowed = game.user.isGM; break;
      case "owner": allowed = !!actor?.isOwner; break;
      case "others": allowed = !actor?.isOwner && !!myCharacter(); break;
      case "target": allowed = game.user.isGM || (button.dataset.dwTarget
        ? !!fromUuidSync(button.dataset.dwTarget)?.isOwner : false); break;
      default: allowed = true;
    }
    const spent = (flags.spent ?? []).includes(button.dataset.dwKey ?? action);
    if ( !allowed || spent ) { button.remove(); continue; }
    button.addEventListener("click", event => onCardAction(event, message, actor));
  }
  for ( const bar of el.querySelectorAll(".dw-card__buttons") ) if ( !bar.children.length ) bar.remove();

  // Let card kinds decorate themselves (group actions list their participants, etc.).
  const deco = HANDLERS.get(`render:${flags.card?.kind}`);
  if ( deco ) deco(message, el, actor);
}

/**
 * Dispatch a click on a card button.
 * @param {PointerEvent} event
 * @param {ChatMessage} message
 * @param {Actor|null} actor
 */
async function onCardAction(event, message, actor) {
  event.preventDefault();
  const button = event.currentTarget;
  if ( button.disabled ) return;
  const fn = HANDLERS.get(button.dataset.dwAction);
  if ( !fn ) return;
  button.disabled = true;
  try {
    await fn({ message, actor, button, data: { ...button.dataset }, event });
  } catch ( err ) {
    console.error(err);
    ui.notifications.error(err.message);
  } finally {
    button.disabled = false;
  }
}

/**
 * Mark a button on a card as spent, so it no longer shows. Needs permission to update the message;
 * if the user lacks it, the button is only hidden locally.
 * @param {ChatMessage} message
 * @param {string} key
 */
export async function spendButton(message, key) {
  const spent = new Set(message.getFlag(SYSTEM_ID, "spent") ?? []);
  spent.add(key);
  if ( message.canUserModify(game.user, "update") ) {
    await message.setFlag(SYSTEM_ID, "spent", [...spent]);
  } else {
    for ( const b of document.querySelectorAll(`[data-message-id="${message.id}"] [data-dw-key="${key}"], [data-message-id="${message.id}"] [data-dw-action="${key}"]`) ) b.remove();
  }
}
