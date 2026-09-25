import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { varlockVitePlugin } from '@varlock/vite-integration';
import { defineConfig } from 'vitest/config';

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
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'baseLocale'],
		}),
	];

	const plugins = shouldEnableSentryBuildPlugin
		? [
				sentrySvelteKit({
					sourceMapsUploadOptions: {
						org: process.env.SENTRY_ORG,
						project: process.env.SENTRY_PROJECT,
						url: process.env.SENTRY_URL,
						authToken: process.env.SENTRY_AUTH_TOKEN,
						telemetry: false,
					},
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
		},
	};
});
