/**
 * Cloudflare Worker entrypoint.
 * Serves static assets from ./public (via wrangler [assets]).
 * Handles POST /api/fetch-extensions; all other non-asset requests return 404.
 */
import { handleFetchExtensions } from './api/fetch-extensions.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/fetch-extensions' && request.method === 'POST') {
      return handleFetchExtensions(request);
    }
    return new Response('Not Found', { status: 404 });
  },
};
