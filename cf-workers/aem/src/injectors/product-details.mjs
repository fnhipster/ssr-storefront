/**
 * Product Details Injector
 *
 * Detects product pages in AEM Edge Delivery HTML responses and injects:
 *   - schema.org Product structured data (JSON-LD)
 *   - SEO & Open Graph meta tags
 *   - Page title
 *   - Server-rendered product HTML into the product-details block
 *
 * Product pages are identified by the presence of:
 *   <meta property="og:type" content="product">
 *
 * Product data is fetched from Adobe Commerce Catalog Services via GraphQL.
 */

import { injectIntoBlock } from '../lib/template.mjs';
import { injectJsonLd } from '../lib/jsonld.mjs';
import { injectMetadataTags } from '../lib/metadata.mjs';
import { formatPrice } from '../lib/html.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Meta tag used to identify product pages in the HTML response. */
const PRODUCT_META = '<meta property="og:type" content="product">';

/** The AEM block class name to target for HTML injection. */
const BLOCK_CLASS = 'product-details';

/**
 * GraphQL query for Catalog Services — fetches only the fields required for
 * JSON-LD, meta tags, and block HTML. Whitespace is collapsed at runtime
 * to keep the GET request URL short.
 */
const PRODUCT_QUERY = /* GraphQL */ `
  query GET_PRODUCT_PAGE_DATA($sku: String!) {
    products(skus: [$sku]) {
      __typename
      sku
      name
      description
      shortDescription
      metaTitle
      metaDescription
      metaKeyword
      inStock
      urlKey
      images(roles: []) { url roles }
      attributes(roles: ["brand"]) { name value }
      ... on SimpleProductView {
        price { final { amount { value currency } } }
      }
      ... on ComplexProductView {
        priceRange { minimum { final { amount { value currency } } } }
      }
    }
    variants(sku: $sku) {
      variants {
        product {
          sku
          name
          inStock
          images(roles: ["image"]) { url }
          ... on SimpleProductView {
            price { final { amount { value currency } } }
          }
        }
      }
    }
  }
`.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Extracts the product SKU from the last segment of the URL pathname.
 * Expects the pattern: /products/{urlKey}/{sku}
 */
function extractSku(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.at(-1) || null;
}

/**
 * Fetches product and variant data from Adobe Commerce Catalog Services.
 * Uses a GET request so responses can be cached by the CDN.
 *
 * @param {string} pathname - Request pathname (e.g. /products/adobe-hoodie/ADB127)
 * @param {object} env - Worker environment bindings
 * @returns {Promise<{product: object, variants: object[]}|null>}
 */
