/**
 * Category / PLP injector
 *
 * Detects product listing pages and injects JSON-LD, meta tags, and SSR rows
 * into the product-list-page block. Does not use initial-data (no window bootstrap).
 *
 * Pages are identified by:
 *   <meta name="template" content="plp">
 *
 * Category data: replace `fetchCategoryPageData` with Catalog Services / Live Search
 * when ready; the shape below is a deliberate placeholder contract.
 */
import { ProductView } from '@dropins/storefront-product-discovery/fragments.js';
import { injectIntoBlock } from '../lib/template.mjs';
import { injectJsonLd } from '../lib/jsonld.mjs';
import { injectMetadataTags } from '../lib/metadata.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marker meta for PLP / category HTML (align with head meta in authoring). */
const PLP_TEMPLATE_META = '<meta name="template" content="plp">';

/** AEM block class for the product discovery / category listing block. */
const BLOCK_CLASS = 'product-list-page';

// ---------------------------------------------------------------------------
// Data fetching (placeholder)
// ---------------------------------------------------------------------------

/**
 * Placeholder payload until GraphQL or Live Search is integrated.
 * Replace implementation; keep or evolve this object shape for injectors below.
 *
 * @param {string} pathname - Request pathname (e.g. /women/tops)
 * @param {object} _env - Worker environment bindings (unused for now)
 * @returns {Promise<CategoryPagePayload>}
 */
async function fetchCategoryPageData(pathname, _env) {
  return {
    _placeholder: true,
    category: {
      name: 'Category (placeholder)',
      path: pathname || '/',
    },
    products: [],
    facets: [],
    totalCount: 0,
  };
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

/**
 * @param {CategoryPagePayload} data
 * @param {string} pageUrl - Canonical path for this page
 */
function buildCategoryJsonLd(data, pageUrl) {
  const { category, products, totalCount } = data;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.name,
    description: `Browse products in ${category.name}.`,
    url: pageUrl,
    numberOfItems: totalCount,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.name || p.sku || `Item ${i + 1}`,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * @param {CategoryPagePayload} data
 * @param {string} pageUrl
 * @returns {Array<[string, string, *]>}
 */
function buildCategoryMetadata(data, pageUrl) {
  const { category } = data;
  const title = `${category.name} | Shop`;

  return [
    ['name', 'title', title],
    ['name', 'description', `Browse products — ${category.path}.`],
    ['property', 'og:title', title],
    ['property', 'og:type', 'website'],
    ['property', 'og:url', pageUrl],
  ];
}

// ---------------------------------------------------------------------------
// Block HTML
// ---------------------------------------------------------------------------

/**
 * @param {CategoryPagePayload} data
 * @returns {Array<[string, *]>}
 */
function buildCategoryBlockRows(data) {
  const { category, products, totalCount, _placeholder } = data;

  return [
    ['SSR', _placeholder ? 'Placeholder (wire fetchCategoryPageData)' : 'Live'],
    ['Category path', category.path],
    ['Category name', category.name],
    ['Product count', String(totalCount)],
    ['Listed in SSR payload', String(products.length)],
  ];
}

// ---------------------------------------------------------------------------
// Injector entry point
// ---------------------------------------------------------------------------

/**
 * @typedef {object} CategoryPagePayload
 * @property {boolean} [_placeholder]
 * @property {{ name: string, path: string }} category
 * @property {object[]} products
 * @property {object[]} facets
 * @property {number} totalCount
 */

/**
 * @param {Response} response
 * @param {string} pathname
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function injectCategoryPage(response, pathname, env) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  if (!html.includes(PLP_TEMPLATE_META)) {
    return new Response(html, response);
  }

  const data = await fetchCategoryPageData(pathname, env);
  const pageUrl = pathname || data.category.path;

  html = injectJsonLd(html, buildCategoryJsonLd(data, pageUrl));
  html = injectMetadataTags(html, buildCategoryMetadata(data, pageUrl));
  html = injectIntoBlock(html, BLOCK_CLASS, buildCategoryBlockRows(data), { strategy: 'replace' });

  return new Response(html, response);
}
