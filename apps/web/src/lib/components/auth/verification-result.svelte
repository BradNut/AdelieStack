<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { refreshSession } from '$lib/client/auth-form';
	import ResendVerificationButton from '$lib/components/auth/resend-verification-button.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	interface Props {
		/** What the link was for: shapes the wording and the recovery action. */
		kind: 'verify' | 'change';
		user: { email: string; emailVerified: boolean } | null;
	}

	let { kind, user }: Props = $props();

	/** Better Auth appends `?error=<CODE>` to the callback when it rejects the link. */
	const failed = $derived(page.url.searchParams.has('error'));

	// The layout's user predates the click, so reload it to show the new address / verified state.
	onMount(() => {
		if (!failed) refreshSession();
	});
</script>

<div class="mx-auto grid w-full max-w-md gap-4 py-10" data-testid="verification-result">
	<Card.Root>
		{#if failed}
			<Card.Header>
				<Card.Title data-testid="verification-failed">
					{kind === 'change' ? 'This email change link is invalid or has expired' : 'This verification link is invalid or has expired'}
				</Card.Title>
				<Card.Description>Links only work once and for a limited time.</Card.Description>
			</Card.Header>
			<Card.Footer class="flex gap-2">
				{#if kind === 'change'}
					<Button href="/settings/email">Request a new email change</Button>
				{:else if user && !user.emailVerified}
					<ResendVerificationButton email={user.email} />
				{:else if !user}
					<Button href="/login">Sign in to request a new link</Button>
				{:else}
					<Button href="/">Go home</Button>
				{/if}
			</Card.Footer>
		{:else}
			<Card.Header>
				<Card.Title data-testid="verification-success">{kind === 'change' ? 'Your email address was changed' : 'Your email is verified'}</Card.Title>
				{#if user}
					<Card.Description>Your account email is <span data-testid="verified-email">{user.email}</span>.</Card.Description>
				{/if}
			</Card.Header>
			<Card.Footer>
				<Button href={user ? '/settings' : '/login'}>{user ? 'Go to settings' : 'Sign in'}</Button>
			</Card.Footer>
		{/if}
	</Card.Root>
</div>
