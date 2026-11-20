/**
 * Editing arrays of small records on a sheet (friends, contacts, clocks…).
 * Inputs for list entries carry no `name`, so the sheet's form never submits them;
 * each has `data-list`, `data-index` and `data-prop`, and a change writes the array back.
 * @module duskwall/apps/list-editing
 */

/**
 * Bind list inputs within a rendered sheet.
 * @param {DocumentSheetV2} sheet
 */
export function activateListInputs(sheet) {
  for ( const input of sheet.element.querySelectorAll("[data-list][data-prop]") ) {
    if ( input.dataset.dwBound ) continue;
    input.dataset.dwBound = "1";
    input.addEventListener("change", async event => {
      event.stopPropagation();
      if ( !sheet.isEditable ) return;
      const { list, index, prop } = input.dataset;
      let value = (input.type === "checkbox") ? input.checked : input.value;
      if ( input.type === "number" ) value = Number(value) || 0;
      await updateListEntry(sheet.document, list, Number(index), { [prop]: value });
    });
  }
}

/** Read a list (dotted path under system) from source. */
function read(doc, list) {
  return foundry.utils.getProperty(doc.system.toObject(), list) ?? [];
}

/** The schema field for a list. */
function field(doc, list) {
  return list.split(".").reduce((f, k) => f?.fields?.[k] ?? f?.element?.fields?.[k], { fields: doc.system.schema.fields });
}

export async function updateListEntry(doc, list, index, changes) {
  const entries = read(doc, list);
  if ( !entries[index] ) return;
  Object.assign(entries[index], changes);
  return doc.update({ [`system.${list}`]: entries });
}

export async function addListEntry(doc, list, entry = {}) {
  const entries = read(doc, list);
  const blank = field(doc, list)?.element?.getInitialValue?.() ?? {};
  entries.push({ ...blank, ...entry });
  return doc.update({ [`system.${list}`]: entries });
}

export async function removeListEntry(doc, list, index) {
  const entries = read(doc, list);
  if ( !entries[index] ) return;
  entries.splice(index, 1);
  return doc.update({ [`system.${list}`]: entries });
}
