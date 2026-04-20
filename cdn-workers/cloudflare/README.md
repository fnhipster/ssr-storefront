# aem-ssr-cloudflare-worker

Reference implementation of an AEM Edge Delivery Cloudflare Worker with SSR injectors pre-wired for product pages (PDP and PLP).

Use this as a starting point or as a guide when adding the injectors to your own worker. For the full integration tutorial see the [top-level README](../README.md).

## Prerequisites

Complete the [AEM Cloudflare Worker Setup](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup) before using this worker. This script is a drop-in replacement for the worker produced by that guide — it handles the full AEM proxy behaviour and adds the SSR injection pipeline on top.

## Setup

```bash
npm install
```

Edit `wrangler.toml` and fill in the `[vars]` section:

| Variable | Description |
|---|---|
| `ORIGIN_HOSTNAME` | AEM origin hostname (e.g. `main--{site}--{org}.aem.live`) |
| `ORIGIN_AUTHENTICATION` | (optional) site token for token-based auth (`hlx_…`) |
| `PUSH_INVALIDATION` | (optional) set to `enabled` to enable push invalidation |
| `COMMERCE_GRAPHQL_ENDPOINT` | Adobe Commerce Catalog Services GraphQL URL |
| `COMMERCE_API_KEY` | Adobe Commerce API key |
| `MAGENTO_ENVIRONMENT_ID` | Commerce environment ID |
| `MAGENTO_STORE_CODE` | Store code |
| `MAGENTO_STORE_VIEW_CODE` | Store view code |
| `MAGENTO_WEBSITE_CODE` | Website code |
| `MAGENTO_CUSTOMER_GROUP` | Customer group |

## Development

```bash
npm run dev
```

## Deployment

```bash
npm run deploy
```

## How the injectors are wired

The SSR pipeline is the three lines added to `handleRequest` after the origin fetch in [`src/index.mjs`](src/index.mjs):

```js
const injectorCtx = { pathname: url.pathname, env, origin: url.origin };
for (const injector of INJECTORS) {
  resp = await injector(resp, injectorCtx);
}
```

Everything else in the file is the standard AEM proxy behaviour from the Cloudflare setup guide.
