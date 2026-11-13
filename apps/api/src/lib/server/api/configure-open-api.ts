import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { API_BASE_PATH, APP_NAME } from '@adelie/shared';
import { Scalar } from '@scalar/hono-api-reference';
import { createOpenApiDocument } from 'hono-zod-openapi';
import packageJSON from '../../../../package.json';
import type { AppOpenAPI } from './common/utils/hono';

const REFERENCE_ROUTE = '/reference';
/** The reference's browser bundle, served by the API so the page loads no third-party script. */
const REFERENCE_SCRIPT_ROUTE = `${REFERENCE_ROUTE}/scalar.js`;

/**
 * The single-file browser build of `@scalar/api-reference`, read on first request. The package exports no path to it,
 * so it is found beside the package entry (`dist/index.js` -> `dist/browser/standalone.js`). Its version is the one
 * pinned in package.json and the lockfile, so the page runs exactly the script that was installed.
 */
let referenceScript: Promise<string> | undefined;
function loadReferenceScript(): Promise<string> {
  referenceScript ??= readFile(join(dirname(createRequire(import.meta.url).resolve('@scalar/api-reference')), 'browser', 'standalone.js'), 'utf8');
  return referenceScript;
}

export default function configureOpenAPI(app: AppOpenAPI) {
  createOpenApiDocument(app, {
    info: {
      title: `${APP_NAME} API`,
      description: `${APP_NAME} API`,
      version: packageJSON.version,
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
        cookieAuth: {
          type: 'apiKey',
          name: 'session',
          in: 'cookie',
        },
      },
    },
  });

  app.get(
    REFERENCE_ROUTE,
    Scalar({
      theme: 'kepler',
      layout: 'classic',
      defaultHttpClient: {
        targetKey: 'js',
        clientKey: 'fetch',
      },
      url: '/api/doc',
      // The page is on the app's own origin (through the web's /api proxy), so its script comes from the API too.
      cdn: `${API_BASE_PATH}${REFERENCE_SCRIPT_ROUTE}`,
    }),
  );

  app.get(REFERENCE_SCRIPT_ROUTE, async (c) => {
    c.header('Content-Type', 'text/javascript; charset=utf-8');
    return c.body(await loadReferenceScript());
  });
}
