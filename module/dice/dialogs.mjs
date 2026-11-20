/**
 * A thin wrapper round DialogV2 for the system's forms.
 * @module duskwall/dice/dialogs
 */

import { TEMPLATES } from "../config.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;
const { FormDataExtended } = foundry.applications.ux;

/**
 * Show a form and resolve with its data, or null if dismissed.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.template        Path under templates/dialog/, without extension.
 * @param {object} [options.data]          Template data.
 * @param {string} [options.icon]
 * @param {string} [options.ok]            Label for the confirm button.
 * @param {string} [options.okIcon]
 * @param {number} [options.width]
 * @param {Function} [options.onRender]    (form: HTMLFormElement) => void, to wire live summaries.
 * @param {string[]} [options.classes]
 * @returns {Promise<object|null>}
 */
export async function promptForm({ title, template, data = {}, icon = "fa-solid fa-dice-d6", ok, okIcon = "fa-solid fa-dice-d6",
  width = 480, onRender, classes = [] }) {
  const content = await renderTemplate(`${TEMPLATES}/dialog/${template}.hbs`, data);
  return DialogV2.wait({
    window: { title, icon },
    classes: ["duskwall", "dw-dialog", `dw-dialog--${template}`, ...classes],
    position: { width },
    content,
    buttons: [{
      action: "ok",
      label: ok ?? game.i18n.localize("DW.Roll.roll"),
      icon: okIcon,
      default: true,
      callback: (event, button) => new FormDataExtended(button.form).object
    }],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      if ( form && onRender ) onRender(form);
    },
    rejectClose: false
  });
}

/**
 * Ask a yes/no question.
 * @param {string} title
 * @param {string} content   HTML.
 */
export function confirm(title, content) {
  return DialogV2.confirm({ window: { title }, content, classes: ["duskwall", "dw-dialog"], rejectClose: false });
}

/**
 * Bind a live summary to a form: calls fn(data) on every change and writes its result into [data-summary].
 * @param {HTMLFormElement} form
 * @param {(data: object) => string} fn
 */
export function liveSummary(form, fn) {
  const out = form.querySelector("[data-summary]");
  const refresh = () => {
    const data = new FormDataExtended(form).object;
    if ( out ) out.innerHTML = fn(data, form);
  };
  form.addEventListener("change", refresh);
  form.addEventListener("input", refresh);
  refresh();
}
