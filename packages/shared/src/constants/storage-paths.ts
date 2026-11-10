import { API_BASE_PATH } from './auth-paths';

/** Where the API mounts its storage routes, below {@link API_BASE_PATH}. */
export const STORAGE_ROUTE = '/storage';

/** The storage webhook, below {@link STORAGE_ROUTE}. */
export const STORAGE_WEBHOOK_ROUTE = '/webhook';

/**
 * Full path of the storage webhook. Only the storage provider calls it, directly on the API; the web proxy refuses
 * to forward it so it is not reachable from the public internet.
 */
export const STORAGE_WEBHOOK_PATH = `${API_BASE_PATH}${STORAGE_ROUTE}${STORAGE_WEBHOOK_ROUTE}`;
