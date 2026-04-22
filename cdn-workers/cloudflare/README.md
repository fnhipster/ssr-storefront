# aem-ssr-cloudflare-worker

Reference implementation showing the AEM Edge Delivery Cloudflare Worker from the official setup guide with SSR injectors integrated for product pages (PDP and PLP).

Use this as a reference when following the [integration tutorial](../README.md) to add SSR to your own worker.

## Prerequisites

Complete the [AEM Cloudflare Worker Setup](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup) first. This file shows the stock worker produced by that guide with the SSR injection pipeline layered on top.

## Setup

```bash
npm install
```

Edit `wrangler.toml` and fill in the `[vars]` section:


| Variable                    | Description                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ORIGIN_HOSTNAME`           | AEM origin hostname — bare hostname only, no scheme or trailing slash (e.g. `main--{site}--{org}.aem.live`) |
| `ORIGIN_AUTHENTICATION`     | (optional) site token for token-based auth (`hlx_…`)                                                        |
| `PUSH_INVALIDATION`         | (optional) set to `enabled` to enable push invalidation                                                     |
| `COMMERCE_GRAPHQL_ENDPOINT` | Adobe Commerce Catalog Services GraphQL URL                                                                 |
| `COMMERCE_API_KEY`          | Adobe Commerce API key — required for Catalog Services; leave empty for ACCS                                |
| `MAGENTO_ENVIRONMENT_ID`    | Commerce environment ID                                                                                     |
| `MAGENTO_STORE_CODE`        | Store code                                                                                                  |
| `MAGENTO_STORE_VIEW_CODE`   | Store view code                                                                                             |
| `MAGENTO_WEBSITE_CODE`      | Website code                                                                                                |
| `MAGENTO_CUSTOMER_GROUP`    | Customer group                                                                                              |


## Development

```bash
npm run dev
```

`wrangler dev` serves on `http://localhost:8787`. If you started from the stock AEM worker script rather than this file, two changes are required:

1. **Skip the port-strip redirect for localhost** — the stock script redirects any request with a port to the same URL without one, so every local request gets sent to `http://localhost/` (port 80, nothing listening). Add a localhost exception to the condition:
  ```js
   if (url.port && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
  ```
2. **Force `https:` before using the origin** — local requests arrive as `http://`, so any origin check requiring `https://` will fail. Set the protocol explicitly after assigning the hostname:
  ```js
   url.hostname = env.ORIGIN_HOSTNAME;
   url.protocol = 'https:';
  ```

## Deployment

```bash
npm run deploy
```

## How the injectors are wired

The SSR pipeline is the three lines added to `handleRequest` after the origin fetch in `[src/index.mjs](src/index.mjs)`:

```js
const injectorCtx = { pathname: url.pathname, env, origin: url.origin };
for (const injector of INJECTORS) {
  resp = await injector(resp, injectorCtx);
}
```

Everything else in the file is the standard AEM proxy behaviour from the Cloudflare setup guide.