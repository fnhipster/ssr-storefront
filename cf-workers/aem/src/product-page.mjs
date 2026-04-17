/**
 * Product Page Enhancement Middleware
 *
 * Detects product pages in AEM Edge Delivery HTML responses and injects:
 *   - schema.org Product structured data (JSON-LD)
 *   - SEO meta tags (title, description, keywords)
 *   - Open Graph meta tags (og:title, og:image, etc.)
 *   - Product price meta tags (product:price:amount, product:price:currency)
 *
 * Product pages are identified by the presence of:
 *   <meta property="og:type" content="product">
 *
 * Product data is fetched from Adobe Commerce Catalog Services via GraphQL.
 * For products with multiple variants, each variant becomes a separate Offer.
 */

/** Meta tag used to identify product pages in the HTML response. */
const PRODUCT_META = '<meta property="og:type" content="product">';

/**
 * GraphQL query for Catalog Services — fetches the fields required to build
 * both the JSON-LD payload and the SEO/OG meta tags. Whitespace is collapsed
 * at runtime to keep the GET request URL short.
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
 *
 * @param {string} pathname
 * @returns {string|null}
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

/** Maps an inStock boolean to the corresponding schema.org availability URI. */
function buildAvailability(inStock) {
  return inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock';
}

/**
 * Builds the schema.org Offer entries.
 * - Multiple variants -> one Offer per variant with individual pricing/availability.
 * - Single/no variants -> one Offer from the parent product price.
 *
 * @param {{product: object, variants: object[]}} data
 * @returns {object[]}
 */
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

  // Simple product or complex with a single variant — use parent price.
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
 * Assembles the full schema.org Product JSON-LD object.
 *
 * @param {{product: object, variants: object[]}} data
 * @returns {string} Serialized JSON-LD
 */
function buildJsonLd(data) {
  const { product } = data;
  const { name, description, sku, urlKey, images, attributes } = product;
  const brand = attributes?.find((attr) => attr.name === 'brand');
  const productUrl = `/products/${urlKey}/${sku}`;

  const jsonLd = {
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
  };

  if (brand?.value) {
    jsonLd.brand = { '@type': 'Brand', name: brand.value };
  }

  return `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

// ---------------------------------------------------------------------------
// Meta tags
// ---------------------------------------------------------------------------

/** Creates an HTML meta tag string. Returns empty string if content is falsy. */
function metaTag(attr, key, content) {
  if (!content) return '';
  const escaped = String(content).replace(/"/g, '&quot;');
  return `<meta ${attr}="${key}" content="${escaped}">`;
}

/**
 * Builds all product meta tag HTML strings to inject into <head>.
 * Replicates the client-side setMetaTags logic from product-details.js.
 *
 * @param {{product: object}} data
 * @param {string} pageUrl - The full canonical URL of the page
 * @returns {string} Concatenated meta tag HTML
 */
function buildMetaTags({ product }, pageUrl) {
  const { name, metaTitle, metaDescription, metaKeyword, shortDescription, images } = product;
  const amount = product.priceRange?.minimum?.final?.amount
    || product.price?.final?.amount;

  const thumbnail = images?.find((img) => img.roles?.includes('thumbnail'));
  const imageUrl = thumbnail?.url || images?.[0]?.url;

  const title = metaTitle || name;

  const tags = [
    metaTag('name', 'title', title),
    metaTag('name', 'description', metaDescription),
    metaTag('name', 'keywords', metaKeyword),
    metaTag('property', 'og:description', shortDescription),
    metaTag('property', 'og:title', title),
    metaTag('property', 'og:url', pageUrl),
    metaTag('property', 'og:image', imageUrl),
    metaTag('property', 'og:image:secure_url', imageUrl),
    metaTag('property', 'product:price:amount', amount?.value),
    metaTag('property', 'product:price:currency', amount?.currency),
  ];

  return tags.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

/**
 * Replaces the <title> tag content with the product name.
 *
 * @param {string} html
 * @param {{product: object}} data
 * @returns {string}
 */
function replaceTitle(html, { product }) {
  const title = product.metaTitle || product.name;
  if (!title) return html;
  return html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
}

// ---------------------------------------------------------------------------
// Middleware entry point
// ---------------------------------------------------------------------------

/**
 * Enhances product page HTML responses with server-side SEO data:
 *   - JSON-LD structured data
 *   - Meta tags (SEO, Open Graph, product pricing)
 *   - Page title
 *
 * Non-HTML and non-product responses pass through unchanged.
 *
 * @param {Response} response - The origin response
 * @param {string} pathname - The request pathname
 * @param {object} env - Worker environment bindings
 * @returns {Promise<Response>}
 */
export async function enhanceProductPage(response, pathname, env) {
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

  // Build the canonical page URL from the product data
  const { product } = data;
  const pageUrl = `/products/${product.urlKey}/${product.sku}`;

  // Inject JSON-LD + meta tags before </head>, replace <title>
  const headInjection = [buildJsonLd(data), buildMetaTags(data, pageUrl)].join('\n');
  html = html.replace('</head>', `${headInjection}\n</head>`);
  html = replaceTitle(html, data);

  return new Response(html, response);
}
