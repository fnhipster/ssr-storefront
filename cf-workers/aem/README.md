# AEM Production Cloudflare Worker

A Cloudflare Worker that serves as a production CDN for the `ssr-storefront` AEM Edge Delivery Services site. Based on the official [adobe/aem-cloudflare-prod-worker](https://github.com/adobe/aem-cloudflare-prod-worker) template.

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

## Custom Domain (optional)

When you're ready to use a custom domain, add `route` and `account_id` to `wrangler.toml`:

```toml
route = "www.yourdomain.com/*"
account_id = "your-account-id"
```

Then configure in the [Cloudflare Dashboard](https://dash.cloudflare.com/):

1. **DNS** -- Create a proxied `CNAME` record pointing to `main--ssr-storefront--fnhipster.aem.live`
2. **SSL/TLS > Edge Certificates** -- Enable **Always Use HTTPS**
3. **Caching > Configuration** -- Set Browser Cache TTL to **Respect Existing Headers**
4. **Caching > Cache Rules** -- Create a rule matching your hostname, set to **Eligible for cache** with **Respect Origin TTL**

## References

- [AEM BYO CDN Cloudflare Setup Guide](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup)
- [adobe/aem-cloudflare-prod-worker](https://github.com/adobe/aem-cloudflare-prod-worker)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
