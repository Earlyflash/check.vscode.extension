/**
 * Cloudflare Worker entrypoint.
 * Serves static assets from ./public (via wrangler [assets]).
 * Handles POST /api/fetch-extensions, POST /api/github-repo; other non-asset requests return 404.
 */
import { handleFetchExtensions } from './api/fetch-extensions.js';
import { handleGitHubRepo } from './api/github-repo-handler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;
    if (url.pathname === '/api/fetch-extensions' && request.method === 'POST') {
      return handleFetchExtensions(request);
    }
    if (url.pathname === '/api/github-repo' && request.method === 'POST') {
      return handleGitHubRepo(request, env, origin);
    }
    return new Response('Not Found', { status: 404 });
  },
};
