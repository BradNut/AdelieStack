<script lang="ts">
	import { AuthCallbackPath } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { authClient } from '$lib/auth-client';
	import { toastIfError } from '$lib/client/auth-form';
	import { createCaptchaForm } from '$lib/client/captcha/captcha-form.svelte';
	import CaptchaField from '$lib/components/auth/captcha-field.svelte';
	import { Button } from '$lib/components/ui/button';
	import { captchaErrorMessage } from '$lib/utils/captcha-messages';

	interface Props {
		email: string;
	}

	let { email }: Props = $props();

	let sending = $state(false);
	const captcha = createCaptchaForm();

	async function resend() {
		sending = true;
		const { error } = await authClient.sendVerificationEmail(
			{ email, callbackURL: AuthCallbackPath.EMAIL_VERIFIED },
			captcha.fetchOptions(),
		);
		sending = false;
		captcha.afterAttempt();
		const captchaMessage = captchaErrorMessage(error);
		if (captchaMessage) return void toast.error(captchaMessage);
		if (toastIfError(error, 'Could not send the verification email.')) return;
		toast.success(`Verification email sent to ${email}.`);
	}
</script>

<CaptchaField bind:this={captcha.field} onchange={captcha.setToken} />
<Button variant="outline" size="sm" disabled={sending} onclick={resend} data-testid="resend-verification">Resend verification email</Button>
