# aem-ssr-fastly-worker

Reference implementation of an AEM Edge Delivery Fastly Compute worker with SSR injectors pre-wired for product pages (PDP and PLP).

Use this as a starting point or as a guide when adding the injectors to your own worker. For the full integration tutorial see the [top-level README](../README.md).

## Prerequisites

Complete the [AEM Fastly Setup](https://www.aem.live/docs/byo-cdn-fastly-setup) before using this worker.

> **Note:** VCL and Compute cannot coexist on the same Fastly service. If you followed the standard guide using VCL snippets, create a new **Compute** service for this worker. The AEM-required headers set by those VCL snippets (`X-BYO-CDN-Type`, `X-Push-Invalidation`) are handled directly in [`src/index.mjs`](src/index.mjs).

Install the Fastly CLI:

```bash
brew install fastly/tap/fastly
```

## Setup

```bash
npm install
```

Update `fastly.toml` with your AEM origin hostname:

```toml
[setup.backends.aem_origin]
  address = "main--{site}--{org}.aem.live"
  port = 443
```

In the Fastly UI, create the following stores:

**Secret Store** — name: `aem_ssr_secrets`

| Secret | Description |
|---|---|
| `COMMERCE_API_KEY` | Adobe Commerce API key (encrypted at rest) |

**Config Store** — name: `aem_ssr_config`

| Key | Description |
|---|---|
| `COMMERCE_GRAPHQL_ENDPOINT` | Adobe Commerce Catalog Services GraphQL URL |
| `MAGENTO_ENVIRONMENT_ID` | Commerce environment ID |
| `MAGENTO_STORE_CODE` | Store code |
| `MAGENTO_STORE_VIEW_CODE` | Store view code |
| `MAGENTO_WEBSITE_CODE` | Website code |
| `MAGENTO_CUSTOMER_GROUP` | Customer group |

`COMMERCE_API_KEY` uses `SecretStore` (encrypted, never embedded in the Wasm binary). All other values use `ConfigStore` (can be updated without redeployment).

## Development

Fill in the `[local_server]` sections in `fastly.toml`, then:

```bash
npm run dev
```

## Deployment

```bash
fastly compute publish
```

## How the injectors are wired

The SSR pipeline is the three lines added to `handleRequest` after the origin fetch in [`src/index.mjs`](src/index.mjs):

```js
const injectorCtx = { pathname: url.pathname, env, origin: url.origin };
for (const injector of INJECTORS) {
  resp = await injector(resp, injectorCtx);
}
```

Everything else in the file is the standard AEM proxy behaviour from the Fastly setup guide, adapted for the Compute runtime.
