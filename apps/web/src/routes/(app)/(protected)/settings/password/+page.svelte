<script lang="ts">
	import { changePasswordDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '$lib/auth-client';
	import { authErrorMessage } from '$lib/client/auth-form';
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';

	const sf_password = superForm(defaults(zod4(changePasswordDto)), {
		SPA: true,
		validators: zod4Client(changePasswordDto),
		resetForm: true,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.changePassword({
				currentPassword: form.data.current_password,
				newPassword: form.data.new_password,
				revokeOtherSessions: true,
			});
			if (error) return setError(form, 'current_password', authErrorMessage(error, 'Current password is incorrect.'));
			toast.success('Password changed. Your other sessions were signed out.');
		},
	});

	const { form: passwordForm, enhance: passwordEnhance } = sf_password;
</script>

<svelte:head>
	<title>Acme | Password</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Change Password</Card.Title>
	</Card.Header>
	<form method="POST" use:passwordEnhance>
		<Card.Content class="grid gap-2">
			<Form.Field form={sf_password} name="current_password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label for="current_password">Current password</Form.Label>
						<Input {...props} type="password" autocomplete="current-password" bind:value={$passwordForm.current_password} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field form={sf_password} name="new_password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label for="new_password">New password</Form.Label>
						<Input {...props} type="password" autocomplete="new-password" bind:value={$passwordForm.new_password} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field form={sf_password} name="confirm_password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label for="confirm_password">Confirm new password</Form.Label>
						<Input {...props} type="password" autocomplete="new-password" bind:value={$passwordForm.confirm_password} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
		<Card.Footer class="border-t px-6 py-4">
			<Form.Button>Change Password</Form.Button>
		</Card.Footer>
	</form>
</Card.Root>
