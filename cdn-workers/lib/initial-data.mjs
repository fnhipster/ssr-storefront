/**
 * Initial data bootstrap for the browser (`window.__INITIAL_DATA__`)
 *
 * Injects a small inline script before </head>. The script must use the same
 * CSP nonce as the rest of the page. In repo source, head.html uses
 * nonce="aem", but AEM Edge Delivery / Helix typically rewrites that to a
 * per-response value on every `<script>` and aligns `script-src 'nonce-…'`.
 * This module copies whichever nonce already appears in the fetched HTML.
 *
 * Usage:
 *
 *   import { injectInitialData } from '../lib/initial-data.mjs';
 *
 *   html = injectInitialData(html, `PDP:${sku}`, data);
 */

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtmlAttribute(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Reads the CSP nonce AEM/Helix applied to the document (meta or first script).
 *
 * Dropins also read `meta[property=csp-nonce]` when adding modulepreload links.
 *
 * @param {string} html - Full page HTML from origin (after CDN rewrite)
 * @returns {string|null}
 */
export function extractCspNonceFromHtml(html) {
  const metaRe = /<meta\b[^>]*\bproperty\s*=\s*(["'])csp-nonce\1[^>]*>/i;
  const metaMatch = html.match(metaRe);
  if (metaMatch) {
    const tag = metaMatch[0];
    const nonceFromAttr = tag.match(/\bnonce\s*=\s*(["'])([^"']*)\1/i);
    if (nonceFromAttr?.[2]) return nonceFromAttr[2];
    const contentAttr = tag.match(/\bcontent\s*=\s*(["'])([^"']*)\1/i);
    if (contentAttr?.[2]) return contentAttr[2];
  }

  const scriptRe = /<script\b[^>]*\bnonce\s*=\s*(["'])([^"']+)\1/i;
  const scriptMatch = html.match(scriptRe);
  if (scriptMatch?.[2]) return scriptMatch[2];

  return null;
}

/**
 * @param {*} value
 * @returns {string} JavaScript expression source (JSON literal or `undefined`)
 */
function serializeForInlineScript(value) {
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * @param {string} key
 * @param {*} value
 * @param {string} nonce - Must match CSP / other scripts on the page
 * @returns {string} A <script> tag that assigns to window.__INITIAL_DATA__[key]
 */
export function renderInitialDataScript(key, value, nonce) {
  const keyJs = JSON.stringify(String(key));
  const valueJs = serializeForInlineScript(value);
  const nonceAttr = ` nonce="${escapeHtmlAttribute(nonce)}"`;
  return `<script${nonceAttr}>
window.__INITIAL_DATA__ = window.__INITIAL_DATA__ || {};
window.__INITIAL_DATA__[${keyJs}] = ${valueJs};
</script>`;
}

/**
 * Injects initial-data script before </head>, reusing the page CSP nonce when present.
 *
 * @param {string} html - Full page HTML
 * @param {string} key - Key on window.__INITIAL_DATA__
 * @param {*} value - JSON-serializable payload
 * @returns {string} Modified HTML
 */
export function injectInitialData(html, key, value) {
  const nonce = extractCspNonceFromHtml(html) ?? 'aem';
  return html.replace('</head>', `${renderInitialDataScript(key, value, nonce)}\n</head>`);
}
