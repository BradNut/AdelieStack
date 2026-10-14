<script lang="ts">
	const stack = [
		{ name: 'SvelteKit 3 + Svelte 5', note: 'Runes, SSR, progressive enhancement' },
		{ name: 'Hono API', note: 'Mounted in-process at /api/[...slug]' },
		{ name: 'PostgreSQL + Drizzle', note: 'Type-safe queries and migrations' },
		{ name: 'Better Auth', note: 'Email/password, sessions, roles, 2FA, passkeys' },
		{ name: 'Tailwind v4 + Shadcn/UI', note: 'Accessible, themeable components' },
		{ name: 'Redis, SeaweedFS, Mailpit', note: 'Rate limiting, S3 storage, local email' }
	];

	const setupSteps = [
		'Make sure Docker is running.',
		'Set up your env files — see ENV_SETUP.md. Each app declares its variables in apps/<app>/.env.schema.',
		'For the first run, set DB_SEEDING and DB_MIGRATING to true in apps/api/.env.local.',
		'Run pnpm install.',
		'Run pnpm initialize to start Docker, provision storage buckets, and run the first migration.',
		'Run pnpm dev.',
		'Set DB_SEEDING and DB_MIGRATING back to false after the first run.'
	];

	const commands = [
		{ cmd: 'pnpm dev', note: 'Start the web app and API together' },
		{ cmd: 'pnpm check', note: 'Type-check web and enforce shared-code boundaries' },
		{ cmd: 'pnpm lint / pnpm format', note: 'Run Biome' },
		{ cmd: 'pnpm test', note: 'API and web unit tests (Vitest)' },
		{ cmd: 'pnpm test:e2e', note: 'Playwright end-to-end tests' },
		{ cmd: 'pnpm initialize', note: 'Boot local infra, storage, and DB migrate/seed' }
	];

	const layout = [
		{ path: 'apps/web', note: 'SvelteKit app' },
		{ path: 'apps/api', note: 'Hono API (controllers, services, repositories)' },
		{ path: 'packages/shared', note: 'Client-safe constants, domain values, DTOs, validations' },
		{ path: 'packages/api-contract', note: 'Hono RPC types shared by both apps' }
	];
</script>

<svelte:head>
	<title>AdelieStack | Docs</title>
	<meta
		name="description"
		content="How to set up and use the AdelieStack SvelteKit + Hono template."
	/>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-10">
	<header class="flex flex-col gap-2">
		<h1 class="text-3xl font-semibold tracking-tight">Documentation</h1>
		<p class="text-muted-foreground">
			AdelieStack is a full-stack template that pairs a SvelteKit app with an in-process Hono API,
			sharing typed contracts end to end. It bootstraps the repetitive, time-consuming parts every
			app needs — auth, data access, infra, and tests — without locking you into heavy opinions.
		</p>
	</header>

	<section class="flex flex-col gap-4">
		<h2 class="text-xl font-semibold">What you get</h2>
		<ul class="grid gap-3 sm:grid-cols-2">
			{#each stack as item}
				<li class="rounded-lg border bg-background p-4">
					<p class="font-medium">{item.name}</p>
					<p class="text-sm text-muted-foreground">{item.note}</p>
				</li>
			{/each}
		</ul>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-xl font-semibold">Local setup</h2>
		<ol class="flex list-decimal flex-col gap-2 pl-5">
			{#each setupSteps as step}
				<li class="text-sm">{step}</li>
			{/each}
		</ol>
		<p class="text-sm text-muted-foreground">
			No API keys and no third-party sign-ups are required — the stack runs fully on local
			infrastructure.
		</p>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-xl font-semibold">Common commands</h2>
		<ul class="flex flex-col gap-2">
			{#each commands as item}
				<li class="flex flex-col gap-1 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:gap-3">
					<code class="w-fit rounded bg-muted px-2 py-0.5 text-sm">{item.cmd}</code>
					<span class="text-sm text-muted-foreground">{item.note}</span>
				</li>
			{/each}
		</ul>
		<p class="text-sm text-muted-foreground">Use pnpm — never npm or yarn. Tasks run through Turbo.</p>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-xl font-semibold">Repository layout</h2>
		<ul class="flex flex-col gap-2">
			{#each layout as item}
				<li class="flex flex-col gap-1 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:gap-3">
					<code class="w-fit rounded bg-muted px-2 py-0.5 text-sm">{item.path}</code>
					<span class="text-sm text-muted-foreground">{item.note}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="text-xl font-semibold">How to use it</h2>
		<p class="text-sm text-muted-foreground">
			This is not an all-batteries-included boilerplate. It is library-agnostic by design: fork the
			repo, add the libraries you prefer, and grow it into your own opinionated starter. The backend
			starts with a technical folder structure (controllers, services, repositories) and can evolve
			toward DDD or vertical slices as complexity grows.
		</p>
		<p class="text-sm">
			For deeper detail, read the
			<a class="font-medium underline underline-offset-4" href="https://svelte.dev/docs/kit">
				SvelteKit docs
			</a>
			and the project README.
		</p>
	</section>
</div>
