<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Form from '$lib/components/ui/form/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { resetPasswordCodeDto, resetPasswordEmailDto } from '$lib/dtos/reset-password';
	import { resetPasswordNewPasswordDto } from '$lib/dtos/reset-password/reset-password-new-password.dto';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';

	const { data } = $props();

	let resetEmailStep = $state('email-reset');

	const sf_email_reset = superForm(data.emailForm, {
		validators: zodClient(resetPasswordEmailDto),
		resetForm: false,
		onUpdated: ({ form }) => {
			if (form.valid) {
				resetEmailStep = 'token-verification';
				$tokenFormData.email = form.data.email;
			}
		},
	});

	const sf_token_verification = superForm(data.tokenForm, {
		validators: zodClient(resetPasswordCodeDto),
		resetForm: false,
		onUpdated: ({ form }) => {
			if (form.valid) {
				resetEmailStep = 'new-password';
				$newPasswordFormData.email = form.data.email;
			}
		},
	});

	const sf_new_password = superForm(data.newPasswordForm, {
  validators: zodClient(resetPasswordNewPasswordDto),
  resetForm: false,
});

	const { form: emailFormData, enhance: emailResetEnhance } = sf_email_reset;
	const { form: tokenFormData, enhance: tokenEnhance } = sf_token_verification;
	const { form: newPasswordFormData, enhance: newPasswordEnhance } = sf_new_password;
</script>

<svelte:head>
	<title>Acme | Reset Password</title>
</svelte:head>

<Card.Root class="mx-auto max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Reset Password</Card.Title>
		<Card.Description>Enter your email to reset your password</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="grid gap-4">
			{#if resetEmailStep === 'email-reset'}
				{@render emailForm()}
			{:else if resetEmailStep === 'token-verification'}
				{@render codeForm()}
			{:else}
				{@render resetPasswordForm()}
			{/if}
		</div>
	</Card.Content>
</Card.Root>

{#snippet emailForm()}
	<form method="POST" action="?/passwordResetRequest" use:emailResetEnhance class="grid gap-4">
		<Form.Field form={sf_email_reset} name="email">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label for="email">Email</Form.Label>
					<Input
						{...props}
						type="email"
						placeholder="you@awesome.com"
						bind:value={$emailFormData.email}
					/>
				{/snippet}
			</Form.Control>
			<Form.Description />
			<Form.FieldErrors />
		</Form.Field>
		<Button type="submit" class="w-full">Continue with Email</Button>
	</form>
{/snippet}

{#snippet codeForm()}
	<form method="POST" action="?/verifyCode" use:tokenEnhance class="space-y-4">
		<input hidden value={$tokenFormData.email} name="email" />
		<Form.Field form={sf_token_verification} name="code">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label for="code">Enter the token that was sent to your email</Form.Label>
					<InputOTP.Root maxlength={6} {...props} bind:value={$tokenFormData.code}>
						{#snippet children({ cells })}
							<InputOTP.Group>
								{#each cells as cell}
									<InputOTP.Slot {cell} />
								{/each}
							</InputOTP.Group>
						{/snippet}
					</InputOTP.Root>
				{/snippet}
			</Form.Control>
			<Form.Description />
			<Form.FieldErrors />
		</Form.Field>
		<Button class="w-full" type="submit">Submit</Button>
	</form>
{/snippet}

{#snippet resetPasswordForm()}
	<form method="POST" action="?/resetPassword" use:newPasswordEnhance class="space-y-4">
		<input hidden value={$newPasswordFormData.email} name="email" />
		<Form.Field form={sf_new_password} name="password">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label for="password">Password</Form.Label>
					<Input
						{...props}
						type="password"
						id="password"
						name="password"
						bind:value={$newPasswordFormData.password}
					/>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Field form={sf_new_password} name="confirm_password">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label for="confirm_password">Confirm Password</Form.Label>
					<Input
						{...props}
						type="password"
						id="confirm_password"
						name="confirm_password"
						bind:value={$newPasswordFormData.confirm_password}
					/>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Button class="w-full" type="submit">Submit</Button>
	</form>
{/snippet}
