<script lang="ts">
	import ResendVerificationButton from '$lib/components/auth/resend-verification-button.svelte';
	import * as Alert from '$lib/components/ui/alert';

	let { email }: { email: string } = $props();
</script>

<Alert.Root class="mx-4 mt-4 flex items-center justify-between gap-4 md:mx-10" data-testid="unverified-email-notice">
	<Alert.Description>Your email address, {email}, is not verified yet.</Alert.Description>
	<ResendVerificationButton {email} />
</Alert.Root>
