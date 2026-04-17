# AEM Production Cloudflare Worker

A Cloudflare Worker that serves as a production CDN for the `ssr-storefront` AEM Edge Delivery Services site. Based on the official [adobe/aem-cloudflare-prod-worker](https://github.com/adobe/aem-cloudflare-prod-worker) template.

Beyond CDN proxying, the worker enhances product pages with server-side rendered content:

- **JSON-LD** structured data (schema.org Product) — `lib/jsonld.mjs`
- **SEO meta tags** (title, description, keywords, Open Graph, product pricing) — `lib/metadata.mjs`
- **Product HTML** injected into the `product-details` AEM block before JavaScript loads — `lib/template.mjs` (`injectIntoBlock` balances nested `<div>`s so the block wrapper is not truncated)
- **Client bootstrap data** — `window.__INITIAL_DATA__["PDP:{sku}"]` via an inline script that reuses the page CSP nonce from the origin HTML — `lib/initial-data.mjs`

## Project Structure

```
src/
  index.mjs                     # Worker entry: proxy, headers, then injectProductDetails()
  lib/
    template.mjs                  # AEM block rows + injectIntoBlock (depth-aware)
    html.mjs                      # Shared HTML helpers (e.g. price formatting)
    jsonld.mjs                    # JSON-LD script injection / replacement
    metadata.mjs                  # Meta and <title> injection
    initial-data.mjs              # __INITIAL_DATA__ script + nonce extraction
  injectors/
    product-details.mjs           # Product page: GraphQL fetch, head + block injection
```

### Adding a New Injector

Use one module under `src/injectors/` that (1) decides whether the HTML should be enhanced, (2) loads any remote data, (3) mutates the HTML string, and (4) returns a `Response`. Reuse the head/body helpers in `src/lib/` instead of hand-splicing tags.

#### 1. Page gate

Decide how you recognize pages (exact substring, regex, pathname). `product-details.mjs` gates on `<meta name="template" content="pdp">` so only PDP HTML pays for a Catalog Services request. Early-out with `return new Response(html, response)` when the gate fails.

#### 2. JSON-LD (`lib/jsonld.mjs`)

- **`injectJsonLd(html, data)`** — Injects a `<script type="application/ld+json">` immediately before `</head>`.
- **`data`** must be a plain object suitable for JSON-LD (include **`@type`** when you care about deduplication).
- **Dedup:** If `data['@type']` is set, an existing JSON-LD block whose JSON contains that `"@type"` is removed first, then the new script is appended.
- **`renderJsonLd(data)`** — Returns only the script string (useful for tests or custom placement).

```js
import { injectJsonLd } from '../lib/jsonld.mjs';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Example',
};

html = injectJsonLd(html, jsonLd);
```

Under a strict `script-src` policy, nonced scripts may be required for executable scripts; `application/ld+json` is often treated as data. If the browser blocks your JSON-LD script, align with your CSP (e.g. nonce on that tag) the same way as `initial-data.mjs` does for inline JS.

#### 3. Meta tags and title (`lib/metadata.mjs`)

- **`injectMetadataTags(html, tags)`** — Injects `<meta …>` before `</head>`.
- **`tags`** is an array of **`[attr, key, content]`** tuples:
  - **`attr`** — `'name'` or `'property'` (becomes `name="…"` or `property="…"` on the element).
  - **`key`** — e.g. `'description'`, `'title'`, `'og:title'`, `'og:image'`.
  - **`content`** — string (or other value stringified). **`null` / `''` / `false`** skips that tuple.
- **Dedup:** For each tuple, an existing `<meta>` with the same `attr` + `key` is removed before new tags are injected.
- **`<title>`:** A tuple **`['name', 'title', 'Your title']`** also replaces the first `<title>…</title>` in the document.
- **`renderMetadataTags(tags)`** — Renders the meta HTML only (no injection).

```js
import { injectMetadataTags } from '../lib/metadata.mjs';

html = injectMetadataTags(html, [
  ['name', 'title', 'PLP: Summer sale'],
  ['name', 'description', 'Browse summer products.'],
  ['property', 'og:title', 'Summer sale'],
  ['property', 'og:url', pageUrl],
  ['property', 'og:image', imageUrl],
]);
```

#### 4. AEM block HTML (`lib/template.mjs`)

- **`injectIntoBlock(html, blockClass, rows, options?)`** — Replaces or appends rows inside the outer `<div class="…blockClass…">` wrapper. **`rows`** is `[['Label', value], …]`; the helper calls **`renderBlock`** internally (do not wrap with `renderBlock` yourself).
- **`options.strategy`** — `'replace'` (default) or `'append'`.
- Nesting: the implementation **balances `<div>` depth** so inner block rows do not confuse the closing wrapper tag.

```js
import { injectIntoBlock } from '../lib/template.mjs';

const BLOCK_CLASS = 'your-block-name';

function buildRows(data) {
  return [
    ['Heading', data.title],
    ['Count', String(data.count)],
  ];
}

html = injectIntoBlock(html, BLOCK_CLASS, buildRows(data), { strategy: 'replace' });
```

#### 5. Client bootstrap (`lib/initial-data.mjs`)

- **`injectInitialData(html, key, value)`** — Injects a short inline script before `</head>` that sets **`window.__INITIAL_DATA__[key]`** to a JSON-serializable **`value`**, using the **same CSP nonce** as other scripts on the page when Helix rewrites nonces.

#### 6. `Response` entry shape and wiring

Export an async function that mirrors `injectProductDetails`: accept **`(response, pathname, env)`**, read **`response.text()`** only when `Content-Type` is HTML, run your gate, optionally `fetch` backends using **`env`**, then apply **`injectJsonLd` / `injectMetadataTags` / `injectIntoBlock` / `injectInitialData`** in whatever order you need, and return **`new Response(html, response)`** (clone status/headers from the origin response as today).

Register the function in **`src/index.mjs`** after the origin `fetch`, e.g. `resp = await injectYourFeature(resp, url.pathname, env);`, chaining multiple injectors if required.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan works)
- [Node.js](https://nodejs.org/) (v18+)

## Setup

1. Sign up or log in at [dash.cloudflare.com](https://dash.cloudflare.com/)
2. From this directory, deploy the worker:

```bash
npx wrangler deploy
```

3. Wrangler will open a browser to authenticate with your Cloudflare account on first run
4. Once deployed, your worker is live at `https://aem-prod-worker.<your-account>.workers.dev`

## Development

Run the worker locally:

```bash
npx wrangler dev
```

## Logs

Tail live production logs:

```bash
npx wrangler tail -f pretty
```

## Environment Variables

Configured in `wrangler.toml` under `[vars]` (and optionally as secrets in the Cloudflare dashboard):

| Variable | Description |
|---|---|
| `ORIGIN_HOSTNAME` | AEM Edge Delivery origin hostname |
| `COMMERCE_GRAPHQL_ENDPOINT` | Adobe Commerce Catalog Services GraphQL endpoint |
| `COMMERCE_API_KEY` | API key for Catalog Services |
| `MAGENTO_CUSTOMER_GROUP` | Customer group hash |
| `MAGENTO_ENVIRONMENT_ID` | Commerce environment ID |
| `MAGENTO_STORE_CODE` | Store code |
| `MAGENTO_STORE_VIEW_CODE` | Store view code |
| `MAGENTO_WEBSITE_CODE` | Website code |

Optional (read in `index.mjs` if set):

| Variable | Description |
|---|---|
| `ORIGIN_AUTHENTICATION` | Sent as `authorization: token …` to the origin |
| `PUSH_INVALIDATION` | When not `disabled`, sets `x-push-invalidation: enabled` on the origin request |

## Custom Domain (optional)

When you're ready to use a custom domain, add `route` and `account_id` to `wrangler.toml`:

```toml
route = "www.yourdomain.com/*"
account_id = "your-account-id"
```

Then configure in the [Cloudflare Dashboard](https://dash.cloudflare.com/):

1. **DNS** -- Create a proxied `CNAME` record pointing to your AEM origin
2. **SSL/TLS > Edge Certificates** -- Enable **Always Use HTTPS**
3. **Caching > Configuration** -- Set Browser Cache TTL to **Respect Existing Headers**
4. **Caching > Cache Rules** -- Create a rule matching your hostname, set to **Eligible for cache** with **Respect Origin TTL**

## References

- [AEM BYO CDN Cloudflare Setup Guide](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup)
- [adobe/aem-cloudflare-prod-worker](https://github.com/adobe/aem-cloudflare-prod-worker)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
