<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
	import * as Form from '$lib/components/ui/form/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { receive, send } from '$lib/utils/pageCrossfade';
	import { resetPasswordEmailDto, resetPasswordTokenDto } from '$lib/dtos/reset-password';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';

	const { data } = $props();

	let showTokenVerification = $state(false);

	const emailResetForm = superForm(data.emailForm, {
		validators: zodClient(resetPasswordEmailDto),
		resetForm: false,
		onUpdated: ({ form }) => {
			if (form.valid) {
				showTokenVerification = true;
				$emailFormData.email = form.data.email;
			}
		},
	});

	const tokenVerificationForm = superForm(data.tokenForm, {
		validators: zodClient(resetPasswordTokenDto),
		resetForm: false,
	});

	const { form: emailFormData, enhance: emailResetEnhance } = emailResetForm;
	const { form: tokenFormData, enhance: tokenEnhance } = tokenVerificationForm;
</script>

<Card.Root class="mx-auto max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Reset Password</Card.Title>
		<Card.Description>Enter your email to reset your password</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="grid gap-4">
			{#if showTokenVerification}
				{@render tokenForm()}
			{:else}
				{@render emailForm()}
			{/if}
		</div>
	</Card.Content>
</Card.Root>

{#snippet emailForm()}
	<form method="POST" action="?/passwordReset" use:emailResetEnhance class="grid gap-4">
		<Form.Field form={emailResetForm} name="email">
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

{#snippet tokenForm()}
	<form method="POST" action="?/verifyToken" use:tokenEnhance class="space-y-4">
		<input hidden value={$tokenFormData.token} name="email" />
		<Form.Field form={tokenVerificationForm} name="token">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label for="token">Enter the token that was sent to your email</Form.Label>
					<InputOTP.Root maxlength={6} {...props} bind:value={$tokenFormData.token}>
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