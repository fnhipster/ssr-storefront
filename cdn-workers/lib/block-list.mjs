/**
 * Block List Library
 *
 * Renders a titled list of cards into AEM block rows. The pattern is used by
 * any injector that populates a block with a heading and a collection of
 * linked items (product cards, article teasers, etc.).
 *
 * Output structure (two AEM block rows):
 *
 *   ['Title',    '<h2>Category Name</h2>']
 *   ['Products', '<ul><li>…card…</li></ul><p>Showing 8 of 24</p>']
 *
 * Usage:
 *
 *   import { buildCardHtml, buildCardListRows } from '../lib/block-list.mjs';
 *
 *   // Use the default card renderer
 *   const rows = buildCardListRows('Women', cards, { totalCount: 48 });
 *
 *   // Bring your own card renderer
 *   const rows = buildCardListRows('Women', cards, {
 *     totalCount: 48,
 *     renderCard: (item) => `<article>…${item.name}…</article>`,
 *   });
 */

import { escapeHtml } from './template.mjs';

// ---------------------------------------------------------------------------
// Default card renderer
// ---------------------------------------------------------------------------

/**
 * Renders a single card as a linked image + name with an optional price.
 * Markup is intentionally minimal — no layout wrappers or rendering hints —
 * since this content is rendered for SEO and LLM consumption only.
 *
 * @param {{
 *   name: string,
 *   url: string,
 *   image?: string,
 *   price?: string,  // already-formatted display string, e.g. "$68.00"
 * }} item
 * @returns {string} HTML string
 */
export function buildCardHtml({
  name, url, image, price,
}) {
  const nameEsc = escapeHtml(name);
  const hrefEsc = escapeHtml(url);
  const imageHtml = image ? `<img src="${escapeHtml(image)}" alt="${nameEsc}">` : '';

  return `<a href="${hrefEsc}">${imageHtml}${nameEsc}</a>${price ? `<span>${escapeHtml(price)}</span>` : ''}`;
}

// ---------------------------------------------------------------------------
// Block row builder
// ---------------------------------------------------------------------------

/**
 * Builds AEM block rows for a list of cards with an optional title row.
 *
 * @param {string|null} title - Section heading text; omit or pass null to skip the title row
 * @param {Array<object>} items - Card data objects passed to `renderCard`
 * @param {{ renderCard?: function }} [opts]
 * @returns {Array<[string, string]>}
 */
export function buildCardListRows(title, items, {
  renderCard = buildCardHtml,
} = {}) {
  const rows = title ? [['Title', `<h2>${escapeHtml(title)}</h2>`]] : [];

  const listHtml = items.map((item) => `<li>${renderCard(item)}</li>`).join('\n');
  rows.push(['Products', `<ul>\n${listHtml}\n</ul>`]);
  return rows;
}
