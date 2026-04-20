# CDN SSR — Standardisation Plan

## Goal

Restructure the project so the injector framework and shared libraries live in a single location, shared across CDN-specific workers. Starting with Cloudflare Workers today and Fastly Compute next.

The NPM publishing step comes later — first we establish the right folder structure locally so both CDN workers import from the same `lib/`.

---

## New folder structure

```
ssr-storefront/
  cdn-workers/
    lib/                          ← CDN-agnostic shared code (moved from cf-workers/aem/src/lib/)
      injectors/
        product-details.mjs       ← moved from cf-workers/aem/src/injectors/
        category-page.mjs
      injector.mjs
      commerce.mjs
      block-list.mjs
      url.mjs
      template.mjs
      jsonld.mjs
      metadata.mjs
      initial-data.mjs
      html.mjs
    cloudflare/                   ← moved from cf-workers/aem/
      src/
        index.mjs                 ← CF-specific proxy; imports from ../../lib/
      package.json
      wrangler.toml
    fastly/                       ← new
      src/
        index.mjs                 ← Fastly-specific proxy; imports from ../../lib/
      package.json
      fastly.toml
  cf-workers/                     ← retired after migration
```

Both `cloudflare/src/index.mjs` and `fastly/src/index.mjs` import injectors and libraries from `../../lib/`. No duplication.

---

## What is CDN-agnostic

Everything in `cdn-workers/lib/` operates on plain HTML strings and standard Web APIs (`fetch`, `Request`, `Response`, `URL`, `Intl`). Both Cloudflare Workers and Fastly Compute run a V8-based runtime with full Web API support.

| Module | Why it's portable |
|---|---|
| `lib/injector.mjs` | Uses `Response` constructor and `response.headers.get()` — standard |
| `lib/commerce.mjs` | Uses standard `fetch` + `URL` |
| `lib/injectors/*.mjs` | Depend only on `lib/` — no CDN imports |
| `lib/template.mjs` | Pure string manipulation |
| `lib/jsonld.mjs` | Pure string manipulation |
| `lib/metadata.mjs` | Pure string manipulation |
| `lib/initial-data.mjs` | Pure string manipulation |
| `lib/block-list.mjs` | Pure string manipulation |
| `lib/url.mjs` | Pure JS |
| `lib/html.mjs` | Uses `Intl.NumberFormat` — standard |

The injectors use `defineInjector` which only depends on the standard `Request`/`Response` Web APIs. They require zero changes to run on Fastly.

---

## Fastly Compute — key differences from Cloudflare Workers

| | Cloudflare Workers | Fastly Compute (JS) |
|---|---|---|
| **Entry point** | `export default { fetch: handler }` | `addEventListener("fetch", (e) => e.respondWith(handler(e)))` |
| **Origin fetch** | `fetch(req, { cf: { cacheEverything: true } })` | `fetch(req, { backend: 'aem_origin' })` — backend name declared in `fastly.toml` |
| **Environment config** | `env` bindings object passed to handler | `env("VAR_NAME")` from `fastly:env` module; secrets via `SecretStore` |
| **CDN type header** | `x-byo-cdn-type: cloudflare` | `x-byo-cdn-type: fastly` |
| **Caching** | `cf: { cacheEverything: true }` in fetch options | Configured in `fastly.toml` or via cache override headers |
| **Push invalidation** | `x-push-invalidation: enabled` header | Same header — supported by AEM |
| **Body read** | `await response.text()` | `await response.text()` — identical |
| **Response creation** | `new Response(html, response)` | `new Response(html, { status, headers })` — identical |

The response body pipeline (`response.text()` → string injection → `new Response(html, ...)`) is identical in both runtimes. The only differences are the entry point and how config values are read.

---

## Fastly entry point

