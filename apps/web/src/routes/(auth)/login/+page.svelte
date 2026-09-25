<script lang="ts">
	import { signinDto } from '@adelie/shared';
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { superForm } from "sveltekit-superforms/client";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Form from "$lib/components/ui/form";
	import { Input } from "$lib/components/ui/input";
	import { receive, send } from "$lib/utils/pageCrossfade";

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	const { showOAuthButtons } = data;

	// svelte-ignore state_referenced_locally
	const sf_login_password = superForm(data.loginForm, {
		validators: zod4Client(signinDto),
		resetForm: false,
	});

	const { form: loginForm, enhance: loginEnhance, errors: loginErrors } = sf_login_password;
</script>

<svelte:head>
	<title>Acme | Login</title>
</svelte:head>

<Card.Root class="mx-auto mt-24 max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Log into your account</Card.Title>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{@render usernameEmailForm()}
		{#if showOAuthButtons}
			<span class="text-center text-sm text-muted-foreground">or sign in with</span>
			{@render oAuthButtons()}
		{/if}
		<p class="px-8 py-4 text-center text-sm text-muted-foreground">
			By clicking continue, you agree to our
			<a href="/terms" class="underline underline-offset-4 hover:text-primary"> Terms of Use </a>
			and
			<a href="/privacy-policy" class="underline underline-offset-4 hover:text-primary"> Privacy Policy </a>.
		</p>
	</Card.Content>
</Card.Root>

{#snippet usernameEmailForm()}
	<form method="POST" use:loginEnhance>
		<Form.Field form={sf_login_password} name="identifier">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label for="identifier">Username / Email</Form.Label>
					<Input
						{...props}
						autocomplete="username"
						placeholder="john.doe@example.com"
						bind:value={$loginForm.identifier}
					/>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Field form={sf_login_password} name="password">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label for="password">Password</Form.Label>
					<Input
						{...props}
						autocomplete="current-password"
						placeholder={"••••••••"}
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
{/snippet}

{#snippet oAuthButtons()}
	<div class="grid gap-4">
		<Button href="/login/google" variant="outline" class="w-full flex items-center gap-2">Google</Button>
	</div>
{/snippet}
