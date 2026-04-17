# AEM Cloudflare Worker — CDN-layer SSR

A Cloudflare Worker that proxies AEM Edge Delivery responses and enriches them with server-side rendered content at the CDN edge, before the page reaches the browser.

The goal is to populate HTML that search engines and LLMs can read immediately — structured data, semantic markup, and meta tags — without waiting for client-side JavaScript to hydrate. The client framework takes over once it loads, replacing the SSR content with its own render.

Based on the official [adobe/aem-cloudflare-prod-worker](https://github.com/adobe/aem-cloudflare-prod-worker) template.

---

## How it works

```
Browser → Cloudflare Worker → AEM origin
                ↓
          [proxy response]
                ↓
          [run injectors]   ← enriches HTML for SEO / LLMs
                ↓
          [return to browser]
```

Each **injector** targets a specific page type (identified by a `<meta name="template">` tag), fetches data from Adobe Commerce, and injects into the HTML:

- **JSON-LD** — schema.org structured data for search engines (`Product`, `ItemList`, `BreadcrumbList`)
- **Meta tags** — `<title>`, description, keywords, Open Graph
- **Block HTML** — minimal semantic markup inside AEM blocks, readable by crawlers and LLMs before JavaScript loads
- **Initial data** — `window.__INITIAL_DATA__` bootstrap script for the client dropin (PDP only)

---

## Project structure

```
src/
  index.mjs              # Worker entry point: proxy logic, then injector pipeline
  injectors/
    product-details.mjs  # PDP — product data → JSON-LD, meta, block HTML, initial data
    category-page.mjs    # PLP — category products → JSON-LD @graph, meta, product list block
  lib/
    injector.mjs         # defineInjector() factory + transform helpers
    commerce.mjs         # Adobe Commerce Catalog Services GraphQL client
    block-list.mjs       # Card list block row builder
    url.mjs              # absoluteUrl(), titleCaseSegment()
    template.mjs         # AEM block HTML parser and injector
    jsonld.mjs           # JSON-LD <script> injection
    metadata.mjs         # <meta> and <title> injection
    initial-data.mjs     # window.__INITIAL_DATA__ script injection
    html.mjs             # formatPrice()
```

---

## Adding a new injector

### 1. Author the page template

In AEM, add a template meta tag to the page's `<head>` so the worker can identify it:

```html
<meta name="template" content="my-template">
```

### 2. Create the injector file

Use `defineInjector` from `lib/injector.mjs`. The framework handles the full lifecycle — HTML guard, template detection, data fetch, transform pipeline, and `Response` construction. You only write domain logic.

```js
// src/injectors/my-page.mjs
import { defineInjector, jsonLd, metadata, block } from '../lib/injector.mjs';

export default defineInjector({
  // Only run on pages that carry this template meta tag
  match: { template: 'my-template' },

  // Optional: fetch remote data before transforms run.
  // Receives { pathname, env, origin, html }.
  // Return null to skip all transforms and pass the response through unchanged.
  async fetch({ pathname, env }) {
    return fetchMyData(pathname, env);
  },

  // Ordered list of transforms — each injects into <head> or into a named block.
  inject: [
    jsonLd((data)      => buildMyJsonLd(data)),
    metadata((data, ctx) => buildMyMetadata(data, ctx)),
    block('my-block', (data) => buildMyBlockRows(data), { strategy: 'replace' }),
  ],
});
```

### 3. Register in `index.mjs`

Add the injector to the `INJECTORS` array. Injectors run in order; each one receives the `Response` from the previous:

```js
import myPageInjector from './injectors/my-page.mjs';

const INJECTORS = [plpInjector, pdpInjector, myPageInjector];
```

That's it. No boilerplate, no `new Response(...)`, no content-type checks.

---

## Injector context

Every `fetch` and transform function receives a context object:

| Property | Type | Description |
|---|---|---|
| `pathname` | `string` | URL pathname of the request (e.g. `/women/tops`) |
| `env` | `object` | Cloudflare Worker environment bindings (see [Environment Variables](#environment-variables)) |
| `origin` | `string` | Request origin (e.g. `https://www.example.com`) |
| `html` | `string` | Full HTML body — only available in `fetch`, not in transforms |

---

## Transform helpers

All imported from `lib/injector.mjs`. Each returns a `(html, data, ctx) => string` function and is listed in the `inject` array.

### `jsonLd(buildFn)`

Injects a `<script type="application/ld+json">` before `</head>`, replacing any existing JSON-LD block of the same type. Deduplication is automatic — no options needed:

- `@type` document → removes any existing block containing that type string
- `@graph` document → removes any existing `@graph` block

```js
// Regular @type document
jsonLd((data) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: data.title,
  url: data.url,
}))

// @graph document — dedup is still automatic
jsonLd((data, ctx) => buildCategoryJsonLdGraph(data, ctx))
```

### `metadata(buildFn)`

Injects `<meta>` tags before `</head>`, removing any existing tag with the same `attr` + `key`. A `['name', 'title', value]` entry also replaces the `<title>` element.

```js
metadata((data, ctx) => [
  ['name',     'title',       data.name],
  ['name',     'description', data.description],
  ['property', 'og:type',     'website'],
  ['property', 'og:url',      absoluteUrl(ctx.origin, ctx.pathname)],
  ['property', 'og:image',    null],  // null or '' → skipped
])
```

### `block(blockClass, buildFn, opts?)`

Injects rows into the named AEM block. Rows are `[label, value]` pairs rendered as nested `<div>` cells. The parser balances `<div>` depth so nested block content is never truncated.

Block HTML is rendered for **SEO and LLM consumption only** — keep markup minimal and semantic. The client dropin replaces this content once JavaScript loads.

```js
block('my-block', (data) => [
  ['Name',        data.name],
  ['Description', data.description],
  ['Image',       `<img src="${data.imageUrl}" alt="${data.name}">`],
], { strategy: 'replace' })  // 'replace' (default) or 'append'
```

For a list of items, build a `<ul>` in the value cell. Use `buildCardListRows` from `lib/block-list.mjs` for the common card pattern, or build the HTML directly:

```js
block('my-block', (data) => [
  ['Products', `<ul>
    ${data.items.map((item) => `<li>
      <a href="${item.url}"><img src="${item.image}" alt="${item.name}"> ${item.name}</a>
      <span>${item.price}</span>
    </li>`).join('\n')}
  </ul>`],
])
```

Or with `buildCardListRows`:

```js
import { buildCardListRows } from '../lib/block-list.mjs';

block('my-block', (data) => buildCardListRows(null, data.items))
```

### `initialData(buildFn)`

Injects `window.__INITIAL_DATA__[key] = value` as a CSP-safe inline script before `</head>`, reusing the page nonce. Use this to bootstrap client dropins with server-fetched data so they skip a redundant network request.

```js
initialData((data) => [`PDP:${data.product.sku}`, data])
```

---

## Libraries

### `lib/commerce.mjs`

GraphQL client for Adobe Commerce Catalog Services. Uses GET requests so responses are CDN-cacheable. Applies all required Magento headers from `env` automatically. Query whitespace is collapsed before sending.

```js
import { fetchCommerce, buildAvailability, formatOfferPrice } from '../lib/commerce.mjs';

// Returns the GraphQL `data` object, or null if the endpoint is not configured
// or the request fails.
const data = await fetchCommerce(MY_QUERY, { sku: 'ADB-123' }, env);
if (!data) return null;

// schema.org availability URL
buildAvailability(true)   // → 'https://schema.org/InStock'
buildAvailability(false)  // → 'https://schema.org/OutOfStock'

// Fixed 2-decimal string for schema.org Offer.price
formatOfferPrice(68)      // → '68.00'
formatOfferPrice(null)    // → ''
```

### `lib/block-list.mjs`

Builds AEM block rows for a list of linked cards. Use whenever a block contains a collection of items — product cards, article teasers, search results, etc.

```js
import { buildCardHtml, buildCardListRows } from '../lib/block-list.mjs';

// Each item: { name, url, image?, price? }
// price must be a pre-formatted display string (e.g. '$68.00')
const rows = buildCardListRows(null, cards);

// Optional title row
const rows = buildCardListRows('Women', cards);

// Custom card renderer
const rows = buildCardListRows(null, cards, {
  renderCard: ({ name, url }) => `<a href="${url}">${name}</a>`,
});
```

**`buildCardHtml({ name, url, image?, price? })`** — default card renderer. Produces a single `<a>` containing an optional `<img>` and the product name, followed by an optional `<span>` for the price. No layout wrappers — intentionally minimal for SEO/LLM readability.

**`buildCardListRows(title, items, opts?)`** — returns `[['Title', '<h2>…</h2>'], ['Products', '<ul>…</ul>']]`. Pass `null` as `title` to omit the title row.

### `lib/url.mjs`

```js
import { absoluteUrl, titleCaseSegment } from '../lib/url.mjs';

// Resolves a path against an origin. Already-absolute URLs pass through.
absoluteUrl('https://example.com', '/products/hoodie')
// → 'https://example.com/products/hoodie'

absoluteUrl('https://example.com', 'https://cdn.example.com/img.jpg')
// → 'https://cdn.example.com/img.jpg'

// Converts a URL segment to a readable label
titleCaseSegment('women-tops')   // → 'Women Tops'
titleCaseSegment('new_arrivals') // → 'New Arrivals'
```

### `lib/template.mjs`

Lower-level AEM block utilities. The `block` transform helper calls these internally; use them directly only when you need finer control.

**`injectIntoBlock(html, blockClass, rows, opts?)`** — Replaces or appends `[label, value]` rows inside the named block wrapper. `opts.strategy` is `'replace'` (default) or `'append'`.

**`extractBlockRowValue(html, blockClass, label)`** — Reads a text value from a labelled row inside a block *before* it is replaced. Useful for extracting authoring-time config (e.g. `urlpath`) before overwriting the block with server-rendered content.

**`renderBlock(rows)`** / **`renderRow(label, value)`** — Render `[label, value]` pairs into AEM block HTML without injecting.

**`escapeHtml(value)`** — Escapes `&`, `<`, `>`, `"`. Passes through strings that already contain HTML tags.

### `lib/jsonld.mjs`

**`injectJsonLd(html, data)`** — Injects a `<script type="application/ld+json">` before `</head>`, replacing any existing block of the same type. Handles `@type` and `@graph` documents automatically — no options required.

**`renderJsonLd(data)`** — Returns only the `<script>` tag string (useful for testing).

### `lib/metadata.mjs`

**`injectMetadataTags(html, tags)`** — Injects `<meta>` tags before `</head>`. For each tag, removes any existing `<meta>` with the same `attr` + `key` first. A `['name', 'title', …]` entry also replaces the `<title>` element.

**`renderMetadataTags(tags)`** — Returns the rendered HTML string without injecting.

### `lib/initial-data.mjs`

**`injectInitialData(html, key, value)`** — Injects a `<script>` before `</head>` that sets `window.__INITIAL_DATA__[key] = value`. Automatically extracts the page's CSP nonce from the AEM response so the script is not blocked by `script-src 'nonce-…'` policies.

**`extractCspNonceFromHtml(html)`** — Reads the nonce from `<meta property="csp-nonce">` or the first `<script nonce="…">` tag.

### `lib/html.mjs`

**`formatPrice(value, currency)`** — Formats a number as a locale-aware currency string using `Intl.NumberFormat` (e.g. `formatPrice(68, 'USD')` → `'$68.00'`).

---

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan works)
- [Node.js](https://nodejs.org/) v18+

## Setup

1. Sign up or log in at [dash.cloudflare.com](https://dash.cloudflare.com/)
2. From this directory, deploy the worker:

```bash
npx wrangler deploy
```

Wrangler will open a browser to authenticate on first run.

## Development

```bash
npx wrangler dev
```

## Logs

```bash
npx wrangler tail -f pretty
```

---

## Environment variables

Set in `wrangler.toml` under `[vars]`, or as secrets via the Cloudflare dashboard.

| Variable | Required | Description |
|---|---|---|
| `ORIGIN_HOSTNAME` | Yes | AEM Edge Delivery origin hostname |
| `COMMERCE_GRAPHQL_ENDPOINT` | Yes | Adobe Commerce Catalog Services GraphQL endpoint URL |
| `COMMERCE_API_KEY` | Yes | API key for Catalog Services |
| `MAGENTO_ENVIRONMENT_ID` | Yes | Commerce environment ID |
| `MAGENTO_STORE_CODE` | Yes | Store code (e.g. `main_website_store`) |
| `MAGENTO_STORE_VIEW_CODE` | Yes | Store view code (e.g. `default`) |
| `MAGENTO_WEBSITE_CODE` | Yes | Website code (e.g. `base`) |
| `MAGENTO_CUSTOMER_GROUP` | No | Customer group hash for personalised pricing |
| `ORIGIN_AUTHENTICATION` | No | Sent as `Authorization: token …` to the AEM origin |
| `PUSH_INVALIDATION` | No | Set to `disabled` to suppress `x-push-invalidation` headers |

---

## Custom domain

Add `route` and `account_id` to `wrangler.toml`:

```toml
route = "www.yourdomain.com/*"
account_id = "your-account-id"
```

Then in the [Cloudflare Dashboard](https://dash.cloudflare.com/):

1. **DNS** — Create a proxied `CNAME` pointing to your AEM origin
2. **SSL/TLS › Edge Certificates** — Enable **Always Use HTTPS**
3. **Caching › Configuration** — Set Browser Cache TTL to **Respect Existing Headers**
4. **Caching › Cache Rules** — Match your hostname, set to **Eligible for cache** with **Respect Origin TTL**

---

## References

- [AEM BYO CDN Cloudflare Setup Guide](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup)
- [adobe/aem-cloudflare-prod-worker](https://github.com/adobe/aem-cloudflare-prod-worker)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
