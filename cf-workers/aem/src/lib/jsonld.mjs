/**
 * JSON-LD Library
 *
 * Renders structured data (JSON-LD) into a <script> tag for injection
 * into HTML <head>. Works like renderBlock but for schema.org data.
 * Handles deduplication — if an existing JSON-LD script tag is found
 * with the same @type, it is replaced.
 *
 * Usage:
 *
 *   import { injectJsonLd } from '../lib/jsonld.mjs';
 *
 *   html = injectJsonLd(html, {
 *     '@context': 'http://schema.org',
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
 * Removes an existing JSON-LD script tag from HTML that matches the given @type.
 *
 * @param {string} html
 * @param {string} type - The @type value to match (e.g. 'Product')
 * @returns {string}
 */
function removeExistingJsonLd(html, type) {
  const pattern = new RegExp(
    `\\s*<script\\s+type="application/ld\\+json">[^<]*"@type"\\s*:\\s*"${type}"[^<]*</script>`,
    'gi',
  );
  return html.replace(pattern, '');
}

/**
 * Removes JSON-LD script blocks whose body contains a given substring (e.g. @graph list @id).
 *
 * @param {string} html
 * @param {string} needle
 * @returns {string}
 */
function removeJsonLdScriptsContaining(html, needle) {
  if (!needle) return html;
  return html.replace(
    /<script\s+type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/gi,
    (full, body) => (body.includes(needle) ? '' : full),
  );
}

/**
 * Injects a JSON-LD script tag into an HTML string before </head>.
 *
 * Dedup strategies:
 * - Default: if `data['@type']` is set, removes an existing JSON-LD block matching that @type.
 * - `{ dedupeContains }`: removes any JSON-LD block whose raw body includes that
 *   string (for @graph documents without a root @type).
 *
 * @param {string} html - The full page HTML
 * @param {object} data - The JSON-LD object
 * @param {{ dedupeContains?: string }} [options]
 * @returns {string} Modified HTML
 */
export function injectJsonLd(html, data, { dedupeContains } = {}) {
  let result = html;

  if (dedupeContains) {
    result = removeJsonLdScriptsContaining(result, dedupeContains);
  } else if (data['@type']) {
    result = removeExistingJsonLd(result, data['@type']);
  }

  return result.replace('</head>', `${renderJsonLd(data)}\n</head>`);
}
