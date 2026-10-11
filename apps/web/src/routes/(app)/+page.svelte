<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	const features = [
		{
			title: 'End-to-end type safety',
			body: 'Shared contracts flow from the Hono API to the SvelteKit app through an RPC client — no drift between client and server.'
		},
		{
			title: 'Authentication built in',
			body: 'Better Auth handles email/password, sessions, roles, two-factor, and passkeys, with email verification and rate limiting.'
		},
		{
			title: 'Batteries for real apps',
			body: 'PostgreSQL + Drizzle, Redis, SeaweedFS (S3), and Mailpit run locally with no API keys and no sign-ups.'
		},
		{
			title: 'Library-agnostic by design',
			body: 'A technical backend structure (controllers, services, repositories) that you can reshape toward DDD or vertical slices as you grow.'
		}
	];
</script>

<svelte:head>
	<title>AdelieStack</title>
	<meta
		name="description"
		content="A scalable, testable SvelteKit + Hono template with end-to-end type safety."
	/>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-12">
	<section class="flex flex-col items-start gap-4">
		<p class="text-sm font-medium text-muted-foreground">
			Welcome {data.authedUser?.name ?? 'visitor'}
		</p>
		<h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">
			A SvelteKit template with a real backend
		</h1>
		<p class="max-w-2xl text-lg text-muted-foreground">
			AdelieStack pairs a SvelteKit app with an in-process Hono API and shares typed contracts end to
			end. It bootstraps the repetitive parts every app needs — auth, data access, infra, and tests —
			so you can start building features on day one.
		</p>
		<div class="flex flex-wrap gap-3">
			<Button href="/docs">Read the docs</Button>
			{#if !data.authedUser}
				<Button href="/signup" variant="outline">Create an account</Button>
			{/if}
		</div>
	</section>

	<section class="grid gap-4 sm:grid-cols-2">
		{#each features as feature}
			<article class="flex flex-col gap-2 rounded-lg border bg-background p-6">
				<h2 class="text-lg font-semibold">{feature.title}</h2>
				<p class="text-sm text-muted-foreground">{feature.body}</p>
			</article>
		{/each}
	</section>

	<section class="flex flex-col gap-2 rounded-lg border bg-background p-6">
		<h2 class="text-lg font-semibold">Get started</h2>
		<p class="text-sm text-muted-foreground">
			Run <code class="rounded bg-muted px-1.5 py-0.5">pnpm initialize</code> then
			<code class="rounded bg-muted px-1.5 py-0.5">pnpm dev</code>. The
			<a class="font-medium underline underline-offset-4" href="/docs">docs page</a>
			walks through setup, commands, and the repository layout.
		</p>
	</section>
</div>
