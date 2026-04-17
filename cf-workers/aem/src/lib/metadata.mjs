/**
 * Metadata Library
 *
 * Renders and injects HTML meta tags into <head>. Works like renderBlock
 * but for <meta> tags. Handles deduplication — if a meta tag with the same
 * attribute and key already exists in the HTML, it is replaced.
 *
 * Also handles <title> and <meta name="description"> overrides.
 *
 * Usage:
 *
 *   import { injectMetadataTags } from '../lib/metadata.mjs';
 *
 *   html = injectMetadataTags(html, [
 *     ['name', 'title', 'Adobe Hoodie'],
 *     ['name', 'description', 'A cozy hoodie'],
 *     ['property', 'og:title', 'Adobe Hoodie'],
 *     ['property', 'og:image', null],  // skipped
 *   ]);
 */

/**
 * Renders a single <meta> tag. Returns empty string if content is falsy.
 *
 * @param {string} attr - The attribute type ('name' or 'property')
 * @param {string} key - The meta key (e.g. 'og:title', 'description')
 * @param {*} content - The content value
 * @returns {string}
 */
export function renderMetaTag(attr, key, content) {
  if (content == null || content === '' || content === false) return '';
  const escaped = String(content).replace(/"/g, '&quot;');
  return `<meta ${attr}="${key}" content="${escaped}">`;
}

/**
 * Renders an array of [attr, key, content] tuples into meta tag HTML.
 * Falsy content values are automatically filtered out.
 *
 * @param {Array<[string, string, *]>} tags - Array of [attr, key, content] tuples
 * @returns {string} Concatenated meta tag HTML
 */
export function renderMetadataTags(tags) {
  return tags
    .map(([attr, key, content]) => renderMetaTag(attr, key, content))
    .filter(Boolean)
    .join('\n');
}

/**
 * Removes an existing meta tag from HTML by its attribute and key.
 *
 * @param {string} html
 * @param {string} attr - 'name' or 'property'
 * @param {string} key - The meta key value
 * @returns {string}
 */
function removeExistingMetaTag(html, attr, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `\\s*<meta\\s+${attr}="${escapedKey}"[^>]*>`,
    'gi',
  );
  return html.replace(pattern, '');
}

/**
 * Injects meta tags into an HTML string before </head>.
 * If a meta tag with the same attr+key already exists, it is replaced.
 * Also replaces <title> if a ['name', 'title', ...] entry is provided,
 * and <meta name="description"> if provided.
 *
 * @param {string} html - The full page HTML
 * @param {Array<[string, string, *]>} tags - Array of [attr, key, content] tuples
 * @returns {string} Modified HTML
 */
export function injectMetadataTags(html, tags) {
  let result = html;
  let titleValue = null;

  const validTags = tags.filter(
    ([, , content]) => content != null && content !== '' && content !== false,
  );

  for (const [attr, key, content] of validTags) {
    // Remove existing meta tag with the same attr+key
    result = removeExistingMetaTag(result, attr, key);

    // Capture title value for <title> tag replacement
    if (attr === 'name' && key === 'title') {
      titleValue = content;
    }
  }

  // Replace <title> tag if a title meta tag was provided
  if (titleValue) {
    result = result.replace(/<title>[^<]*<\/title>/, `<title>${titleValue}</title>`);
  }

  const rendered = renderMetadataTags(validTags);
  if (!rendered) return result;
  return result.replace('</head>', `${rendered}\n</head>`);
}
