<script lang="ts">
	import { deleteAccountDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { authErrorMessage, refreshSession } from '$lib/client/auth-form';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';

	let open = $state(false);

	const sf_delete = superForm(defaults(zod4(deleteAccountDto)), {
		SPA: true,
		validators: zod4Client(deleteAccountDto),
		resetForm: true,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.deleteUser({ password: form.data.password });
			if (error) return setError(form, 'password', authErrorMessage(error, 'Password is incorrect.'));
			open = false;
			await refreshSession();
			await goto('/');
			toast.success('Your account was deleted.');
		},
	});

	const { form: deleteForm, enhance: deleteEnhance } = sf_delete;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Delete account</Card.Title>
		<Card.Description>
			Permanently removes your account, sessions, two-factor setup and passkeys. This cannot be undone.
		</Card.Description>
	</Card.Header>
	<Card.Footer class="border-t px-6 py-4">
		<Dialog.Root bind:open>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="destructive" data-testid="delete-account-open">Delete account</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Delete your account?</Dialog.Title>
					<Dialog.Description>Enter your password to confirm.</Dialog.Description>
				</Dialog.Header>
				<form method="POST" use:deleteEnhance class="grid gap-4">
					<Form.Field form={sf_delete} name="password">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Password</Form.Label>
								<Input {...props} type="password" autocomplete="current-password" bind:value={$deleteForm.password} />
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Dialog.Footer>
						<Form.Button variant="destructive">Delete my account</Form.Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	</Card.Footer>
</Card.Root>
