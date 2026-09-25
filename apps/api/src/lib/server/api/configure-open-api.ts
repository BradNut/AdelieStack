import { Scalar } from '@scalar/hono-api-reference';
import { createOpenApiDocument } from 'hono-zod-openapi';
import packageJSON from '../../../../package.json';
import type { AppOpenAPI } from './common/utils/hono';

export default function configureOpenAPI(app: AppOpenAPI) {
  createOpenApiDocument(app, {
    info: {
      title: 'Bored Game API',
      description: 'Bored Game API',
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
    '/reference',
    Scalar({
      theme: 'kepler',
      layout: 'classic',
      defaultHttpClient: {
        targetKey: 'js',
        clientKey: 'fetch',
      },
      url: '/api/doc',
    }),
  );
}
