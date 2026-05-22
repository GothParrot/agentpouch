import type { Context, MiddlewareHandler, Next } from "hono";

// When SHORTLINK_DOMAIN is set and the incoming Host matches it, only shortlink
// and upload-request page routes are served; everything else returns 404.
// When SHORTLINK_DOMAIN is unset, all routes are served on every host.
export function createHostMiddleware(shortlinkDomain?: string): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!shortlinkDomain) return next();

    const host = c.req.header("host")?.split(":")[0];
    if (host !== shortlinkDomain) return next();

    const path = new URL(c.req.url).pathname;
    const allowed = /^\/(v1\/f\/|u\/)/.test(path);
    if (!allowed) return c.json({ error: "Not found" }, 404);

    return next();
  };
}
