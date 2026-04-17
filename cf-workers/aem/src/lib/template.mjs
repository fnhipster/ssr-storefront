/**
 * AEM Block Template Library
 *
 * Renders data into AEM Edge Delivery block HTML structure.
 * AEM blocks are composed of rows, where each row contains cells:
 *
 *   <div>
 *     <div>label</div>
 *     <div>value</div>
 *   </div>
 *
 * Usage:
 *
 *   import { injectIntoBlock } from '../lib/template.mjs';
 *
 *   // Replace block contents (default)
 *   html = injectIntoBlock(html, 'product-details', [
 *     ['Name', product.name],
 *     ['Price', '$68.00'],
 *   ]);
 *
 *   // Append to existing block contents
 *   html = injectIntoBlock(html, 'product-details', rows, { strategy: 'append' });
 */

/**
 * Escapes HTML special characters in a string.
 * Passes through values that are already HTML (contain tags).
 *
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value == null) return '';
  const str = String(value);
  if (/<[a-z][\s\S]*>/i.test(str)) return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a single row (label + value pair) as an AEM block row.
 *
 * @param {string} label
 * @param {*} value - String or HTML. Falsy values cause the row to be skipped.
 * @returns {string} HTML string for one row, or empty string if value is falsy.
 */
export function renderRow(label, value) {
  if (value == null || value === '' || value === false) return '';
  return `<div>\n  <div>${escapeHtml(label)}</div>\n  <div>${escapeHtml(value)}</div>\n</div>`;
}

/**
 * Renders an array of [label, value] pairs into AEM block HTML.
 * Falsy values are automatically filtered out.
 *
 * @param {Array<[string, *]>} rows - Array of [label, value] tuples
 * @returns {string} Block HTML
 */
export function renderBlock(rows) {
  return rows
    .map(([label, value]) => renderRow(label, value))
    .filter(Boolean)
    .join('\n');
}

/**
 * Index of the `>` that closes the tag starting at `openLt` (must point at `<`).
 * Quote-aware so `>` inside attribute values does not end the tag early.
 *
 * @param {string} html
 * @param {number} openLt
 * @returns {number} index of closing `>`, or -1
 */
function endOfOpeningTag(html, openLt) {
  let quote = null;
  for (let i = openLt + 1; i < html.length; i += 1) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

/**
 * Finds the inner HTML range of the outermost `<div class="…blockClass…">` wrapper
 * by balancing `<div` opens against `</div>` closes. A plain `*?</div>` regex is wrong
 * because block rows are nested `<div>`s and the first `</div>` is not the wrapper end.
 *
 * @param {string} html
 * @param {string} blockClass
 * @returns {{ openTagEnd: number, closeTagStart: number } | null}
 */
export function findBlockInnerBoundaries(html, blockClass) {
  const escaped = blockClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp(
    `<div\\s[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`,
    'i',
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const openTagStart = openMatch.index;
  const gt = endOfOpeningTag(html, openTagStart);
  if (gt < 0) return null;

  const innerStart = gt + 1;
  let depth = 1;
  let i = innerStart;

  while (i < html.length && depth > 0) {
    const rest = html.slice(i);
    if (/^<\/div>/i.test(rest)) {
      depth -= 1;
      if (depth === 0) {
        return { openTagEnd: innerStart, closeTagStart: i };
      }
      i += 6;
    } else if (/^<div\b/i.test(rest)) {
      const end = endOfOpeningTag(html, i);
      if (end < 0) return null;
      depth += 1;
      i = end + 1;
    } else {
      i += 1;
    }
  }

  return null;
}

/**
 * Reads the text content of a labelled row inside an AEM block.
 *
 * Useful for extracting authoring-time configuration from a block before its
 * content is replaced by an injector (e.g. reading `urlpath` from the
 * `product-list-page` block before overwriting it with server-rendered rows).
 *
 * @param {string} html - Full page HTML
 * @param {string} blockClass - AEM block class name (e.g. `'product-list-page'`)
 * @param {string} label - Row label to look for (case-insensitive)
 * @returns {string|null} Trimmed text content of the value cell, or null if not found
 */
export function extractBlockRowValue(html, blockClass, label) {
  const bounds = findBlockInnerBoundaries(html, blockClass);
  if (!bounds) return null;
  const inner = html.slice(bounds.openTagEnd, bounds.closeTagStart);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<div>\\s*<div>${escaped}<\\/div>\\s*<div>([\\s\\S]*?)<\\/div>`,
    'i',
  );
  const m = inner.match(re);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, '').trim() || null;
}

/**
 * Injects rendered block rows into an AEM block identified by its class name.
 *
 * @param {string} html - The full page HTML
 * @param {string} blockClass - The block class name (e.g. 'product-details')
 * @param {Array<[string, *]>} rows - Array of [label, value] tuples
 * @param {object} [options]
 * @param {'replace'|'append'} [options.strategy='replace']
 *   - 'replace': replaces existing block content
 *   - 'append': appends to existing block content
 * @returns {string} Modified HTML
 */
export function injectIntoBlock(html, blockClass, rows, { strategy = 'replace' } = {}) {
  const content = renderBlock(rows);
  if (!content) return html;

  const bounds = findBlockInnerBoundaries(html, blockClass);
  if (!bounds) return html;

  const { openTagEnd, closeTagStart } = bounds;
  const head = html.slice(0, openTagEnd);
  const tail = html.slice(closeTagStart);

  if (strategy === 'append') {
    const inner = html.slice(openTagEnd, closeTagStart);
    return `${head}${inner}\n${content}\n${tail}`;
  }

  return `${head}\n${content}\n${tail}`;
}
