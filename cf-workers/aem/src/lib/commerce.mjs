/**
 * Adobe Commerce Catalog Services client
 *
 * Shared GraphQL GET fetcher and schema.org availability helper used by all
 * commerce injectors. Centralises the Magento request headers and error
 * handling so individual injectors only express their query and variables.
 *
 * Usage:
 *
 *   import { fetchCommerce, buildAvailability } from '../lib/commerce.mjs';
 *
 *   const data = await fetchCommerce(MY_QUERY, { sku: 'ABC123' }, env);
 *   if (!data) return null; // endpoint not configured or request failed
 */

/**
 * Returns the schema.org availability URL for a product.
 * Using https: — preferred by Google's structured-data guidelines.
 *
 * @param {boolean} inStock
 * @returns {string}
 */
export function buildAvailability(inStock) {
  return inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
}

/**
 * @param {object} env - Worker environment bindings
 * @returns {Record<string, string>}
 */
function commerceHeaders(env) {
  return {
    'content-type': 'application/json',
    'x-api-key': env.COMMERCE_API_KEY,
    'magento-customer-group': env.MAGENTO_CUSTOMER_GROUP,
    'magento-environment-id': env.MAGENTO_ENVIRONMENT_ID,
    'magento-store-code': env.MAGENTO_STORE_CODE,
    'magento-store-view-code': env.MAGENTO_STORE_VIEW_CODE,
    'magento-website-code': env.MAGENTO_WEBSITE_CODE,
  };
}

/**
 * Formats a numeric price value as a fixed 2-decimal string suitable for
 * schema.org `Offer.price` (e.g. `68` → `"68.00"`).
 * Returns an empty string for null, undefined, or non-numeric values.
 *
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function formatOfferPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  return Number(value).toFixed(2);
}

/**
 * Executes a GraphQL query against the Catalog Services endpoint using a
 * cacheable GET request.
 *
 * Returns `null` when:
 *   - `COMMERCE_GRAPHQL_ENDPOINT` is not configured in env
 *   - The HTTP response is not ok
 *
 * GraphQL errors are logged but do NOT cause a null return — partial `data`
 * is still returned so callers can decide how to handle degraded responses.
 *
 * @param {string} query - GraphQL query string (whitespace collapsed automatically)
 * @param {object} variables - GraphQL variables
 * @param {object} env - Worker environment bindings
 * @returns {Promise<object|null>} GraphQL response `data` object, or null on failure
 */
export async function fetchCommerce(query, variables, env) {
  if (!env.COMMERCE_GRAPHQL_ENDPOINT) return null;

  const params = new URLSearchParams({
    query: query.replace(/\s+/g, ' ').trim(),
    variables: JSON.stringify(variables),
  });

  const response = await fetch(`${env.COMMERCE_GRAPHQL_ENDPOINT}?${params}`, {
    headers: commerceHeaders(env),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Commerce GraphQL error: ${response.status}`, body);
    return null;
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    console.error('Commerce GraphQL errors:', JSON.stringify(errors));
  }

  return data ?? null;
}
