import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import adapter from '@sveltejs/adapter-node';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { varlockVitePlugin } from '@varlock/vite-integration';
import { defineConfig } from 'vitest/config';
import cspDirectives from './csp-directives.mjs';

export default defineConfig(({ mode }) => {
  const isProductionEnvironment = mode === 'production' && process.env.ENVIRONMENT === 'production';
  const shouldEnableSentryBuildPlugin =
    isProductionEnvironment &&
    process.env.ENABLE_SENTRY_BUILD_PLUGIN === 'true' &&
    Boolean(process.env.SENTRY_ORG) &&
    Boolean(process.env.SENTRY_PROJECT) &&
    Boolean(process.env.SENTRY_URL) &&
    Boolean(process.env.SENTRY_AUTH_TOKEN);

  const basePlugins = [
    tailwindcss(),
    // must come before the SvelteKit plugin
    enhancedImages(),
    varlockVitePlugin(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
      // adapter-node 6 no longer reads ORIGIN. By default the origin comes from the request (Host header, https unless PROTOCOL_HEADER says otherwise),
      // which is wrong for a plain-HTTP deployment and fails the CSRF check on form actions. Set WEB_ORIGIN at build time to pin it.
      // Deliberately not ORIGIN: that is shared with the API and has a localhost default in .env.schema, which would be baked into the image.
      paths: { origin: process.env.WEB_ORIGIN || undefined },
      alias: {
        $lib: './src/lib',
        '@/*': './src/lib/*',
      },
      csp: {
        mode: 'auto',
        directives: cspDirectives,
      },
    }),
    // Resolves Svelte's browser build under Vitest so components can be mounted in jsdom.
    svelteTesting(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['cookie', 'baseLocale'],
    }),
  ];

  const plugins = shouldEnableSentryBuildPlugin
    ? [
        sentrySvelteKit({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          sentryUrl: process.env.SENTRY_URL,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          telemetry: false,
        }),
        ...basePlugins,
      ]
    : basePlugins;

  return {
    plugins,
    build: {
      sourcemap: shouldEnableSentryBuildPlugin ? 'hidden' : false,
      reportCompressedSize: false,
    },
    esbuild: {
      target: 'es2022',
    },
    test: {
      include: ['src/**/*.{test,spec}.{js,ts}'],
      setupFiles: ['src/lib/client/tests/sveltekit-client-mocks.ts'],
    },
  };
});
