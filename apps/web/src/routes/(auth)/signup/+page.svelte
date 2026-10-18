<script lang="ts">
	import { AuthCallbackPath, signupDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage, passwordRejectionCodes, refreshSession } from '#lib/client/auth-form.ts';
	import { createCaptchaForm } from '#lib/client/captcha/captcha-form.svelte.ts';
	import CaptchaField from '#lib/components/auth/captcha-field.svelte';
	import PasswordFieldErrors from '#lib/components/auth/password-field-errors.svelte';
	import SocialButtons from '#lib/components/auth/social-buttons.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Form from '#lib/components/ui/form/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { captchaErrorMessage } from '#lib/utils/captcha-messages.ts';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const captcha = createCaptchaForm();

	const sf_signup = superForm(defaults(zod4(signupDto)), {
		SPA: true,
		validators: zod4Client(signupDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await captcha.attempt((fetchOptions) =>
				authClient.signUp.email(
					{
						name: form.data.name,
						email: form.data.email,
						password: form.data.password,
						callbackURL: AuthCallbackPath.EMAIL_VERIFIED,
					},
					fetchOptions,
				),
			);
			if (error) {
				form.data.password = '';
				form.data.confirm_password = '';
				const rules = passwordRejectionCodes(error);
				if (rules) return setError(form, 'password', rules);
				return setError(form, 'email', captchaErrorMessage(error) ?? authErrorMessage(error, 'Unable to sign up.'));
			}
			toast.success('Account created. Check your email to verify your address.');
			await refreshSession();
			await goto('/');
		},
	});

	const { form: signupForm, enhance: signupEnhance } = sf_signup;
</script>

<svelte:head>
	<title>Acme | Sign Up</title>
</svelte:head>

<Card.Root class="mx-auto mt-24 max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Signup for an account</Card.Title>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:signupEnhance class="grid gap-2 mt-4">
			<Form.Field form={sf_signup} name="name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Name</Form.Label>
						<Input {...props} type="text" placeholder="Name" autocomplete="name" bind:value={$signupForm.name} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field form={sf_signup} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Email</Form.Label>
						<Input {...props} type="email" placeholder="Email" autocomplete="email" bind:value={$signupForm.email} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field form={sf_signup} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Password</Form.Label>
						<Input
							{...props}
							type="password"
							placeholder="Password"
							autocomplete="new-password"
							bind:value={$signupForm.password}
						/>
					{/snippet}
				</Form.Control>
				<PasswordFieldErrors />
			</Form.Field>
			<Form.Field form={sf_signup} name="confirm_password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Confirm Password</Form.Label>
						<Input
							{...props}
							type="password"
							placeholder="Confirm Password"
							autocomplete="new-password"
							bind:value={$signupForm.confirm_password}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<CaptchaField bind:this={captcha.field} onchange={captcha.setToken} />
			<div class="grid grid-cols-2">
				<Form.Button type="submit">Signup</Form.Button>
				<Button variant="link" class="text-secondary-foreground" href="/">or Cancel</Button>
			</div>
		</form>
		<div class="mt-4">
			<SocialButtons providers={data.socialProviders} />
		</div>
		<div class="mt-4 text-center text-sm">
			By registering, you agree to our <a href="/terms" class="underline">Terms of Service</a>
		</div>
	</Card.Content>
</Card.Root>
