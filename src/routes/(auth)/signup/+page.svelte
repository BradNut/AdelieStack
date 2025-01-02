<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { superForm } from 'sveltekit-superforms';
	import * as Form from '$lib/components/ui/form';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { signupUsernameEmailDto } from '@/dtos/signup-username-email.dto';

	const { data } = $props();

	const signupForm = superForm(data.signupForm, {
	validators: zodClient(signupUsernameEmailDto),
	resetForm: false,
});

const { form: signupFormData, errors: signupErrors, enhance: signupEnhance } = signupForm;
</script>

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
		<Label for="username">Username <small>(required)</small></Label>
		<Input type="text" id="username" class={$signupErrors.username && "outline outline-destructive"} name="username"
						placeholder="Username" autocomplete="username" data-invalid={$signupErrors.username} bind:value={$signupFormData.username} />
		{#if $signupErrors.username}
			<p class="text-sm text-destructive">{$signupErrors.username}</p>
		{/if}
		<Label for="password">Password <small>(required)</small></Label>
		<Input type="password" id="password" class={$signupErrors.password && "outline outline-destructive"} name="password"
						placeholder="Password" autocomplete="new-password" data-invalid={$signupErrors.password}
						bind:value={$signupFormData.password} />
		{#if $signupErrors.password}
			<p class="text-sm text-destructive">{$signupErrors.password}</p>
		{/if}
		<Label for="confirm_password">Confirm Password <small>(required)</small></Label>
		<Input type="password" id="confirm_password" class={$signupErrors.confirm_password && "outline outline-destructive"}
						name="confirm_password" placeholder="Confirm Password" autocomplete="new-password"
						data-invalid={$signupErrors.confirm_password} bind:value={$signupFormData.confirm_password} />
		{#if $signupErrors.confirm_password}
			<p class="text-sm text-destructive">{$signupErrors.confirm_password}</p>
		{/if}
		<Label for="email">Email</Label>
		<Input type="email" id="email" class={$signupErrors.email && "outline outline-destructive"} name="email"
						placeholder="Email" autocomplete="email" data-invalid={$signupErrors.email} bind:value={$signupFormData.email} />
		{#if $signupErrors.email}
			<p class="text-sm text-destructive">{$signupErrors.email}</p>
		{/if}
		<div class="grid grid-cols-2">
			<Button type="submit">Signup</Button>
			<Button variant="link" class="text-secondary-foreground" href="/">or Cancel</Button>
		</div>
		{#if !$signupFormData.email}
			<Alert.Root>
				<Alert.Title level="h3">Heads up!</Alert.Title>
				<Alert.Description>
					Without an email address, you won't be able to reset your password. Submit only if you are sure. You can
					always add this later.
				</Alert.Description>
			</Alert.Root>
		{/if}
	</form>
{/snippet}
