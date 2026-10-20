<script lang="ts">
	import { refreshSession } from '#lib/client/auth-form.ts';
	import { returnPathFrom } from '#lib/client/return-path.ts';
	import TwoFactorChallenge from '#lib/components/auth/two-factor-challenge.svelte';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	async function finishSignIn() {
		await refreshSession();
		await goto(returnPathFrom(page.url.searchParams));
	}
</script>

<svelte:head>
	<title>Acme | Two-factor verification</title>
</svelte:head>

<Card.Root class="mx-auto mt-24 max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Two-factor verification</Card.Title>
		<Card.Description>Confirm it's you to finish signing in.</Card.Description>
	</Card.Header>
	<Card.Content>
		<TwoFactorChallenge onVerified={finishSignIn} />
	</Card.Content>
</Card.Root>
