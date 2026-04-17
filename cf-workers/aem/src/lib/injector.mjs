/**
 * Injector Framework
 *
 * `defineInjector` is a factory that encapsulates the standard injector
 * lifecycle — HTML guard, template detection, data fetch, transform pipeline,
 * Response creation — so individual injectors only express domain logic.
 *
 * Composable transform helpers (`jsonLd`, `metadata`, `initialData`, `block`)
 * map 1-to-1 with the HTML injection libraries in lib/ and are designed to be
 * listed declaratively in the `inject` array.
 *
 * Quick start:
 *
 *   import { defineInjector, jsonLd, metadata, initialData, block } from '../lib/injector.mjs';
 *
 *   export default defineInjector({
 *     // Only run on pages that have this template meta tag
 *     match: { template: 'pdp' },
 *
 *     // Fetch remote data; return null to pass through unchanged
 *     async fetch({ pathname, env }) {
 *       return fetchProductData(pathname, env);
 *     },
 *
 *     // Ordered transform pipeline — each receives (html, data, ctx)
 *     inject: [
 *       jsonLd((data) => buildProductJsonLd(data)),
 *       metadata((data) => buildProductMetadata(data)),
 *       initialData((data) => [`PDP:${data.product.sku}`, data]),
 *       block('product-details', (data) => buildProductBlockRows(data), { strategy: 'replace' }),
 *     ],
 *   });
 *
 * Registering in index.mjs:
 *
 *   import pdpInjector from './injectors/product-details.mjs';
 *   import plpInjector from './injectors/category-page.mjs';
 *
 *   const INJECTORS = [plpInjector, pdpInjector];
 *
 *   const ctx = { pathname: url.pathname, env, origin: url.origin };
 *   for (const injector of INJECTORS) {
 *     resp = await injector(resp, ctx);
 *   }
 */

import { injectJsonLd } from './jsonld.mjs';
import { injectMetadataTags } from './metadata.mjs';
import { injectInitialData } from './initial-data.mjs';
import { injectIntoBlock } from './template.mjs';

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

/**
 * Injects a JSON-LD script into `<head>`.
 *
 * @param {function(data: object, ctx: InjectorContext): object} buildFn
 *   Builds the JSON-LD object from data and context.
 * @param {function(schema: object, data: object, ctx: InjectorContext): object} [optsFn]
 *   Optional. Called with the already-built schema — returns options for
 *   `injectJsonLd` (e.g. `{ dedupeContains: '...' }`). Useful when the
 *   deduplication key is derived from the schema itself (e.g. @graph @id).
 * @returns {function(html: string, data: object, ctx: InjectorContext): string}
 */
export const jsonLd = (buildFn, optsFn) => (html, data, ctx) => {
  const schema = buildFn(data, ctx);
  const opts = optsFn ? optsFn(schema, data, ctx) : undefined;
  return injectJsonLd(html, schema, opts);
};

/**
 * Injects `<meta>` tags into `<head>`, deduplicating existing tags.
 *
 * @param {function(data: object, ctx: InjectorContext): Array<[string, string, *]>} buildFn
 *   Returns an array of `[attr, key, content]` tuples.
 * @returns {function(html: string, data: object, ctx: InjectorContext): string}
 */
export const metadata = (buildFn) => (html, data, ctx) =>
  injectMetadataTags(html, buildFn(data, ctx));

/**
 * Injects `window.__INITIAL_DATA__[key] = value` before `</head>`,
 * reusing the page's CSP nonce.
 *
 * @param {function(data: object, ctx: InjectorContext): [string, *]} buildFn
 *   Returns a `[key, value]` tuple.
 * @returns {function(html: string, data: object, ctx: InjectorContext): string}
 */
export const initialData = (buildFn) => (html, data, ctx) => {
  const [key, value] = buildFn(data, ctx);
  return injectInitialData(html, key, value);
};

/**
 * Injects rows into an AEM block identified by its CSS class name.
 *
 * @param {string} blockClass - AEM block class (e.g. `'product-details'`)
 * @param {function(data: object, ctx: InjectorContext): Array<[string, *]>} buildFn
 *   Returns an array of `[label, value]` row tuples.
 * @param {{ strategy?: 'replace' | 'append' }} [opts]
 * @returns {function(html: string, data: object, ctx: InjectorContext): string}
 */
export const block = (blockClass, buildFn, opts) => (html, data, ctx) =>
  injectIntoBlock(html, blockClass, buildFn(data, ctx), opts);

// ---------------------------------------------------------------------------
// Injector factory
// ---------------------------------------------------------------------------

/**
 * @typedef {{ pathname: string, env: object, origin: string }} InjectorContext
 */

/**
 * Defines an injector — a self-contained async function that conditionally
 * enriches an HTML `Response` with server-rendered content.
 *
 * Lifecycle (all steps except 5 are handled by the framework):
 *   1. Pass through non-HTML responses unchanged.
 *   2. Read the response body once.
 *   3. Run `match` checks — pass through if unmatched.
 *   4. Call `fetch(ctx)` if provided — pass through if it returns `null`.
 *   5. Run each transform in `inject` sequentially.  ← your domain logic
 *   6. Return a new Response wrapping the modified HTML.
 *
 * @param {{
 *   match?: { template?: string },
 *   fetch?: (ctx: InjectorContext & { html: string }) => Promise<object|null>,
 *   inject: Array<function(html: string, data: object|null, ctx: InjectorContext): string|Promise<string>>,
 * }} config
 *
 * @returns {function(response: Response, ctx: InjectorContext): Promise<Response>}
 */
export function defineInjector({ match, fetch: fetchFn, inject }) {
  return async function injector(response, ctx) {
    // 1. HTML guard
    if (!response.headers.get('content-type')?.includes('text/html')) {
      return response;
    }

    // 2. Read body once
    let html = await response.text();

    // 3. Template match
    if (match?.template) {
      const marker = `<meta name="template" content="${match.template}">`;
      if (!html.includes(marker)) {
        return new Response(html, response);
      }
    }

    // 4. Data fetch (optional) — null triggers a pass-through
    let data = null;
    if (fetchFn) {
      data = await fetchFn({ ...ctx, html });
      if (data === null) {
        return new Response(html, response);
      }
    }

    // 5. Transform pipeline
    for (const transform of inject) {
      // eslint-disable-next-line no-await-in-loop
      html = await transform(html, data, ctx);
    }

    return new Response(html, response);
  };
}
