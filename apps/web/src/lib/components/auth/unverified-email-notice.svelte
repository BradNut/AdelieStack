<script lang="ts">
	import ResendVerificationButton from '$lib/components/auth/resend-verification-button.svelte';
	import * as Alert from '$lib/components/ui/alert';

	interface Props {
		email: string;
	}

	let { email }: Props = $props();
</script>

<Alert.Root
	class="mx-4 mt-4 flex w-auto flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-4 md:mx-10"
	data-testid="unverified-email-notice"
>
	<Alert.Description class="min-w-0 break-words">Your email address, {email}, is not verified yet.</Alert.Description>
	<div class="shrink-0">
		<ResendVerificationButton {email} />
	</div>
</Alert.Root>
