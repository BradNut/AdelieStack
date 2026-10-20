<script lang="ts">
	import { AppRoute, isSocialProvider, SOCIAL_ERROR_PARAM, type SocialProvider } from '@adelie/shared';
	import { authClient } from '#lib/auth-client.ts';
	import { toastIfError } from '#lib/client/auth-form.ts';
	import { notifyUnlinked, providerLabel } from '#lib/client/connected-accounts.ts';
	import { withFreshSession } from '#lib/client/fresh-session.svelte.ts';
	import { ReplayActionKey, replayProgress } from '#lib/client/reauth-replay.svelte.ts';
	import { linkProvider, socialErrorMessage } from '#lib/client/social-auth.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { page } from '$app/state';

	interface AccountRow {
		id: string;
		providerId: string;
	}

	let { data } = $props();

	let accounts = $state<AccountRow[]>([]);

	const linked = $derived(accounts.filter((account) => isSocialProvider(account.providerId)));
	/** Better Auth refuses to remove the last account, so the button says so up front. */
	const isOnlyAccount = $derived(accounts.length <= 1);
	const linkable = $derived(
		data.socialProviders.filter((provider: SocialProvider) => !accounts.some((account) => account.providerId === provider)),
	);
	const linkError = $derived(socialErrorMessage(page.url.searchParams.get(SOCIAL_ERROR_PARAM)));

	async function load() {
		const { data: rows, error } = await authClient.listAccounts();
		if (toastIfError(error, m.connected_accounts_load_failed())) return;
		accounts = rows ?? [];
	}

	async function unlink(account: AccountRow) {
		if (isOnlyAccount) return;
		const { error } = await withFreshSession(() => authClient.unlinkAccount({ accountId: account.id }), {
			key: ReplayActionKey.UNLINK_ACCOUNT,
			args: { accountId: account.id },
		});
		if (!notifyUnlinked(error, providerLabel(account.providerId))) return;
		await load();
	}

	// Loads on mount, and again when an action replayed after a provider re-authentication changed the accounts.
	$effect(() => {
		// Read only so the effect re-runs when the count changes; the value itself is not used.
		void replayProgress.replayedCount;
		load();
	});
</script>

<svelte:head>
	<title>Acme | {m.connected_accounts_title()}</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.connected_accounts_title()}</Card.Title>
		<Card.Description>{m.connected_accounts_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-6">
		{#if linkError}
			<p class="text-sm text-destructive" role="alert" data-testid="link-error">{linkError}</p>
		{/if}
		<ul class="grid gap-3" data-testid="connected-accounts">
			{#each linked as account (account.id)}
				<li class="flex items-center justify-between gap-4 rounded-md border p-3" data-testid="connected-account-row">
					<p class="text-sm font-medium">{providerLabel(account.providerId)}</p>
					<div class="flex items-center gap-3">
						{#if isOnlyAccount}
							<span class="text-sm text-muted-foreground">{m.connected_accounts_only_way()}</span>
						{/if}
						<Button variant="outline" size="sm" disabled={isOnlyAccount} onclick={() => unlink(account)}>{m.connected_accounts_unlink()}</Button>
					</div>
				</li>
			{:else}
				<li class="text-sm text-muted-foreground">{m.connected_accounts_none()}</li>
			{/each}
		</ul>
		{#if linkable.length > 0}
			<div class="flex flex-wrap gap-2 border-t pt-6" data-testid="linkable-providers">
				{#each linkable as provider (provider)}
					<Button variant="outline" onclick={() => linkProvider(provider, AppRoute.SETTINGS_CONNECTED_ACCOUNTS)}>{m.connected_accounts_connect({ provider: providerLabel(provider) })}</Button>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
