/**
 * Behaviour every Duskwall sheet shares: embedded item controls and posting text to chat.
 * @module duskwall/apps/sheet-mixin
 */

import { postCard, t, esc } from "../helpers/chat.mjs";

const { TextEditor } = foundry.applications.ux;

/**
 * @param {typeof foundry.applications.api.DocumentSheetV2} Base
 */
export function DWSheetMixin(Base) {
  return class DWSheet extends Base {

    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
      actions: {
        itemEdit: DWSheet.#onItemEdit,
        itemDelete: DWSheet.#onItemDelete,
        itemCreate: DWSheet.#onItemCreate,
        itemPost: DWSheet.#onItemPost,
        openActor: DWSheet.#onOpenActor
      }
    };

    /** The embedded item a control belongs to. */
    _itemFor(target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.document.items?.get(id) ?? null;
    }

    static #onItemEdit(event, target) {
      return this._itemFor(target)?.sheet.render({ force: true });
    }

    static async #onItemDelete(event, target) {
      return this._itemFor(target)?.deleteDialog();
    }

    static async #onItemCreate(event, target) {
      const type = target.dataset.type;
      const [item] = await this.document.createEmbeddedDocuments("Item", [{
        name: t(`DW.New.${type}`), type, system: target.dataset.kind ? { kind: target.dataset.kind } : {}
      }]);
      return item?.sheet.render({ force: true });
    }

    /** Show an item's rules in chat. */
    static async #onItemPost(event, target) {
      const item = this._itemFor(target);
      if ( !item ) return;
      const body = [item.system.rules ? `<p><strong>${esc(item.system.rules)}</strong></p>` : "", item.system.description ?? ""].join("");
      return postCard({
        kind: "item", kicker: t(`TYPES.Item.${item.type}`), title: esc(item.name),
        body: await TextEditor.implementation.enrichHTML(body, { relativeTo: item })
      }, { actor: this.document.documentName === "Actor" ? this.document : null });
    }

    static #onOpenActor(event, target) {
      const id = target.closest("[data-actor-id]")?.dataset.actorId;
      return game.actors.get(id)?.sheet.render({ force: true });
    }
  };
}
