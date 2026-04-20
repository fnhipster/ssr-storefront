# cdn-workers

Server-side rendering (SSR) injectors for AEM Edge Delivery product pages. Adds structured data, meta tags, and pre-rendered block HTML to PDP and PLP responses at the edge — no client-side JavaScript required for indexing.

These injectors run inside the CDN worker you already deploy as part of the [AEM BYO CDN setup](https://www.aem.live/docs/byo-cdn-setup). No extra infrastructure is required.

---

## Tutorial: adding SSR to your AEM CDN worker

### 1. Set up your CDN

Every AEM Edge Delivery project requires a CDN worker before going live. Follow the official setup guide for your provider:

- **Cloudflare** — [byo-cdn-cloudflare-worker-setup](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup)
- **Fastly** — [byo-cdn-fastly-setup](https://www.aem.live/docs/byo-cdn-fastly-setup)

Complete this step first. The injectors are added on top of that worker.

---

### 2. Copy the library files

Copy the following directories into your worker project. You can place them anywhere — the paths used in step 3 should match your layout.

```
lib/
  injector.mjs          # defineInjector factory
  commerce.mjs          # Adobe Commerce GraphQL client
  block-list.mjs        # Card list block renderer
  template.mjs          # AEM block HTML parser/injector
  jsonld.mjs            # JSON-LD injection
  metadata.mjs          # <meta> tag injection
  initial-data.mjs      # window.__INITIAL_DATA__ injection
  html.mjs              # formatPrice utility
  url.mjs               # absoluteUrl, titleCaseSegment
injectors/
  product-details.mjs   # PDP injector (template: pdp)
  category-page.mjs     # PLP injector (template: plp)
```

> See the [`cloudflare/`](cloudflare/) and [`fastly/`](fastly/) directories for complete reference implementations of a worker that already has these files wired up.

---

### 3. Import and register the injectors

In your worker's main entry file (e.g. `src/index.mjs`), import the injectors and add the pipeline after your origin fetch.

**Add the imports at the top:**

```js
import pdpInjector from './injectors/product-details.mjs';
import plpInjector from './injectors/category-page.mjs';

const INJECTORS = [plpInjector, pdpInjector];
```

**After fetching from the AEM origin, run the pipeline:**

```js
async function handleRequest(request, env) {
  const url = new URL(request.url);

  // ... your existing origin fetch ...
  let resp = await fetch(request);

  // Add this block after your origin fetch
  const injectorCtx = { pathname: url.pathname, env, origin: url.origin };
  for (const injector of INJECTORS) {
    resp = await injector(resp, injectorCtx);
  }

  return resp;
}
```

The `env` object passed to `injectorCtx` must include the Commerce credentials from step 4. Each injector checks the page's `<meta name="template">` tag and only activates on matching pages — all other responses pass through unchanged.

**Add the Commerce environment variables to your worker config:**

| Variable | Description |
|---|---|
| `COMMERCE_GRAPHQL_ENDPOINT` | Adobe Commerce Catalog Services GraphQL URL |
| `COMMERCE_API_KEY` | Adobe Commerce API key |
| `MAGENTO_ENVIRONMENT_ID` | Commerce environment ID |
| `MAGENTO_STORE_CODE` | Store code |
| `MAGENTO_STORE_VIEW_CODE` | Store view code |
| `MAGENTO_WEBSITE_CODE` | Website code |
| `MAGENTO_CUSTOMER_GROUP` | Customer group |

How you set these depends on your CDN. For Cloudflare add them to `[vars]` in `wrangler.toml`. For Fastly use a Config Store and Secret Store. See the [reference implementations](#reference-implementations) for examples.

---

### 4. Tag your AEM pages

SSR injection is triggered by a `<meta name="template">` tag in the AEM page metadata. Set this in your page's metadata table in the AEM document:

| Template value | Page type | What gets injected |
|---|---|---|
| `pdp` | Product Detail Page | JSON-LD `Product` schema, Open Graph tags, pre-rendered product block, `window.__INITIAL_DATA__` |
| `plp` | Product Listing Page | JSON-LD `ItemList` + `BreadcrumbList`, Open Graph tags, pre-rendered product cards |

No worker code changes are needed for new pages — add the template tag and the corresponding injector activates automatically.

For PLP pages, optionally add a `urlpath` row to your `product-list-page` block to specify the Commerce category path. If omitted, the URL pathname is used.

---

### 5. Test and validate

**Locally** — run your worker in dev mode and request a PDP or PLP URL. Inspect the HTML response body and confirm:

- A `<script type="application/ld+json">` block is present in `<head>`
- `<meta property="og:title">` and related tags are present
- The `product-details` or `product-list-page` block contains pre-rendered rows

**In production** — validate with [Google's Rich Results Test](https://search.google.com/test/rich-results) and [Schema Markup Validator](https://validator.schema.org/).

**Smoke test that non-product pages are unaffected** — request a page without a `template` meta tag and confirm the response is byte-identical to the origin.

---

## Adding a custom injector

To add SSR for a page type beyond PDP and PLP, create a new injector file and register it.

**Create `injectors/my-page.mjs`:**

```js
import { defineInjector, jsonLd, metadata, block } from '../injector.mjs';

export default defineInjector({
  match: { template: 'my-template' }, // matches <meta name="template" content="my-template">

  async fetch({ pathname, env }) {
    // Fetch data from your API. Return null to skip injection.
    return fetchMyData(pathname, env);
  },

  inject: [
    jsonLd((data) => buildMyJsonLd(data)),
    metadata((data) => buildMyMetadata(data)),
    block('my-block', (data) => buildMyBlockRows(data), { strategy: 'replace' }),
  ],
});
```

**Register it in your worker:**

```js
import myInjector from './injectors/my-page.mjs';

const INJECTORS = [plpInjector, pdpInjector, myInjector];
```

See [`lib/injector.mjs`](lib/injector.mjs) for the full `defineInjector` API.

---

## Reference implementations

The `cloudflare/` and `fastly/` directories contain complete, deployable worker scripts with the injectors already wired up. Use them as a starting point or as a reference when integrating into your own worker.

| CDN | Reference | AEM setup guide |
|---|---|---|
| Cloudflare Workers | [`cloudflare/`](cloudflare/README.md) | [byo-cdn-cloudflare-worker-setup](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup) |
| Fastly Compute | [`fastly/`](fastly/README.md) | [byo-cdn-fastly-setup](https://www.aem.live/docs/byo-cdn-fastly-setup) |

---

## Porting to other CDNs

`lib/` uses only standard Web APIs (`fetch`, `Request`, `Response`, `URL`, `Intl`) and is portable to any runtime that supports them. The only CDN-specific code is the entry point and environment config — not the injectors.

| CDN | Effort | Notes |
|---|---|---|
| Cloudflare Workers | — | Implemented |
| Fastly Compute | — | Implemented |
| Akamai EdgeWorkers | Moderate | Phase-split lifecycle (`onOriginResponse` for body); proprietary `httpRequest()` instead of `fetch`. `lib/` works unchanged. |
| CloudFront Lambda@Edge | Significant | 4-phase event model (`origin-response` for body); Node.js 18+ supports standard `fetch` so `lib/` works. CloudFront Functions not viable — no async or external fetch. |
