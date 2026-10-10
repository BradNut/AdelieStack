<script lang="ts">
	import { AuthCallbackPath, changeEmailDto } from '@adelie/shared';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '$lib/auth-client';
	import { authErrorMessage } from '$lib/client/auth-form';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';

	const { data } = $props();

	/** The address a confirmation was sent to, until the user follows the link. */
	let pendingEmail = $state<string | null>(null);

	const sf_email = superForm(defaults(zod4(changeEmailDto)), {
		SPA: true,
		validators: zod4Client(changeEmailDto),
		resetForm: true,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.changeEmail({ newEmail: form.data.email, callbackURL: AuthCallbackPath.EMAIL_CHANGED });
			if (error) return setError(form, 'email', authErrorMessage(error, 'Could not start the email change.'));
			pendingEmail = form.data.email;
		},
	});

	const { form: emailForm, enhance: emailEnhance } = sf_email;
</script>

<svelte:head>
	<title>Acme | Email</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Email address</Card.Title>
		<Card.Description>
			Your account email is <span data-testid="current-email">{data.authedUser?.email}</span>.
		</Card.Description>
	</Card.Header>
	<form method="POST" use:emailEnhance>
		<Card.Content class="grid gap-4">
			{#if pendingEmail}
				<Alert.Root data-testid="email-change-pending">
					<Alert.Description>
						If {pendingEmail} can be used, we sent a confirmation link there. Your email stays {data.authedUser?.email} until you follow it.
					</Alert.Description>
				</Alert.Root>
			{/if}
			<Form.Field form={sf_email} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label for="email">New email</Form.Label>
						<Input {...props} type="email" autocomplete="email" bind:value={$emailForm.email} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
		<Card.Footer class="border-t px-6 py-4">
			<Form.Button>Change email</Form.Button>
		</Card.Footer>
	</form>
</Card.Root>
