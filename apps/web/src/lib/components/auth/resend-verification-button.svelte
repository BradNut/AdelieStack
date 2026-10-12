<script lang="ts">
	import { AuthCallbackPath } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { authClient } from '$lib/auth-client';
	import { toastIfError } from '$lib/client/auth-form';
	import { captchaFetchOptions } from '$lib/client/captcha/request';
	import CaptchaField from '$lib/components/auth/captcha-field.svelte';
	import { Button } from '$lib/components/ui/button';
	import { captchaErrorMessage } from '$lib/utils/captcha-messages';

	interface Props {
		email: string;
	}

	let { email }: Props = $props();

	let sending = $state(false);
	let captchaToken = $state('');
	let captcha = $state<ReturnType<typeof CaptchaField>>();

	async function resend() {
		sending = true;
		const { error } = await authClient.sendVerificationEmail(
			{ email, callbackURL: AuthCallbackPath.EMAIL_VERIFIED },
			captchaFetchOptions(captchaToken),
		);
		sending = false;
		// A Captcha Token is single-use, so a new challenge is needed whatever the outcome.
		captcha?.reset();
		const captchaMessage = captchaErrorMessage(error);
		if (captchaMessage) return void toast.error(captchaMessage);
		if (toastIfError(error, 'Could not send the verification email.')) return;
		toast.success(`Verification email sent to ${email}.`);
	}
</script>

<CaptchaField bind:this={captcha} onchange={(token) => (captchaToken = token)} />
<Button variant="outline" size="sm" disabled={sending} onclick={resend} data-testid="resend-verification">Resend verification email</Button>
