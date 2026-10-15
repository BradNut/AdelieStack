<script lang="ts">
	import { SOCIAL_PROVIDER_LABELS, SOCIAL_PROVIDERS, type SocialProvider } from '@adelie/shared';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { authClient } from '#lib/auth-client.ts';
	import { toastIfError } from '#lib/client/auth-form.ts';
	import { linkProvider, SOCIAL_ERROR_PARAM, socialErrorMessage } from '#lib/client/social-auth.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { page } from '$app/state';

	interface AccountRow {
		id: string;
		providerId: string;
	}

	let { data } = $props();

	const RETURN_TO = '/settings/connected-accounts';

	let accounts = $state<AccountRow[]>([]);

	const socialProviderIds: readonly string[] = SOCIAL_PROVIDERS;
	const linked = $derived(accounts.filter((account) => socialProviderIds.includes(account.providerId)));
	/** Better Auth refuses to remove the last account, so the button says so up front. */
	const isOnlyAccount = $derived(accounts.length <= 1);
	const linkable = $derived(
		data.socialProviders.filter((provider: SocialProvider) => !accounts.some((account) => account.providerId === provider)),
	);
	const linkError = $derived(socialErrorMessage(page.url.searchParams.get(SOCIAL_ERROR_PARAM)));

	const labelOf = (providerId: string) => SOCIAL_PROVIDER_LABELS[providerId as SocialProvider] ?? providerId;

	async function load() {
		const { data: rows, error } = await authClient.listAccounts();
		if (toastIfError(error, 'Could not load your connected accounts.')) return;
		accounts = rows ?? [];
	}

	async function unlink(account: AccountRow) {
		if (isOnlyAccount) return;
		const { error } = await authClient.unlinkAccount({ accountId: account.id });
		if (toastIfError(error, 'Could not unlink the account.')) return;
		toast.success(`${labelOf(account.providerId)} unlinked.`);
		await load();
	}

	onMount(load);
</script>

<svelte:head>
	<title>Acme | Connected accounts</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Connected accounts</Card.Title>
		<Card.Description>Sign in with a provider instead of your password. The provider email must match your account email.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-6">
		{#if linkError}
			<p class="text-sm text-destructive" role="alert" data-testid="link-error">{linkError}</p>
		{/if}
		<ul class="grid gap-3" data-testid="connected-accounts">
			{#each linked as account (account.id)}
				<li class="flex items-center justify-between gap-4 rounded-md border p-3" data-testid="connected-account-row">
					<p class="text-sm font-medium">{labelOf(account.providerId)}</p>
					<div class="flex items-center gap-3">
						{#if isOnlyAccount}
							<span class="text-sm text-muted-foreground">Your only way to sign in</span>
						{/if}
						<Button variant="outline" size="sm" disabled={isOnlyAccount} onclick={() => unlink(account)}>Unlink</Button>
					</div>
				</li>
			{:else}
				<li class="text-sm text-muted-foreground">No connected accounts yet.</li>
			{/each}
		</ul>
		{#if linkable.length > 0}
			<div class="flex flex-wrap gap-2 border-t pt-6" data-testid="linkable-providers">
				{#each linkable as provider (provider)}
					<Button variant="outline" onclick={() => linkProvider(provider, RETURN_TO)}>Connect {SOCIAL_PROVIDER_LABELS[provider]}</Button>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
