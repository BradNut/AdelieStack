<script lang="ts">
	import { cn } from '@/utils/ui';
	import { page } from '$app/state';

	let { children } = $props();

	const links = [
		{ href: '/settings', label: 'Profile' },
		{ href: '/settings/email', label: 'Email' },
		{ href: '/settings/password', label: 'Password' },
		{ href: '/settings/security', label: 'Sessions' },
		{ href: '/settings/two-factor', label: 'Two-factor' },
		{ href: '/settings/passkeys', label: 'Passkeys' }
	];
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