async function fetchProductData(pathname, env) {
  const sku = extractSku(pathname);
  if (!sku || !env.COMMERCE_GRAPHQL_ENDPOINT) {
    return null;
  }

  const params = new URLSearchParams({
    query: PRODUCT_QUERY,
    variables: JSON.stringify({ sku }),
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
    console.error(`Commerce GraphQL error: ${response.status}`, body);
    return null;
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    console.error('Commerce GraphQL errors:', JSON.stringify(errors));
    return null;
  }

  const product = data?.products?.[0];
  if (!product) {
    return null;
  }

  return { product, variants: data?.variants?.variants || [] };
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

function buildAvailability(inStock) {
  return inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock';
}

function buildOffers({ product, variants }) {
  if (variants.length > 1) {
    return variants.map(({ product: v }) => ({
      '@type': 'Offer',
      name: v.name,
      image: v.images?.[0]?.url,
      price: v.price?.final?.amount?.value,
      priceCurrency: v.price?.final?.amount?.currency,
      availability: buildAvailability(v.inStock),
      sku: v.sku,
    }));
  }

  const amount = product.priceRange?.minimum?.final?.amount
    || product.price?.final?.amount;

  return [{
    '@type': 'Offer',
    price: amount?.value,
    priceCurrency: amount?.currency,
    availability: buildAvailability(product.inStock),
  }];
}

/**
 * Builds the schema.org Product JSON-LD object.
 * Passed to injectJsonLd() from the library.
 */
function buildProductJsonLd(data) {
  const { product } = data;
  const {
    name, description, sku, urlKey, images, attributes,
  } = product;
  const brand = attributes?.find((attr) => attr.name === 'brand');
  const productUrl = `/products/${urlKey}/${sku}`;

  return {
    '@context': 'http://schema.org',
    '@type': 'Product',
    name,
    description,
    image: images?.[0]?.url,
    offers: buildOffers(data),
    productID: sku,
    sku,
    url: productUrl,
    '@id': productUrl,
    brand: brand?.value ? { '@type': 'Brand', name: brand.value } : null,
  };
}

// ---------------------------------------------------------------------------
// Metadata tags
// ---------------------------------------------------------------------------

/**
 * Builds the [attr, key, content] tuples for product meta tags.
 * Passed to injectMetadataTags() from the library.
 */
function buildProductMetadata({ product }, pageUrl) {
  const {
    name, metaTitle, metaDescription, metaKeyword, shortDescription, images,
  } = product;
  const amount = product.priceRange?.minimum?.final?.amount
    || product.price?.final?.amount;

  const thumbnail = images?.find((img) => img.roles?.includes('thumbnail'));
  const imageUrl = thumbnail?.url || images?.[0]?.url;
  const title = metaTitle || name;

  return [
    ['name', 'title', title],
    ['name', 'description', metaDescription],
    ['name', 'keywords', metaKeyword],
    ['property', 'og:description', shortDescription],
    ['property', 'og:title', title],
    ['property', 'og:url', pageUrl],
    ['property', 'og:image', imageUrl],
    ['property', 'og:image:secure_url', imageUrl],
    ['property', 'product:price:amount', amount?.value],
    ['property', 'product:price:currency', amount?.currency],
  ];
}

// ---------------------------------------------------------------------------
// Block HTML
// ---------------------------------------------------------------------------

/**
 * Builds the product details block rows.
 * Each entry is a [label, value] pair rendered as an AEM block row.
 *
 * Add, remove, or reorder rows here to change the server-rendered output.
 *
 * @returns {Array<[string, *]>}
 */
function buildProductBlockRows({ product }) {
  const amount = product.priceRange?.minimum?.final?.amount
    || product.price?.final?.amount;
  const price = formatPrice(amount?.value, amount?.currency);

  const mainImage = product.images?.[0];
  const imageHtml = mainImage
    ? `<img src="${mainImage.url}" alt="${product.name}" loading="eager" width="500" height="500">`
    : '';

  return [
    ['Image', imageHtml],
    ['Name', product.name],
    ['SKU', product.sku],
    ['Price', price],
    ['Short Description', product.shortDescription],
    ['Availability', product.inStock ? 'In stock' : 'Out of stock'],
    ['Description', product.description],
  ];
}

// ---------------------------------------------------------------------------
// Injector entry point
// ---------------------------------------------------------------------------

/**
 * Enhances product page HTML with server-side content:
 *   - JSON-LD structured data
 *   - Meta tags (SEO, Open Graph, product pricing)
 *   - Page title
 *   - Product HTML in the product-details block
 *
 * Non-HTML and non-product responses pass through unchanged.
 *
 * @param {Response} response - The origin response
 * @param {string} pathname - The request pathname
 * @param {object} env - Worker environment bindings
 * @returns {Promise<Response>}
 */
export async function injectProductDetails(response, pathname, env) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  if (!html.includes(PRODUCT_META)) {
    return new Response(html, response);
  }

  const data = await fetchProductData(pathname, env);
  if (!data) {
    return new Response(html, response);
  }

  const { product } = data;
  const pageUrl = `/products/${product.urlKey}/${product.sku}`;

  // Head: JSON-LD + meta tags (including <title> override)
  html = injectJsonLd(html, buildProductJsonLd(data));
  html = injectMetadataTags(html, buildProductMetadata(data, pageUrl));

  // Body: product block HTML (replace existing content)
  html = injectIntoBlock(html, BLOCK_CLASS, buildProductBlockRows(data), { strategy: 'replace' });

  return new Response(html, response);
}
