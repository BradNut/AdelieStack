<script lang="ts">
	import { signinDto } from '@adelie/shared';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { authErrorMessage, refreshSession, toastIfError } from '$lib/client/auth-form';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';

	let { data } = $props();

	const sf_login = superForm(defaults(zod4(signinDto)), {
		SPA: true,
		validators: zod4Client(signinDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { data: result, error } = await authClient.signIn.email({
				email: form.data.email,
				password: form.data.password,
			});
			if (error) {
				form.data.password = '';
				return setError(form, 'email', authErrorMessage(error, 'Invalid email or password.'));
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
						<Form.Label for="email">Email</Form.Label>
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
						<Form.Label for="password">Password</Form.Label>
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
			<div class="grid grid-cols-2">
				<Form.Button>Login</Form.Button>
				<Button variant="link" class="text-secondary-foreground" href="/password/reset">Forgot Password?</Button>
			</div>
		</form>
		<span class="text-center text-sm text-muted-foreground">or</span>
		<Button variant="outline" class="w-full" onclick={signInWithPasskey}>Sign in with a passkey</Button>
		{#if data.showOAuthButtons}
			<span class="text-center text-sm text-muted-foreground">or sign in with</span>
			<div class="grid gap-4">
				<Button href="/login/google" variant="outline" class="w-full flex items-center gap-2">Google</Button>
			</div>
		{/if}
		<p class="px-8 py-4 text-center text-sm text-muted-foreground">
			By clicking continue, you agree to our
			<a href="/terms" class="underline underline-offset-4 hover:text-primary"> Terms of Use </a>
			and
			<a href="/privacy-policy" class="underline underline-offset-4 hover:text-primary"> Privacy Policy </a>.
		</p>
	</Card.Content>
</Card.Root>
