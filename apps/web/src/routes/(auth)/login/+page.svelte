<script lang="ts">
	import { isLoginMethod, LoginMethod, signinDto } from '@adelie/shared';
	import { onMount } from 'svelte';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage, refreshSession, toastIfError } from '#lib/client/auth-form.ts';
	import { createCaptchaForm } from '#lib/client/captcha/captcha-form.svelte.ts';
	import { SOCIAL_ERROR_PARAM, socialErrorMessage } from '#lib/client/social-auth.ts';
	import CaptchaField from '#lib/components/auth/captcha-field.svelte';
	import LastUsedBadge from '#lib/components/auth/last-used-badge.svelte';
	import SocialButtons from '#lib/components/auth/social-buttons.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Form from '#lib/components/ui/form/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { captchaErrorMessage } from '#lib/utils/captcha-messages.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	const captcha = createCaptchaForm();
	const socialError = $derived(socialErrorMessage(page.url.searchParams.get(SOCIAL_ERROR_PARAM)));

	// The hint lives in a browser cookie, so it is read after mount; the server render shows none.
	let lastMethod = $state<LoginMethod | null>(null);
	onMount(() => {
		const used = authClient.getLastUsedLoginMethod();
		lastMethod = isLoginMethod(used) ? used : null;
	});

	const sf_login = superForm(defaults(zod4(signinDto)), {
		SPA: true,
		validators: zod4Client(signinDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { data: result, error } = await captcha.attempt((fetchOptions) =>
				authClient.signIn.email(
					{
						email: form.data.email,
						password: form.data.password,
					},
					fetchOptions,
				),
			);
			if (error) {
				form.data.password = '';
				return setError(form, 'email', captchaErrorMessage(error) ?? authErrorMessage(error, 'Invalid email or password.'));
			}
			// A user with two-factor enabled is redirected by the client plugin instead.
			if (result && 'twoFactorRedirect' in result && result.twoFactorRedirect) return;
			await refreshSession();
			await goto('/');
		},
	});

	const { form: loginForm, enhance: loginEnhance } = sf_login;

	async function signInWithPasskey() {
		const { error } = await authClient.signIn.passkey();
		if (toastIfError(error, 'Passkey sign-in failed.')) return;
		await refreshSession();
		await goto('/');
	}
</script>

<svelte:head>
	<title>Acme | Login</title>
</svelte:head>

<Card.Root class="mx-auto mt-24 max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Log into your account</Card.Title>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<form method="POST" use:loginEnhance>
			<Form.Field form={sf_login} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Email</Form.Label>
						<Input
							{...props}
							type="email"
							autocomplete="username webauthn"
							placeholder="john.doe@example.com"
							bind:value={$loginForm.email}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field form={sf_login} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Password</Form.Label>
						<Input
							{...props}
							autocomplete="current-password"
							placeholder={'••••••••'}
							type="password"
							bind:value={$loginForm.password}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<CaptchaField bind:this={captcha.field} onchange={captcha.setToken} />
			<div class="grid grid-cols-2">
				<div class="flex items-center gap-2">
					<Form.Button>Login</Form.Button>
					<LastUsedBadge method={LoginMethod.PASSWORD} {lastMethod} />
				</div>
				<Button variant="link" class="text-secondary-foreground" href="/password/reset">Forgot Password?</Button>
			</div>
		</form>
		<span class="text-center text-sm text-muted-foreground">{m.auth_or()}</span>
		<Button variant="outline" class="w-full" onclick={signInWithPasskey}>
			{m.auth_sign_in_with_passkey()}
			<LastUsedBadge method={LoginMethod.PASSKEY} {lastMethod} />
		</Button>
		{#if socialError}
			<p class="text-center text-sm text-destructive" role="alert" data-testid="social-error">{socialError}</p>
		{/if}
		<SocialButtons providers={data.socialProviders} {lastMethod} />
		<p class="px-8 py-4 text-center text-sm text-muted-foreground">
			By clicking continue, you agree to our
			<a href="/terms" class="underline underline-offset-4 hover:text-primary"> Terms of Use </a>
			and
			<a href="/privacy-policy" class="underline underline-offset-4 hover:text-primary"> Privacy Policy </a>.
		</p>
	</Card.Content>
</Card.Root>
