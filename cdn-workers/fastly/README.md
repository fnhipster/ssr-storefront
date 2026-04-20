# aem-ssr-fastly-worker

Fastly Compute adapter for AEM Edge Delivery SSR. Proxies requests to the AEM origin and enriches HTML responses with server-rendered structured data, meta tags, and block HTML for SEO and LLM consumption.

Product detail pages (PDP) and product listing pages (PLP) are detected at the edge and enriched with schema.org JSON-LD, Open Graph tags, and pre-rendered HTML before the response is returned to the crawler or browser — no client-side JavaScript required for indexing.

## Prerequisites

Complete the standard AEM Edge Delivery Fastly setup before enabling SSR:

1. Follow the [AEM Fastly Setup guide](https://www.aem.live/docs/byo-cdn-fastly-setup) to:
   - Create a Fastly CDN service and add your production domain
   - Configure the AEM origin backend (e.g. `main--{site}--{org}.aem.live`)
   - Add the required VCL snippets (`recv`, `miss`/`pass`, `deliver`) from the guide
2. **Switch to a Compute service** — VCL and Compute cannot coexist on the same Fastly service. Create a new Compute service and migrate your domain to it. All request/response logic (including the AEM-required headers) lives in `src/index.mjs`.
3. Replace the Compute entry point with `src/index.mjs` from this package — it handles the full AEM proxy behaviour plus SSR injection.

> The AEM headers set by the VCL snippets in the standard guide (`X-BYO-CDN-Type`, `X-Push-Invalidation`) are set directly in `src/index.mjs` when running as a Compute service.

## Prerequisites — Fastly CLI

Install the Fastly CLI (required for local development and deployment):

```bash
brew install fastly/tap/fastly
```

## Setup

```bash
npm install
```

## Configuration

### Origin backend

Update `fastly.toml` with your AEM origin hostname:

```toml
[setup.backends.aem_origin]
  address = "main--{site}--{org}.aem.live"
  port = 443
```

### Fastly UI — Secret Store

Create a Secret Store named `aem_ssr_secrets` and add:

| Secret | Description |
|---|---|
| `COMMERCE_API_KEY` | Adobe Commerce API key (encrypted at rest) |

### Fastly UI — Config Store

Create a Config Store named `aem_ssr_config` and add:

| Key | Description |
|---|---|
| `COMMERCE_GRAPHQL_ENDPOINT` | Adobe Commerce Catalog Services GraphQL URL |
| `MAGENTO_ENVIRONMENT_ID` | Commerce environment ID |
| `MAGENTO_STORE_CODE` | Store code |
| `MAGENTO_STORE_VIEW_CODE` | Store view code |
| `MAGENTO_WEBSITE_CODE` | Website code |
| `MAGENTO_CUSTOMER_GROUP` | Customer group |

The API key uses `SecretStore` (encrypted, not embedded in the Wasm binary). All other values use `ConfigStore` (can be updated without redeployment).

## Enabling SSR for PDPs and PLPs

SSR injection is triggered by a `<meta name="template">` tag in the AEM page HTML. No worker code changes are required — just ensure your AEM pages include the correct template meta tag.

### Product Detail Pages (PDP)

Add to your AEM page metadata:

```
template: pdp
```

The worker will automatically:
- Fetch product data from Adobe Commerce by SKU (extracted from the URL path)
- Inject `<script type="application/ld+json">` with schema.org `Product` structured data
- Inject Open Graph and SEO meta tags (`og:title`, `og:image`, `og:description`, etc.)
- Inject `window.__INITIAL_DATA__[PDP:{sku}]` for client-side hydration
- Pre-render product name, price, image, description, and availability into the `product-details` block

### Product Listing Pages (PLP)

Add to your AEM page metadata:

```
template: plp
```

Optionally add a `urlpath` row to your `product-list-page` block to specify the Commerce category path. If omitted, the URL pathname is used.

The worker will automatically:
- Fetch the first 8 products in the category from Adobe Commerce
- Inject `<script type="application/ld+json">` with schema.org `ItemList` + `BreadcrumbList` structured data
- Inject Open Graph and SEO meta tags
- Pre-render product cards (image, name, price, link) into the `product-list-page` block

### Adding custom injectors

To add SSR for additional page types, create a new injector in `../../injectors/` and register it in `src/index.mjs`:

```js
import myInjector from '../../injectors/my-page.mjs';

const INJECTORS = [plpInjector, pdpInjector, myInjector];
```

See [`../lib/injector.mjs`](../lib/injector.mjs) and the [top-level README](../README.md) for the `defineInjector` API.

## Development

For local development, fill in the `[local_server]` sections in `fastly.toml` with your values, then:

```bash
npm run dev
```

## Deployment

```bash
npm run build
npm run deploy
```

Or combined:

```bash
fastly compute publish
```

## How it works

`src/index.mjs` is a standard AEM Edge Delivery Fastly Compute worker extended with an SSR injection pipeline. For every HTML response, it runs each registered injector in sequence. An injector only activates when its template meta tag matches; all other responses pass through unchanged.

Injected content is for SEO and LLM consumption only. The client-side JS dropin replaces it on hydration.
