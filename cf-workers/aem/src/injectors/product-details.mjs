/**
 * Product Details Injector
 *
 * Detects product pages in AEM Edge Delivery HTML responses and injects:
 *   - schema.org Product structured data (JSON-LD)
 *   - SEO & Open Graph meta tags
 *   - Page title
 *   - Server-rendered product HTML into the product-details block
 *   - window.__INITIAL_DATA__[PDP:{sku}] via inline script (CSP nonce from HTML)
 *
 * Product pages are identified by the presence of:
 *   <meta name="template" content="pdp">
 *
 * Product data is fetched from Adobe Commerce Catalog Services via GraphQL.
 */
import { PRODUCT_FRAGMENT } from '@dropins/storefront-pdp/fragments.js';
import {
  defineInjector, jsonLd, metadata, initialData, block,
} from '../lib/injector.mjs';
import { fetchCommerce, buildAvailability } from '../lib/commerce.mjs';
import { formatPrice } from '../lib/html.mjs';

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const PRODUCT_QUERY = /* GraphQL */ `
  query GET_PRODUCT_PAGE_DATA($sku: String!) {
    products(skus: [$sku]) {
      ...PRODUCT_FRAGMENT
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
  ${PRODUCT_FRAGMENT}
`;

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
 * @param {{ pathname: string, env: object }} ctx
 * @returns {Promise<{ product: object, variants: object[] }|null>}
 */
async function fetchProductData({ pathname, env }) {
  const sku = extractSku(pathname);
  if (!sku) return null;

  const data = await fetchCommerce(PRODUCT_QUERY, { sku }, env);
  if (!data) return null;

  const product = data?.products?.[0];
  if (!product) return null;

  return { product, variants: data?.variants?.variants || [] };
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

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

function buildProductJsonLd(data) {
  const { product } = data;
  const {
    name, description, sku, urlKey, images, attributes,
  } = product;
  const brand = attributes?.find((attr) => attr.name === 'brand');
  const productUrl = `/products/${urlKey}/${sku}`;

  return {
    '@context': 'https://schema.org',
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
// Metadata
// ---------------------------------------------------------------------------

function buildProductMetadata({ product }) {
  const {
    name, metaTitle, metaDescription, metaKeyword, shortDescription, images,
  } = product;
  const amount = product.priceRange?.minimum?.final?.amount
    || product.price?.final?.amount;
  const thumbnail = images?.find((img) => img.roles?.includes('thumbnail'));
  const imageUrl = thumbnail?.url || images?.[0]?.url;
  const title = metaTitle || name;
  const pageUrl = `/products/${product.urlKey}/${product.sku}`;

  return [
    ['name', 'title', title],
    ['name', 'description', metaDescription],
    ['name', 'keywords', metaKeyword],
    ['property', 'og:type', 'product'],
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
 * Builds the product-details block rows.
 * Each entry is a [label, value] pair rendered as an AEM block row.
 *
 * Add, remove, or reorder rows here to change the server-rendered output.
 *
 * @returns {Array<[string, *]>}
 */
function buildProductBlockRows({ product }) {
  const amount = product.priceRange?.minimum?.final?.amount
    || product.price?.final?.amount;
  const mainImage = product.images?.[0];

  return [
    ['Image', mainImage ? `<img src="${mainImage.url}" alt="${product.name}">` : ''],
    ['Name', product.name],
    ['Price', formatPrice(amount?.value, amount?.currency)],
    ['Description', product.description || product.shortDescription],
    ['Availability', product.inStock ? 'In stock' : 'Out of stock'],
  ];
}

// ---------------------------------------------------------------------------
// Injector
// ---------------------------------------------------------------------------

export default defineInjector({
  match: { template: 'pdp' },
  fetch: fetchProductData,
  inject: [
    jsonLd((data) => buildProductJsonLd(data)),
    metadata((data) => buildProductMetadata(data)),
    initialData((data) => [`PDP:${data.product.sku}`, data]),
    block('product-details', (data) => buildProductBlockRows(data), { strategy: 'replace' }),
  ],
});
