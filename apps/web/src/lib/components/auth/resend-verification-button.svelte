<script lang="ts">
	import { AuthCallbackPath } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { authClient } from '$lib/auth-client';
	import { toastIfError } from '$lib/client/auth-form';
	import { Button } from '$lib/components/ui/button';

	let { email, variant = 'outline' }: { email: string; variant?: 'outline' | 'link' } = $props();

	let sending = $state(false);

	async function resend() {
		sending = true;
		const { error } = await authClient.sendVerificationEmail({ email, callbackURL: AuthCallbackPath.EMAIL_VERIFIED });
		sending = false;
		if (toastIfError(error, 'Could not send the verification email.')) return;
		toast.success(`Verification email sent to ${email}.`);
	}
</script>

<Button {variant} size="sm" disabled={sending} onclick={resend} data-testid="resend-verification">Resend verification email</Button>
