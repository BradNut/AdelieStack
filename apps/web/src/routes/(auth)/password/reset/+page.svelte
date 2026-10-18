<script lang="ts">
	import { resetPasswordEmailDto, resetPasswordNewPasswordDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage, passwordRejectionCodes } from '#lib/client/auth-form.ts';
	import { createCaptchaForm } from '#lib/client/captcha/captcha-form.svelte.ts';
	import CaptchaField from '#lib/components/auth/captcha-field.svelte';
	import PasswordFieldErrors from '#lib/components/auth/password-field-errors.svelte';
	import * as Alert from '#lib/components/ui/alert/index.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Form from '#lib/components/ui/form/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { captchaErrorMessage } from '#lib/utils/captcha-messages.ts';
	import { goto } from '$app/navigation';

	const { data } = $props();

	const RESET_PATH = '/password/reset';
	let emailSent = $state(false);
	const captcha = createCaptchaForm();

	const sf_email = superForm(defaults(zod4(resetPasswordEmailDto)), {
		SPA: true,
		validators: zod4Client(resetPasswordEmailDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await captcha.attempt((fetchOptions) =>
				authClient.requestPasswordReset(
					{
						email: form.data.email,
						redirectTo: RESET_PATH,
					},
					fetchOptions,
				),
			);
			if (error) return setError(form, 'email', captchaErrorMessage(error) ?? authErrorMessage(error));
			emailSent = true;
		},
	});

	const sf_new_password = superForm(defaults(zod4(resetPasswordNewPasswordDto)), {
		SPA: true,
		validators: zod4Client(resetPasswordNewPasswordDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid || !data.token) return;
			const { error } = await authClient.resetPassword({
				newPassword: form.data.password,
				token: data.token,
			});
			if (error) return setError(form, 'password', passwordRejectionCodes(error) ?? authErrorMessage(error, 'Unable to reset your password.'));
			toast.success('Successfully reset password!');
			await goto('/login');
		},
	});

	const { form: emailForm, enhance: emailEnhance } = sf_email;
	const { form: newPasswordForm, enhance: newPasswordEnhance } = sf_new_password;
</script>

<svelte:head>
	<title>Acme | Reset Password</title>
</svelte:head>

<Card.Root class="mx-auto mt-24 max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Reset your password</Card.Title>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if data.token}
			<form method="POST" use:newPasswordEnhance class="grid gap-2">
				<Form.Field form={sf_new_password} name="password">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>New password</Form.Label>
							<Input {...props} type="password" autocomplete="new-password" bind:value={$newPasswordForm.password} />
						{/snippet}
					</Form.Control>
					<PasswordFieldErrors />
				</Form.Field>
				<Form.Field form={sf_new_password} name="confirm_password">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Confirm password</Form.Label>
							<Input
								{...props}
								type="password"
								autocomplete="new-password"
								bind:value={$newPasswordForm.confirm_password}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Button>Reset password</Form.Button>
			</form>
		{:else if emailSent}
			<Alert.Root>
				<Alert.Title>Check your email</Alert.Title>
				<Alert.Description>
					If an account exists for that address, we sent a link to reset your password.
				</Alert.Description>
			</Alert.Root>
		{:else}
			{#if data.linkError}
				<Alert.Root variant="destructive">
					<Alert.Title>That link did not work</Alert.Title>
					<Alert.Description>The reset link is invalid or has expired. Request a new one below.</Alert.Description>
				</Alert.Root>
			{/if}
			<form method="POST" use:emailEnhance class="grid gap-2">
				<Form.Field form={sf_email} name="email">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Email</Form.Label>
							<Input {...props} type="email" autocomplete="email" bind:value={$emailForm.email} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<CaptchaField bind:this={captcha.field} onchange={captcha.setToken} />
				<div class="grid grid-cols-2">
					<Form.Button>Send reset link</Form.Button>
					<Button variant="link" class="text-secondary-foreground" href="/login">Back to login</Button>
				</div>
			</form>
		{/if}
	</Card.Content>
</Card.Root>