```js
// cdn-workers/fastly/src/index.mjs
/// <reference types="@fastly/js-compute" />
import { env } from 'fastly:env';
import pdpInjector from '../../lib/injectors/product-details.mjs';
import plpInjector from '../../lib/injectors/category-page.mjs';

const INJECTORS = [plpInjector, pdpInjector];

addEventListener('fetch', (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  const request = event.request;
  const url = new URL(request.url);

  // Build the same env shape that lib/commerce.mjs expects
  const workerEnv = buildEnv();

  // Proxy to AEM origin
  // 'aem_origin' is the backend name declared in fastly.toml
  let resp = await fetch(request, { backend: 'aem_origin' });

  resp.headers.delete('age');
  resp.headers.delete('x-robots-tag');

  // Run injector pipeline (identical to Cloudflare)
  const injectorCtx = { pathname: url.pathname, env: workerEnv, origin: url.origin };
  resp = await INJECTORS.reduce(
    async (prev, injector) => injector(await prev, injectorCtx),
    Promise.resolve(resp),
  );

  return resp;
}

function buildEnv() {
  return {
    COMMERCE_GRAPHQL_ENDPOINT: env('COMMERCE_GRAPHQL_ENDPOINT'),
    COMMERCE_API_KEY:          env('COMMERCE_API_KEY'),
    MAGENTO_ENVIRONMENT_ID:    env('MAGENTO_ENVIRONMENT_ID'),
    MAGENTO_STORE_CODE:        env('MAGENTO_STORE_CODE'),
    MAGENTO_STORE_VIEW_CODE:   env('MAGENTO_STORE_VIEW_CODE'),
    MAGENTO_WEBSITE_CODE:      env('MAGENTO_WEBSITE_CODE'),
    MAGENTO_CUSTOMER_GROUP:    env('MAGENTO_CUSTOMER_GROUP'),
  };
}
```

Compared to the Cloudflare `index.mjs`, the differences are:
1. `addEventListener('fetch', ...)` instead of `export default { fetch }`
2. `fetch(request, { backend: 'aem_origin' })` instead of CF cache options
3. `env('VAR_NAME')` from `fastly:env` instead of `env.VAR_NAME` binding
4. The injector pipeline (`INJECTORS.reduce(...)`) is **copy-paste identical**

---

## Fastly configuration (`fastly.toml`)

```toml
name = "aem-ssr-worker"
language = "javascript"
manifest_version = 2

[setup.backends.aem_origin]
address = "main--{site}--{org}.aem.live"
port = 443

[setup.config.env]
COMMERCE_GRAPHQL_ENDPOINT = ""
COMMERCE_API_KEY = ""
MAGENTO_ENVIRONMENT_ID = ""
MAGENTO_STORE_CODE = ""
MAGENTO_STORE_VIEW_CODE = ""
MAGENTO_WEBSITE_CODE = ""
MAGENTO_CUSTOMER_GROUP = ""
```

