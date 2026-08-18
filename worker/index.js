/**
 * Cloudflare entry point for the global Rite board.
 *
 * Everything of substance is in `board.js`, which is a plain `(request, env)`
 * function with no Cloudflare imports so the unit suite can drive it in Node
 * against a fake KV. This file exists only to satisfy the Workers module contract.
 */
import { handleRequest } from './board.js';

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
