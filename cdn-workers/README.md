# cdn-workers

CDN-layer SSR for AEM Edge Delivery Services. Enriches HTML responses with server-rendered structured data, meta tags, and block HTML for SEO and LLM consumption.

## Structure

```
cdn-workers/
  injectors/                    # SSR injectors (one per page template)
    product-details.mjs         # PDP injector
    category-page.mjs           # PLP injector
  lib/                          # CDN-agnostic shared libraries
    injector.mjs                # defineInjector factory + transform helpers
    commerce.mjs                # Adobe Commerce GraphQL client
    block-list.mjs              # Card list block renderer
    template.mjs                # AEM block HTML parser/injector
    jsonld.mjs                  # JSON-LD injection
    metadata.mjs                # <meta> tag injection
    initial-data.mjs            # window.__INITIAL_DATA__ injection
    html.mjs                    # formatPrice utility
    url.mjs                     # absoluteUrl, titleCaseSegment
  cloudflare/                   # Cloudflare Workers adapter
  fastly/                       # Fastly Compute adapter
  PLAN.md                       # Architecture and migration plan
```

`lib/` contains only standard Web API code (`fetch`, `Request`, `Response`, `URL`, `Intl`). It is CDN-agnostic and works in any V8-based edge runtime.

Each CDN worker is fully self-contained with its own `package.json`, `node_modules`, and lock file. The shared `lib/` is referenced by relative path (`../../lib/`) and will eventually be published to NPM.

## Writing an injector

See [`lib/injector.mjs`](lib/injector.mjs) for the full API. Quick example:

```js
import { defineInjector, jsonLd, metadata, block } from '../lib/injector.mjs';

export default defineInjector({
  match: { template: 'pdp' },

  async fetch({ pathname, env }) {
    return fetchProductData(pathname, env);
  },

  inject: [
    jsonLd((data) => buildProductJsonLd(data)),
    metadata((data) => buildProductMetadata(data)),
    block('product-details', (data) => buildProductBlockRows(data), { strategy: 'replace' }),
  ],
});
```

Injectors are registered in the CDN worker's `index.mjs`:

```js
import pdpInjector from '../../injectors/product-details.mjs';
import plpInjector from '../../injectors/category-page.mjs';

const INJECTORS = [plpInjector, pdpInjector];

resp = await INJECTORS.reduce(
  async (prev, injector) => injector(await prev, injectorCtx),
  Promise.resolve(resp),
);
```

## CDN workers

| Worker | Runtime | Entry |
|---|---|---|
| [cloudflare/](cloudflare/) | Cloudflare Workers | `export default { fetch }` |
| [fastly/](fastly/) | Fastly Compute | `addEventListener('fetch', ...)` |
