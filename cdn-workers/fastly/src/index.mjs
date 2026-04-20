/// <reference types="@fastly/js-compute" />
/**
 * AEM Fastly Compute Worker
 *
 * Proxies requests to the AEM Edge Delivery origin and enriches HTML responses
 * with server-side rendered content (JSON-LD, meta tags, block HTML) for SEO
 * and LLM consumption.
 *
 * Configuration:
 *   - Origin backend declared as 'aem_origin' in fastly.toml
 *   - Non-sensitive config in ConfigStore 'aem_ssr_config'
 */
import { ConfigStore } from 'fastly:config-store';
import pdpInjector from '../../injectors/product-details.mjs';
import plpInjector from '../../injectors/category-page.mjs';

const INJECTORS = [plpInjector, pdpInjector];

const getExtension = (path) => {
  const basename = path.split('/').pop();
  const pos = basename.lastIndexOf('.');
  return (basename === '' || pos < 1) ? '' : basename.slice(pos + 1);
};

const isMediaRequest = (url) => /\/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\.[0-9a-z]+$/.test(url.pathname);
const isRUMRequest = (url) => /\/\.(rum|optel)\/.*/.test(url.pathname);

function buildEnv() {
  const config = new ConfigStore('aem_ssr_config');
  return {
    COMMERCE_GRAPHQL_ENDPOINT: config.get('COMMERCE_GRAPHQL_ENDPOINT'),
    COMMERCE_API_KEY: config.get('COMMERCE_API_KEY'),
    MAGENTO_CUSTOMER_GROUP: config.get('MAGENTO_CUSTOMER_GROUP'),
    MAGENTO_ENVIRONMENT_ID: config.get('MAGENTO_ENVIRONMENT_ID'),
    MAGENTO_STORE_CODE: config.get('MAGENTO_STORE_CODE'),
    MAGENTO_STORE_VIEW_CODE: config.get('MAGENTO_STORE_VIEW_CODE'),
    MAGENTO_WEBSITE_CODE: config.get('MAGENTO_WEBSITE_CODE'),
  };
}

async function handleRequest(event) {
  const request = event.request;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/drafts/')) {
    return new Response('Not Found', { status: 404 });
  }

  if (isRUMRequest(url)) {
    if (!['GET', 'POST', 'OPTIONS'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405 });
    }
  }

  const extension = getExtension(url.pathname);
  const savedSearch = url.search;
  const { searchParams } = url;

  if (isMediaRequest(url)) {
    [...searchParams.keys()].forEach((key) => {
      if (!['format', 'height', 'optimize', 'width'].includes(key)) searchParams.delete(key);
    });
  } else if (extension === 'json') {
    [...searchParams.keys()].forEach((key) => {
      if (!['limit', 'offset', 'sheet'].includes(key)) searchParams.delete(key);
    });
  } else {
    url.search = '';
  }
  searchParams.sort();

  const req = new Request(url.toString(), request);
  req.headers.set('x-forwarded-host', req.headers.get('host'));
  req.headers.set('x-byo-cdn-type', 'fastly');
  req.headers.set('x-push-invalidation', 'enabled');
  req.headers.delete('accept-encoding');

  // 'aem_origin' backend is declared in fastly.toml
  let resp = await fetch(req, { backend: 'aem_origin' });

  resp = new Response(resp.body, resp);

  if (resp.status === 301 && savedSearch) {
    const location = resp.headers.get('location');
    if (location && !location.match(/\?.*$/)) {
      resp.headers.set('location', `${location}${savedSearch}`);
    }
  }
  if (resp.status === 304) {
    resp.headers.delete('Content-Security-Policy');
  }
  resp.headers.delete('age');
  resp.headers.delete('x-robots-tag');

  const env = buildEnv();
  const injectorCtx = { pathname: url.pathname, env, origin: url.origin };
  resp = await INJECTORS.reduce(
    async (prev, injector) => injector(await prev, injectorCtx),
    Promise.resolve(resp),
  );

  return resp;
}

addEventListener('fetch', (event) => event.respondWith(handleRequest(event)));
