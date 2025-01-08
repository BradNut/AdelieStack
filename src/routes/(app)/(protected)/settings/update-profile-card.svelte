<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import * as Form from "$lib/components/ui/form";
	import { Input } from "$lib/components/ui/input";
	import { updateProfileDto, type UpdateProfileDto } from "$lib/dtos/settings/profile/update-profile.dto.js";
	import { fileProxy, superForm } from "sveltekit-superforms/client";
	import { zodClient } from "sveltekit-superforms/adapters";
	import * as flashModule from "sveltekit-flash-message/client";

	const { updateProfileForm }: { updateProfileForm: UpdateProfileDto } = $props();

	const sf_update_profile = superForm(updateProfileForm, {
		validators: zodClient(updateProfileDto),
		resetForm: false,
		syncFlashMessage: true,
		flashMessage: {
			module: flashModule,
		},
	});

	const {
		form: updateProfileFormData,
		enhance: updateProfileEnhance,
		submit: updateProfileFormSubmit,
	} = sf_update_profile;

	const avatar = fileProxy(updateProfileFormData, "avatar");
</script>

<svelte:head>
	<title>Acme | Settings</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Update Profile</Card.Title>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateProfile" use:updateProfileEnhance>
			<h3>Your Profile</h3>
			<hr class="!border-t-2 mt-2 mb-6" />
			<Form.Field form={sf_update_profile} name="username">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label for="username">Username</Form.Label>
						<Input autocomplete="username" {...props} bind:value={$updateProfileFormData.username} />
					{/snippet}
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field form={sf_update_profile} name="first_name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label for="first_name">First Name</Form.Label>
						<Input {...props} bind:value={$updateProfileFormData.first_name} />
					{/snippet}
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>
			<Form.Field form={sf_update_profile} name="last_name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label for="last_name">Last Name</Form.Label>
						<Input {...props} bind:value={$updateProfileFormData.last_name} />
					{/snippet}
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>
			<!-- <Form.Field form={sf_update_profile} name="avatar">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label for="avatar">Avatar</Form.Label>
					<Input type="file" accept="image/png, image/jpg, image/jpeg, image/webp" name="avatar" enctype="multipart/form-data" bind:files={$avatar} />
				{/snippet}
			</Form.Control>
			<Form.Description />
			<Form.FieldErrors />
		</Form.Field> -->
		</form>
	</Card.Content>
	<Card.Footer class="border-t px-6 py-4">
		<Form.Button onclick={() => updateProfileFormSubmit()}>Update Profile</Form.Button>
	</Card.Footer>
</Card.Root>
