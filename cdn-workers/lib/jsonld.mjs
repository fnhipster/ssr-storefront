/**
 * JSON-LD Library
 *
 * Renders structured data (JSON-LD) into a <script> tag and injects it into
 * <head>, replacing any existing block of the same type.
 *
 * Usage:
 *
 *   import { injectJsonLd } from '../lib/jsonld.mjs';
 *
 *   html = injectJsonLd(html, {
 *     '@context': 'https://schema.org',
 *     '@type': 'Product',
 *     name: 'Adobe Hoodie',
 *   });
 */

/**
 * Renders a JSON-LD object as a pretty-printed <script> tag.
 * Filters out entries with null/undefined values at the top level.
 *
 * @param {object} data - The JSON-LD object
 * @returns {string} A <script type="application/ld+json"> tag
 */
export function renderJsonLd(data) {
  const filtered = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v != null),
  );
  return `<script type="application/ld+json">\n${JSON.stringify(filtered, null, 2)}\n</script>`;
}

/**
 * Removes any existing JSON-LD script block whose body contains the given string.
 *
 * @param {string} html
 * @param {string} needle
 * @returns {string}
 */
function removeJsonLdContaining(html, needle) {
  return html.replace(
    /<script\s+type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/gi,
    (full, body) => (body.includes(needle) ? '' : full),
  );
}

/**
 * Injects a JSON-LD script tag into an HTML string before </head>,
 * replacing any existing block of the same type.
 *
 * - `@type` documents: removes any existing JSON-LD block containing that type string.
 * - `@graph` documents: removes any existing JSON-LD block containing `"@graph"`.
 *
 * @param {string} html - The full page HTML
 * @param {object} data - The JSON-LD object
 * @returns {string} Modified HTML
 */
export function injectJsonLd(html, data) {
  const needle = data['@graph'] ? '"@graph"' : (data['@type'] ? `"@type": "${data['@type']}"` : null);
  const result = needle ? removeJsonLdContaining(html, needle) : html;
  return result.replace('</head>', `${renderJsonLd(data)}\n</head>`);
}
