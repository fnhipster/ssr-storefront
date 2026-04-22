# aem-ssr-fastly-worker

Reference implementation of an AEM Edge Delivery Fastly Compute worker with SSR injectors pre-wired for product pages (PDP and PLP).

Use this as a starting point or as a guide when adding the injectors to your own worker. For the full integration tutorial see the [top-level README](../README.md).

## Prerequisites

Complete the [AEM Fastly Setup](https://www.aem.live/docs/byo-cdn-fastly-setup) before using this worker. This file shows the resulting worker with the SSR injection pipeline layered on top.

> **Note:** The AEM-required headers set by the guide's VCL snippets (`X-BYO-CDN-Type`, `X-Push-Invalidation`) are handled directly in [`src/index.mjs`](src/index.mjs).

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
| `COMMERCE_API_KEY` | Adobe Commerce API key — required for Catalog Services; leave empty for ACCS (encrypted at rest) |

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

```bash
npm run dev
```

`fastly compute serve` requires `[local_server]` entries in `fastly.toml` to stand in for the production backend and config store. Add the following, substituting your own values:

```toml
[local_server.backends.aem_origin]
  url = "https://main--{site}--{org}.aem.live"
  override_host = "main--{site}--{org}.aem.live"

[local_server.config_stores.aem_ssr_config]
  format = "inline-toml"

  [local_server.config_stores.aem_ssr_config.contents]
    COMMERCE_GRAPHQL_ENDPOINT = "..."
    COMMERCE_API_KEY = "..."
    MAGENTO_ENVIRONMENT_ID = "..."
    MAGENTO_STORE_CODE = "..."
    MAGENTO_STORE_VIEW_CODE = "..."
    MAGENTO_WEBSITE_CODE = "..."
    MAGENTO_CUSTOMER_GROUP = "..."
```

`override_host` is required — without it Fastly sends the request with `Host: localhost`, which AEM rejects. Secret Stores are not emulated locally, so `COMMERCE_API_KEY` goes in the config store for dev.

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
