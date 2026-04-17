/**
 * Category / PLP injector
 *
 * Detects product listing pages (`<meta name="template" content="plp">`), runs a
 * minimal Catalog Services `productSearch` query, and injects JSON-LD @graph
 * (ItemList + BreadcrumbList), meta tags, and SSR rows into `product-list-page`.
 * No initial-data script.
 *
 * `urlpath` for the category filter is read from the AEM block (label `urlpath`)
 * before the block body is replaced.
 */
import { ProductView } from '@dropins/storefront-product-discovery/fragments.js';
import {
  escapeHtml,
  findBlockInnerBoundaries,
  injectIntoBlock,
} from '../lib/template.mjs';
import { formatPrice } from '../lib/html.mjs';
import { injectJsonLd } from '../lib/jsonld.mjs';
import { injectMetadataTags } from '../lib/metadata.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLP_TEMPLATE_META = '<meta name="template" content="plp">';
const BLOCK_CLASS = 'product-list-page';

const VISIBILITY_FILTER = {
  attribute: 'visibility',
  in: ['Search', 'Catalog, Search'],
};

/** Fields required for schema.org ItemList / Product entries only. */
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
`.replace(/\s+/g, ' ').trim();

const JSON_LD_LIST_FRAGMENT = '#list';

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} html
 * @param {string} blockClass
 * @param {string} label - Row label cell text (e.g. urlpath)
 * @returns {string|null}
 */
function extractBlockRowValue(html, blockClass, label) {
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

function absoluteUrl(origin, pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!origin) return pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const base = origin.replace(/\/$/, '');
  const p = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${p}`;
}

function titleCaseSegment(segment) {
  return segment
    .split(/[-_/]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatOfferPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  return Number(value).toFixed(2);
}

function buildAvailability(inStock) {
  return inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * @param {object} pv - productView from productSearch.items[].productView
 * @param {string} origin
 */
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
    url: productUrl,
    image: imageRaw ? absoluteUrl(origin, imageRaw) : '',
    price: formatOfferPrice(amount?.value),
    priceCurrency: amount?.currency || 'USD',
    availability: buildAvailability(pv.inStock),
  };
}

/**
 * @param {string} origin - e.g. https://www.example.com (from request)
 * @param {string} pathname - URL pathname
 * @param {string} categoryPath - categoryPath filter (from block urlpath)
 * @param {{ name: string, products: object[], totalCount: number, _placeholder?: boolean }} data
 */
function buildCategoryJsonLdGraph(origin, pathname, categoryPath, data) {
  const path = pathname || '/';
  const base = origin.replace(/\/$/, '');
  const pageUrl = absoluteUrl(origin, path);
  const listId = `${pageUrl}${JSON_LD_LIST_FRAGMENT}`;
  const categoryTitle = data.category?.name
    || titleCaseSegment(categoryPath.split('/').filter(Boolean).pop() || 'Category');

  const itemListElement = data.products.map((p, i) => {
    const item = {
      '@type': 'Product',
      name: p.name,
      url: p.url,
    };
    if (p.image) item.image = p.image;
    if (p.price) {
      item.offers = {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: p.priceCurrency,
        availability: p.availability,
      };
    }
    return {
      '@type': 'ListItem',
      position: i + 1,
      item,
    };
  });

  const pathParts = path.split('/').filter(Boolean);
  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: `${base}/`,
    },
  ];
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
        name: categoryTitle,
        description: `${categoryTitle} category at AEM Shop.`,
        url: pageUrl,
        numberOfItems: data.totalCount,
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

/**
 * @param {string} html
 * @param {string} pathname
 * @param {object} env
 * @param {string} origin
 * @returns {Promise<CategoryPagePayload>}
 */