AEM-specific headers (`x-forwarded-host`, `x-byo-cdn-type: fastly`, `x-push-invalidation`) are set in the Fastly UI via VCL snippets per the [AEM Fastly setup guide](https://www.aem.live/docs/byo-cdn-fastly-setup), or added inline in `handleRequest`.

---

## Migration steps

### Phase 1 — Restructure (Cloudflare only, no behaviour change)

1. Create `cdn-workers/lib/` and move `cf-workers/aem/src/lib/` into it
2. Move `cf-workers/aem/src/injectors/` into `cdn-workers/lib/injectors/`
3. Create `cdn-workers/cloudflare/` and move the remaining `cf-workers/aem/` contents (index.mjs, package.json, wrangler.toml, node_modules) into it
4. Update all import paths in `cloudflare/src/index.mjs` to reference `../../lib/`
5. Verify `npx wrangler dev` still works — no behaviour change
6. Retire `cf-workers/`

### Phase 2 — Fastly worker

1. Create `cdn-workers/fastly/` with `src/index.mjs`, `package.json`, `fastly.toml`
2. Install `@fastly/js-compute` dev dependency
3. Implement `handleRequest` using `addEventListener` + `fetch(req, { backend })` + `buildEnv()`
4. Add AEM-required headers (`x-forwarded-host`, `x-byo-cdn-type: fastly`, `x-push-invalidation`) per the AEM setup guide
5. Wire `INJECTORS` pipeline — identical to Cloudflare
6. Test locally with `npx @fastly/js-compute build && fastly compute serve`
7. Deploy to Fastly Compute service

### Phase 3 — NPM package (future)

Once both CDN workers are stable and sharing `cdn-workers/lib/` without issues, extract the lib into a publishable package:

- `@aem-ssr/core` — everything in `cdn-workers/lib/` except `injectors/`
- `@aem-ssr/commerce` — `cdn-workers/lib/injectors/` + `commerce.mjs`

Each CDN worker then becomes a thin adapter that imports from the NPM packages.

---

## Decisions

### AEM headers — handle in the Compute JS worker

Fastly Compute@Edge and VCL snippets **cannot coexist on the same service** — they are separate service architectures. When using Compute, all request/response logic lives in the JS worker. The AEM-required headers (`x-forwarded-host`, `x-byo-cdn-type: fastly`, `x-push-invalidation`) are set directly in `handleRequest`, matching the pattern already used in the Cloudflare worker.

### Fastly config — `SecretStore` for secrets, `ConfigStore` for the rest

Fastly `env()` values are embedded in the compiled Wasm binary and are discoverable by inspection — **never use `env()` for secrets**. The split by variable:

| Variable | Store | Reason |
|---|---|---|
| `COMMERCE_API_KEY` | `SecretStore` | Credential — must be encrypted |
| `COMMERCE_GRAPHQL_ENDPOINT` | `ConfigStore` | URL — non-sensitive, may change without redeployment |
| `MAGENTO_ENVIRONMENT_ID` | `ConfigStore` | Config — non-sensitive |
| `MAGENTO_STORE_CODE` | `ConfigStore` | Config — non-sensitive |
| `MAGENTO_STORE_VIEW_CODE` | `ConfigStore` | Config — non-sensitive |
| `MAGENTO_WEBSITE_CODE` | `ConfigStore` | Config — non-sensitive |
| `MAGENTO_CUSTOMER_GROUP` | `ConfigStore` | Config — non-sensitive |

`buildEnv()` in the Fastly worker reads from both stores:

```js
import { SecretStore } from 'fastly:secret-store';
import { ConfigStore } from 'fastly:config-store';

function buildEnv() {
  const secrets = new SecretStore('aem_ssr_secrets');
  const config  = new ConfigStore('aem_ssr_config');
  return {
    COMMERCE_API_KEY:          secrets.get('COMMERCE_API_KEY').plaintext(),
    COMMERCE_GRAPHQL_ENDPOINT: config.get('COMMERCE_GRAPHQL_ENDPOINT'),
    MAGENTO_ENVIRONMENT_ID:    config.get('MAGENTO_ENVIRONMENT_ID'),
    MAGENTO_STORE_CODE:        config.get('MAGENTO_STORE_CODE'),
    MAGENTO_STORE_VIEW_CODE:   config.get('MAGENTO_STORE_VIEW_CODE'),
    MAGENTO_WEBSITE_CODE:      config.get('MAGENTO_WEBSITE_CODE'),
    MAGENTO_CUSTOMER_GROUP:    config.get('MAGENTO_CUSTOMER_GROUP'),
  };
}
```

### Worker independence

Each CDN worker is fully self-contained — its own `package.json`, its own `node_modules`, its own lock file. Third-party dependencies (`@dropins/*`, `wrangler`, `@fastly/js-compute`) are duplicated across workers intentionally. This keeps each worker deployable in isolation without any cross-worker tooling.

`cdn-workers/lib/` is shared by local relative import path (`../../lib/`). Once the libraries are published to NPM, each worker replaces those paths with the package import and manages the version independently.
