/**
 * Category / PLP Injector
 *
 * Detects product listing pages (`<meta name="template" content="plp">`), runs a
 * minimal Catalog Services `productSearch` query, and injects:
 *   - JSON-LD @graph (ItemList + BreadcrumbList)
 *   - SEO & Open Graph meta tags
 *   - Server-rendered product cards into the product-list-page block
 *
 * The `urlpath` for the category filter is read from the AEM block (label
 * `urlpath`) before the block body is replaced.
 */
import { ProductView } from '@dropins/storefront-product-discovery/fragments';
import {
  defineInjector, jsonLd, metadata, block,
} from '../lib/injector.mjs';
import { fetchCommerce, buildAvailability, formatOfferPrice } from '../lib/commerce.mjs';
import { extractBlockRowValue } from '../lib/template.mjs';
import { buildCardListRows } from '../lib/block-list.mjs';
import { absoluteUrl, titleCaseSegment } from '../lib/url.mjs';
import { formatPrice } from '../lib/html.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK_CLASS = 'product-list-page';
const JSON_LD_LIST_FRAGMENT = '#list'; // used as the @id suffix for the ItemList node

const VISIBILITY_FILTER = {
  attribute: 'visibility',
  in: ['Search', 'Catalog, Search'],
};

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

/** Fields required for schema.org ItemList / Product entries. */
const CATEGORY_PRODUCT_SEARCH = /* GraphQL */ `
  query categoryProductSearch(
    $phrase: String!
    $pageSize: Int
    $currentPage: Int
    $filter: [SearchClauseInput!]
    $sort: [ProductSearchSortInput!]
    $context: QueryContextInput
  ) {
    productSearch(
      phrase: $phrase
      page_size: $pageSize
      current_page: $currentPage
      filter: $filter
      sort: $sort
      context: $context
    ) {
      total_count
      items {
        ...ProductView
      }
    }
  }
  ${ProductView}
`;

// ---------------------------------------------------------------------------
// Data mapping
// ---------------------------------------------------------------------------

function mapProductViewForLd(pv, origin) {
  if (!pv) return null;
  const amount = pv.__typename === 'ComplexProductView'
    ? pv.priceRange?.minimum?.final?.amount
    : pv.price?.final?.amount;
  const imageRaw = pv.images?.find((im) => im.roles?.includes('image'))?.url
    || pv.images?.[0]?.url;
  const productUrl = pv.url
    ? absoluteUrl(origin, pv.url)
    : absoluteUrl(origin, `/products/${pv.urlKey}/${String(pv.sku).toLowerCase()}`);

  return {
    name: pv.name,
    url: `/products/${pv.urlKey}/${pv.sku}`,
    image: imageRaw ? absoluteUrl(origin, imageRaw) : '',
    price: formatOfferPrice(amount?.value),
    priceCurrency: amount?.currency || 'USD',
    availability: buildAvailability(pv.inStock),
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetches category product data, falling back to a placeholder when the
 * Commerce endpoint is unavailable or returns an error.
 *
 * Never returns null — the placeholder ensures the injector always runs its
 * transforms (block replacement, meta, JSON-LD) even in degraded state.
 *
 * @param {{ html: string, pathname: string, env: object, origin: string }} ctx
 * @returns {Promise<CategoryPagePayload>}
 */
async function fetchCategoryPageData({
  html, pathname, env, origin,
}) {
  const urlpath = extractBlockRowValue(html, BLOCK_CLASS, 'urlpath');
  const categoryPath = urlpath || pathname.replace(/^\//, '') || '';

  const placeholderData = () => ({
    category: {
      name: titleCaseSegment(categoryPath.split('/').pop() || 'Category'),
      path: pathname || '/',
      urlpath: categoryPath,
    },
    products: [],
    totalCount: 0,
  });

  const data = await fetchCommerce(CATEGORY_PRODUCT_SEARCH, {
    phrase: '',
    pageSize: 8,
    currentPage: 1,
    filter: [
      { attribute: 'categoryPath', eq: categoryPath },
      VISIBILITY_FILTER,
    ],
    sort: [{ attribute: 'position', direction: 'DESC' }],
  }, env);

  if (!data) return placeholderData();

  const ps = data?.productSearch;
  const items = ps?.items || [];
  const totalCount = ps?.total_count ?? 0;

  const products = items
    .map((row) => mapProductViewForLd(row?.productView, origin))
    .filter(Boolean);

  const categoryName = titleCaseSegment(
    categoryPath.split('/').filter(Boolean).pop()
      || pathname.split('/').filter(Boolean).pop()
      || 'Category',
  );

  return {
    category: { name: categoryName, path: pathname || '/', urlpath: categoryPath },
    products,
    totalCount,
  };
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

function buildCategoryJsonLdGraph(data, { origin, pathname }) {
  const { category, products, totalCount } = data;
  const path = pathname || '/';
  const base = origin.replace(/\/$/, '');
  const pageUrl = absoluteUrl(origin, path);
  const listId = `${pageUrl}${JSON_LD_LIST_FRAGMENT}`;

  const itemListElement = products.map((p, i) => {
    const item = { '@type': 'Product', name: p.name, url: p.url };
    if (p.image) item.image = p.image;
    if (p.price) {
      item.offers = {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: p.priceCurrency,
        availability: p.availability,
      };
    }
    return { '@type': 'ListItem', position: i + 1, item };
  });

  const pathParts = path.split('/').filter(Boolean);
  const breadcrumbItems = [{
    '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/`,
  }];
  let acc = '';
  pathParts.forEach((part) => {
    acc += `/${part}`;
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: breadcrumbItems.length + 1,
      name: titleCaseSegment(part),
      item: `${base}${acc}`,
    });
  });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        '@id': listId,
        name: category.name,
        description: `${category.name} category at AEM Shop.`,
        url: pageUrl,
        numberOfItems: totalCount,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function buildCategoryMetadata(data, { origin, pathname }) {
  const { category } = data;
  const title = category.name;

  return [
    ['name', 'title', title],
    ['name', 'description', `${category.name} category at AEM Shop.`],
    ['property', 'og:title', title],
    ['property', 'og:type', 'website'],
    ['property', 'og:url', absoluteUrl(origin, pathname || '/')],
  ];
}

// ---------------------------------------------------------------------------
// Block HTML
// ---------------------------------------------------------------------------

function buildCategoryBlockRows({ products }) {
  const cards = products.map((p) => ({
    name: p.name,
    url: p.url,
    image: p.image,
    price: p.price ? formatPrice(Number(p.price), p.priceCurrency) : null,
  }));

  return buildCardListRows(null, cards);
}

// ---------------------------------------------------------------------------
// Injector
// ---------------------------------------------------------------------------

/**
 * @typedef {object} CategoryPagePayload
 * @property {{ name: string, path: string, urlpath: string }} category
 * @property {object[]} products
 * @property {number} totalCount
 */

export default defineInjector({
  match: { template: 'plp' },
  fetch: fetchCategoryPageData,
  inject: [
    jsonLd((data, ctx) => buildCategoryJsonLdGraph(data, ctx)),
    metadata((data, ctx) => buildCategoryMetadata(data, ctx)),
    block(BLOCK_CLASS, (data) => buildCategoryBlockRows(data), { strategy: 'append' }),
  ],
});
