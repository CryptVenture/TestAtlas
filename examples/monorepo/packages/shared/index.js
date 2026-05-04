// packages/shared/index.js
//
// Shared validators used by both apps/web and apps/api. Demonstrates the
// "shared package" cross-cut: a domain that lives in packages/shared/ and is
// owned by the ROOT _testatlas/ workspace per the hybrid pattern.

/**
 * Validate an item shape: must have a non-empty `title` string and an
 * optional non-negative integer `quantity` (defaults to 1).
 *
 * @param {unknown} obj
 * @returns {boolean}
 */
export function validateItem(obj) {
  if (obj === null || typeof obj !== 'object') return false;
  const candidate = /** @type {{title?: unknown, quantity?: unknown}} */ (obj);
  if (typeof candidate.title !== 'string') return false;
  if (candidate.title.length === 0) return false;
  if (candidate.quantity !== undefined) {
    if (
      typeof candidate.quantity !== 'number' ||
      !Number.isInteger(candidate.quantity) ||
      candidate.quantity < 0
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Normalize an item: trim title, default quantity to 1.
 *
 * @param {{title: string, quantity?: number}} obj
 * @returns {{title: string, quantity: number}}
 */
export function normalizeItem(obj) {
  return {
    title: String(obj.title).trim(),
    quantity: typeof obj.quantity === 'number' ? obj.quantity : 1,
  };
}