async function fetchCategoryPageData(html, pathname, env, origin) {
  const urlpath = extractBlockRowValue(html, BLOCK_CLASS, 'urlpath');
  const categoryPath = urlpath || pathname.replace(/^\//, '') || '';

  if (!env.COMMERCE_GRAPHQL_ENDPOINT) {
    return {
      _placeholder: true,
      category: {
        name: titleCaseSegment(categoryPath.split('/').pop() || 'Category'),
        path: pathname || '/',
        urlpath: categoryPath,
      },
      products: [],
      totalCount: 0,
    };
  }

  const params = new URLSearchParams({
    query: CATEGORY_PRODUCT_SEARCH,
    variables: JSON.stringify({
      phrase: '',
      pageSize: 8,
      currentPage: 1,
      filter: [
        { attribute: 'categoryPath', eq: categoryPath },
        VISIBILITY_FILTER,
      ],
      sort: [{ attribute: 'position', direction: 'DESC' }],
    }),
  });

  const url = `${env.COMMERCE_GRAPHQL_ENDPOINT}?${params}`;
  const response = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.COMMERCE_API_KEY,
      'magento-customer-group': env.MAGENTO_CUSTOMER_GROUP,
      'magento-environment-id': env.MAGENTO_ENVIRONMENT_ID,
      'magento-store-code': env.MAGENTO_STORE_CODE,
      'magento-store-view-code': env.MAGENTO_STORE_VIEW_CODE,
      'magento-website-code': env.MAGENTO_WEBSITE_CODE,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Category productSearch error: ${response.status}`, body);
    return {
      _placeholder: true,
      category: {
        name: titleCaseSegment(categoryPath.split('/').pop() || 'Category'),
        path: pathname || '/',
        urlpath: categoryPath,
      },
      products: [],
      totalCount: 0,
    };
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    console.error('Category productSearch GraphQL errors:', JSON.stringify(errors));
  }

  const ps = data?.productSearch;
  const items = ps?.items || [];
  const totalCount = ps?.total_count ?? 0;

  const products = items
    .map((row) => mapProductViewForLd(row?.productView, origin))
    .filter(Boolean);

  const categoryName = titleCaseSegment(
    categoryPath.split('/').filter(Boolean).pop() || pathname.split('/').filter(Boolean).pop() || 'Category',
  );

  return {
    _placeholder: false,
    category: {
      name: categoryName,
      path: pathname || '/',
      urlpath: categoryPath,
    },
    products,
    totalCount,
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function buildCategoryMetadata(data, pageUrl) {
  const { category } = data;
  const title = `${category.name} | Shop`;

  return [
    ['name', 'title', title],
    ['name', 'description', `${category.name} category at AEM Shop.`],
    ['property', 'og:title', title],
    ['property', 'og:type', 'website'],
    ['property', 'og:url', pageUrl],
  ];
}

/**
 * @param {{ name: string, url: string, image: string, price: string, priceCurrency: string }} p
 * @returns {string}
 */
function buildCategoryProductCardHtml(p) {
  const name = escapeHtml(p.name);
  const href = escapeHtml(p.url);
  const priceHtml = p.price
    ? escapeHtml(formatPrice(Number(p.price), p.priceCurrency))
    : '';
  const imageHtml = p.image
    ? `<a href="${href}"><img src="${escapeHtml(p.image)}" alt="${name}" loading="lazy" width="240" height="300"></a>`
    : '';

  return `<article>
  <div>${imageHtml}</div>
  <div>
    <a href="${href}">${name}</a>
    ${priceHtml ? `<p>${priceHtml}</p>` : ''}
  </div>
</article>`;
}

function buildCategoryBlockRows(data) {
  const {
    category, products, totalCount, _placeholder,
  } = data;

  const rows = [
    [
      'Title',
      `<h2>${escapeHtml(category.name)}</h2>`,
    ],
  ];

  if (!products.length) {
    const emptyMsg = _placeholder
      ? 'Product list is not available from the catalog service.'
      : 'No products in this category.';
    rows.push([
      'Products',
      `<p>${escapeHtml(emptyMsg)}</p>`,
    ]);
    return rows;
  }

  const items = products
    .map((p) => `<li>${buildCategoryProductCardHtml(p)}</li>`)
    .join('\n');
  const showing = totalCount > products.length
    ? `<p>${escapeHtml(`Showing ${products.length} of ${totalCount}`)}</p>`
    : '';

  rows.push([
    'Products',
    `<ul>\n${items}\n</ul>${showing}`,
  ]);

  return rows;
}

// ---------------------------------------------------------------------------
// Injector
// ---------------------------------------------------------------------------

/**
 * @typedef {object} CategoryPagePayload
 * @property {boolean} [_placeholder]
 * @property {{ name: string, path: string, urlpath: string }} category
 * @property {object[]} products
 * @property {number} totalCount
 */

/**
 * @param {Response} response
 * @param {string} pathname
 * @param {object} env
 * @param {string} [origin] - Request origin (e.g. https://localhost:8787) for absolute JSON-LD URLs
 * @returns {Promise<Response>}
 */
export async function injectCategoryPage(response, pathname, env, origin = '') {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  if (!html.includes(PLP_TEMPLATE_META)) {
    return new Response(html, response);
  }

  const data = await fetchCategoryPageData(html, pathname, env, origin);
  const pageUrl = absoluteUrl(origin, pathname || '/') || (pathname || '/');

  const graphDoc = buildCategoryJsonLdGraph(
    origin,
    pathname || '/',
    data.category.urlpath,
    data,
  );

  const listId = graphDoc['@graph']?.[0]?.['@id'] || JSON_LD_LIST_FRAGMENT;

  html = injectJsonLd(html, graphDoc, { dedupeContains: listId });
  html = injectMetadataTags(html, buildCategoryMetadata(data, pageUrl));
  html = injectIntoBlock(html, BLOCK_CLASS, buildCategoryBlockRows(data), { strategy: 'replace' });

  return new Response(html, response);
}
