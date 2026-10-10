<script lang="ts">
	import { updateProfileDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '$lib/auth-client';
	import { authErrorMessage, refreshSession } from '$lib/client/auth-form';
	import DeleteAccountCard from '$lib/components/auth/delete-account-card.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';

	let { data } = $props();

	const sf_profile = superForm(defaults(zod4(updateProfileDto)), {
		SPA: true,
		validators: zod4Client(updateProfileDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.updateUser({ name: form.data.name });
			if (error) return setError(form, 'name', authErrorMessage(error));
			toast.success('Profile updated!');
			await refreshSession();
		},
	});

	const { form: profileForm, enhance: profileEnhance } = sf_profile;

	$effect.pre(() => {
		$profileForm.name = data.authedUser?.name ?? '';
	});
</script>

<svelte:head>
	<title>Acme | Settings</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Update Profile</Card.Title>
	</Card.Header>
	<form method="POST" use:profileEnhance>
		<Card.Content>
			<Form.Field form={sf_profile} name="name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label for="name">Name</Form.Label>
						<Input {...props} autocomplete="name" bind:value={$profileForm.name} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
		<Card.Footer class="border-t px-6 py-4">
			<Form.Button>Update Profile</Form.Button>
		</Card.Footer>
	</form>
</Card.Root>

<DeleteAccountCard />
