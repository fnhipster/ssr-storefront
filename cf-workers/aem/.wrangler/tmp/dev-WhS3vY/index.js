var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.mjs
var getExtension = /* @__PURE__ */ __name((path) => {
  const basename = path.split("/").pop();
  const pos = basename.lastIndexOf(".");
  return basename === "" || pos < 1 ? "" : basename.slice(pos + 1);
}, "getExtension");
var isMediaRequest = /* @__PURE__ */ __name((url) => /\/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\.[0-9a-z]+$/.test(url.pathname), "isMediaRequest");
var isRUMRequest = /* @__PURE__ */ __name((url) => /\/\.(rum|optel)\/.*/.test(url.pathname), "isRUMRequest");
var handleRequest = /* @__PURE__ */ __name(async (request, env, ctx) => {
  const url = new URL(request.url);
  if (url.port && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    const redirectTo = new URL(request.url);
    redirectTo.port = "";
    return new Response("Moved permanently to " + redirectTo.href, {
      status: 301,
      headers: {
        location: redirectTo.href
      }
    });
  }
  if (url.pathname.startsWith("/drafts/")) {
    return new Response("Not Found", { status: 404 });
  }
  if (isRUMRequest(url)) {
    if (!["GET", "POST", "OPTIONS"].includes(request.method)) {
      return new Response("Method Not Allowed", { status: 405 });
    }
  }
  const extension = getExtension(url.pathname);
  const savedSearch = url.search;
  const { searchParams } = url;
  if (isMediaRequest(url)) {
    for (const [key] of searchParams.entries()) {
      if (!["format", "height", "optimize", "width"].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else if (extension === "json") {
    for (const [key] of searchParams.entries()) {
      if (!["limit", "offset", "sheet"].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else {
    url.search = "";
  }
  searchParams.sort();
  url.hostname = env.ORIGIN_HOSTNAME;
  url.protocol = "https:";
  url.port = "";
  if (!url.origin.match(/^https:\/\/main--.*--.*\.(?:aem|hlx)\.live/)) {
    return new Response("Invalid ORIGIN_HOSTNAME", { status: 500 });
  }
  const req = new Request(url, request);
  req.headers.set("x-forwarded-host", req.headers.get("host"));
  req.headers.set("x-byo-cdn-type", "cloudflare");
  if (env.PUSH_INVALIDATION !== "disabled") {
    req.headers.set("x-push-invalidation", "enabled");
  }
  if (env.ORIGIN_AUTHENTICATION) {
    req.headers.set("authorization", `token ${env.ORIGIN_AUTHENTICATION}`);
  }
  let resp = await fetch(req, {
    method: req.method,
    cf: {
      // cf doesn't cache html by default: need to override the default behavior
      cacheEverything: true
    }
  });
  resp = new Response(resp.body, resp);
  if (resp.status === 301 && savedSearch) {
    const location = resp.headers.get("location");
    if (location && !location.match(/\?.*$/)) {
      resp.headers.set("location", `${location}${savedSearch}`);
    }
  }
  if (resp.status === 304) {
    resp.headers.delete("Content-Security-Policy");
  }
  resp.headers.delete("age");
  resp.headers.delete("x-robots-tag");
  return resp;
}, "handleRequest");
var src_default = {
  fetch: handleRequest
};

// ../../../../.nvm/versions/node/v20.19.0/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../.nvm/versions/node/v20.19.0/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-7SeFX0/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../.nvm/versions/node/v20.19.0/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-7SeFX0/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
