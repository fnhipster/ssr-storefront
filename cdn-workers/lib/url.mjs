/**
 * URL utilities
 *
 * Shared helpers for URL construction and string formatting used by injectors
 * that need to produce absolute URLs or human-readable labels from URL segments.
 */

/**
 * Resolves a path or URL against an origin, returning an absolute URL string.
 * Already-absolute URLs (http/https) are returned as-is.
 *
 * @param {string} origin - e.g. `https://www.example.com` (trailing slash optional)
 * @param {string} pathOrUrl - Relative path or absolute URL
 * @returns {string}
 */
export function absoluteUrl(origin, pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const p = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  if (!origin) return p;
  return `${origin.replace(/\/$/, '')}${p}`;
}

/**
 * Converts a URL path segment (e.g. `women-tops` or `women_tops`) into a
 * human-readable title-cased label (e.g. `Women Tops`).
 *
 * @param {string} segment - A single URL path segment
 * @returns {string}
 */
export function titleCaseSegment(segment) {
  return segment
    .split(/[-_/]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
