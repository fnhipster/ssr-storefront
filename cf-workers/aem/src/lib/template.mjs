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

  const escaped = blockClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(<div\\s[^>]*class="[^"]*${escaped}[^"]*"[^>]*>)([\\s\\S]*?)(</div>)`,
    'i',
  );
  const match = html.match(pattern);
  if (!match) return html;

  if (strategy === 'append') {
    return html.replace(pattern, `$1$2\n${content}\n$3`);
  }
  return html.replace(pattern, `$1\n${content}\n$3`);
}
