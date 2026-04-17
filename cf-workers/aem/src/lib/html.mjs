/**
 * Shared HTML helpers for worker injectors.
 */

/**
 * Formats a price value with its currency for display.
 *
 * @param {number} value
 * @param {string} currency
 * @returns {string}
 */
export function formatPrice(value, currency) {
  if (value == null || !currency) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}
