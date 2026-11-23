/**
 * The largest request body the API reads, unless a route declares its own. It matches the web app's `/api` proxy cap
 * (adapter-node's default `BODY_SIZE_LIMIT`, 512K), so the API refuses nothing the proxy would have let through, and a
 * caller that reaches the API directly gets no more room than one that comes through the proxy.
 */
export const MAX_REQUEST_BODY_BYTES = 512 * 1024;
