<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { receive, send } from "$lib/utils/pageCrossfade";
	import { superForm } from 'sveltekit-superforms';
	import * as Form from '$lib/components/ui/form';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { signupUsernameEmailDto } from '$lib/dtos/signup/signup-username-email.dto.js';

	const { data } = $props();

	const sf_signup = superForm(data.signupForm, {
	validators: zodClient(signupUsernameEmailDto),
	resetForm: false,
});

const { form: signupForm, errors: signupErrors, enhance: signupEnhance } = sf_signup;
</script>

<svelte:head>
	<title>Acme | Sign Up</title>
</svelte:head>

<Card.Root class="mx-auto mt-24 max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Signup for an account</Card.Title>
	</Card.Header>
	<Card.Content>
		<div class="grid gap-4">
			{@render signUpForm()}
		</div>
		<div class="mt-4 text-center text-sm">
			By registering, you agree to our <a href="##" class="underline">Terms of Service</a>
		</div>
	</Card.Content>
</Card.Root>

{#snippet signUpForm()}
	<form method="POST" action="/signup" use:signupEnhance class="grid gap-2 mt-4">
		<Form.Field form={sf_signup} name="username">
			<Form.Control>
				{#snippet children({ props })}
					<Label for="username">Username <small>(required)</small></Label>
					<Input {...props} type="text" id="username" class={$signupErrors.username && "outline outline-destructive"} name="username" placeholder="Username" autocomplete="username" data-invalid={$signupErrors.username} bind:value={$signupForm.username} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Field form={sf_signup} name="password">
			<Form.Control>
				{#snippet children({ props })}
					<Label for="password">Password <small>(required)</small></Label>
					<Input {...props} type="password" id="password" class={$signupErrors.password && "outline outline-destructive"} name="password" placeholder="Password" autocomplete="new-password" data-invalid={$signupErrors.password}
						bind:value={$signupForm.password} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Field form={sf_signup} name="confirm_password">
			<Form.Control>
				{#snippet children({ props })}
					<Label for="confirm_password">Confirm Password <small>(required)</small></Label>
					<Input {...props} type="password" id="confirm_password" class={$signupErrors.confirm_password && "outline outline-destructive"} name="confirm_password" placeholder="Confirm Password" autocomplete="new-password" data-invalid={$signupErrors.confirm_password} bind:value={$signupForm.confirm_password} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Field form={sf_signup} name="email">
			<Form.Control>
				{#snippet children({ props })}
					<Label for="email">Email</Label>
					<Input {...props} type="email" id="email" class={$signupErrors.email && "outline outline-destructive"} name="email" placeholder="Email" autocomplete="email" data-invalid={$signupErrors.email} bind:value={$signupForm.email} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<div class="grid grid-cols-2">
			<Form.Button type="submit">Signup</Form.Button>
			<Button variant="link" class="text-secondary-foreground" href="/">or Cancel</Button>
		</div>
		{#if !$signupForm.email}
			<Alert.Root>
				<Alert.Title level={3}>Heads up!</Alert.Title>
				<Alert.Description>
					Without an email address, you won't be able to reset your password. Submit only if you are sure. You can
					always add this later.
				</Alert.Description>
			</Alert.Root>
		{/if}
	</form>
{/snippet}
