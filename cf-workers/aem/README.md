# AEM Production Cloudflare Worker

A Cloudflare Worker that serves as a production CDN for the `ssr-storefront` AEM Edge Delivery Services site. Based on the official [adobe/aem-cloudflare-prod-worker](https://github.com/adobe/aem-cloudflare-prod-worker) template.

Beyond CDN proxying, the worker enhances product pages with server-side rendered content:

- **JSON-LD** structured data (schema.org Product)
- **SEO meta tags** (title, description, keywords, Open Graph, product pricing)
- **Product HTML** injected into AEM blocks before JavaScript loads

## Project Structure

```
src/
  index.mjs                       # Worker entry point (CDN proxy)
  product-page.mjs                # Product page middleware (orchestrator)
  lib/
    template.mjs                  # AEM block template renderer
    html.mjs                      # Shared HTML helpers
  injectors/
    product-details.mjs           # Product details block injector
```

### Adding a New Injector

1. Create a file in `src/injectors/` (e.g. `product-list.mjs`)
2. Import `renderBlock` and `injectIntoBlock` from `../lib/template.mjs`
3. Define your block rows and export an inject function:

```js
import { renderBlock, injectIntoBlock } from '../lib/template.mjs';

const BLOCK_CLASS = 'your-block-name';

function buildBlock(data) {
  return renderBlock([
    ['Label', data.value],
  ]);
}

export function injectYourBlock(html, data) {
  return injectIntoBlock(html, BLOCK_CLASS, buildBlock(data));
}
```

4. Wire it into `product-page.mjs` (or a new middleware)

### Template Format

The template library renders `[label, value]` pairs as AEM block rows:

```html
<div>
  <div>Label</div>
  <div>Value</div>
</div>
```

Values that are falsy (`null`, `undefined`, `''`) are automatically skipped. Values containing HTML tags are passed through as-is.

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

Configured in `wrangler.toml` under `[vars]`:

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
