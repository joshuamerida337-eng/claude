import { handleSubscribe } from "./subscribe.js";

/**
 * Cloudflare serves a matching file from dist/ when there is one, so this
 * Worker only runs for paths with no corresponding static asset — the API
 * endpoint, plus anything unrecognised, which is handed back to the asset
 * server so it can return the normal 404 page.
 */
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/subscribe") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed." }), {
          status: 405,
          headers: { "Content-Type": "application/json", Allow: "POST" },
        });
      }
      return handleSubscribe(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
