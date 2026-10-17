<script lang="ts">
	import { AppRoute } from '@adelie/shared';
	import * as m from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils/ui.ts';
	import { page } from '$app/state';

	let { children } = $props();

	// Connected accounts only matter when the API has a provider configured.
	const links = $derived([
		{ href: AppRoute.SETTINGS, label: 'Profile' },
		{ href: AppRoute.SETTINGS_EMAIL, label: 'Email' },
		{ href: AppRoute.SETTINGS_PASSWORD, label: 'Password' },
		{ href: AppRoute.SETTINGS_SECURITY, label: 'Sessions' },
		{ href: AppRoute.SETTINGS_TWO_FACTOR, label: 'Two-factor' },
		{ href: AppRoute.SETTINGS_PASSKEYS, label: 'Passkeys' },
		...(page.data.socialProviders?.length ? [{ href: AppRoute.SETTINGS_CONNECTED_ACCOUNTS, label: m.connected_accounts_title() }] : [])
	]);
</script>

<div class="mx-auto grid w-full max-w-6xl gap-2">
	<h1 class="text-3xl font-semibold">Settings</h1>
</div>
<div
	class="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]"
>
	<nav class="grid gap-4 text-sm text-muted-foreground" aria-label="Settings">
		{#each links as link (link.href)}
			<a href={link.href} class={cn(page.url.pathname === link.href && 'font-semibold text-primary')}>
				{link.label}
			</a>
		{/each}
	</nav>
	<div class="grid gap-6">
		{@render children()}
	</div>
</div>
