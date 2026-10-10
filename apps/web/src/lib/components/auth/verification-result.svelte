<script lang="ts">
	import { AppRoute, VerificationKind } from '@adelie/shared';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { refreshSession } from '$lib/client/auth-form';
	import ResendVerificationButton from '$lib/components/auth/resend-verification-button.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	interface Props {
		/** What the link was for: shapes the wording and the recovery action. */
		kind: VerificationKind;
	}

	let { kind }: Props = $props();

	const COPY = {
		[VerificationKind.VERIFY]: {
			pageTitle: 'Email verified',
			success: 'Your email is verified',
			failure: 'This verification link is invalid or has expired',
		},
		[VerificationKind.CHANGE]: {
			pageTitle: 'Email changed',
			success: 'Your email address was changed',
			failure: 'This email change link is invalid or has expired',
		},
	} as const;

	const copy = $derived(COPY[kind]);
	const user = $derived(page.data.authedUser);

	/** Better Auth appends `?error=<CODE>` to the callback when it rejects the link. */
	const failed = $derived(page.url.searchParams.has('error'));

	// The layout's user predates the click, so reload it to show the new address / verified state.
	onMount(() => {
		if (!failed) refreshSession();
	});
</script>

<svelte:head>
	<title>Acme | {copy.pageTitle}</title>
</svelte:head>

<div class="mx-auto grid w-full max-w-md gap-4 py-10" data-testid="verification-result">
	<Card.Root>
		{#if failed}
			<Card.Header>
				<Card.Title data-testid="verification-failed">{copy.failure}</Card.Title>
				<Card.Description>Links only work once and for a limited time.</Card.Description>
			</Card.Header>
			<Card.Footer class="flex gap-2">
				{#if kind === VerificationKind.CHANGE}
					<Button href={AppRoute.SETTINGS_EMAIL}>Request a new email change</Button>
				{:else if user && !user.emailVerified}
					<ResendVerificationButton email={user.email} />
				{:else if !user}
					<Button href={AppRoute.LOGIN}>Sign in to request a new link</Button>
				{:else}
					<Button href={AppRoute.HOME}>Go home</Button>
				{/if}
			</Card.Footer>
		{:else}
			<Card.Header>
				<Card.Title data-testid="verification-success">{copy.success}</Card.Title>
				{#if user}
					<Card.Description>Your account email is <span data-testid="verified-email">{user.email}</span>.</Card.Description>
				{/if}
			</Card.Header>
			<Card.Footer>
				<Button href={user ? AppRoute.SETTINGS : AppRoute.LOGIN}>{user ? 'Go to settings' : 'Sign in'}</Button>
			</Card.Footer>
		{/if}
	</Card.Root>
</div>
