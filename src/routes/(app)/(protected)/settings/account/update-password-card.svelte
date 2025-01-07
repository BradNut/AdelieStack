<script lang="ts">
	import * as Alert from "$lib/components/ui/alert/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as Form from "@/components/ui/form";
	import { superForm } from "sveltekit-superforms";
	import CircleAlert from "lucide-svelte/icons/circle-alert";
	import { changePasswordDto, type ChangePasswordDto } from "$lib/dtos/settings/password/change-password.dto";
	import { zodClient } from "sveltekit-superforms/adapters";

	/* ---------------------------------- props --------------------------------- */
	let { changePasswordForm }: { changePasswordForm: ChangePasswordDto } = $props();

	/* ---------------------------------- forms --------------------------------- */
	const sf_changePasswordForm = superForm(changePasswordForm, {
		resetForm: false,
		validators: zodClient(changePasswordDto),
	});

	const {
		form: changePasswordFormData,
		enhance: changePasswordEnhance,
		submit: changePasswordFormSubmit,
	} = sf_changePasswordForm;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Change Password</Card.Title>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/changePassword" use:changePasswordEnhance>
			<Form.Field form={sf_changePasswordForm} name="current_password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Current Password</Form.Label>
						<Input
							type="password"
							autocomplete="current-password"
							{...props}
							bind:value={$changePasswordFormData.current_password}
						/>
					{/snippet}
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field form={sf_changePasswordForm} name="new_password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>New Password</Form.Label>
						<Input
							type="password"
							autocomplete="new-password"
							{...props}
							bind:value={$changePasswordFormData.new_password}
						/>
					{/snippet}
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field form={sf_changePasswordForm} name="confirm_password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Confirm Password</Form.Label>
						<Input
							type="password"
							autocomplete="new-password"
							{...props}
							bind:value={$changePasswordFormData.confirm_password}
						/>
					{/snippet}
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>
			<Alert.Root variant="destructive">
				<CircleAlert class="size-4" />
				<Alert.Title level={3}>Heads up!</Alert.Title>
				<Alert.Description>Changing your password will log you out of the current session.</Alert.Description>
			</Alert.Root>
		</form>
	</Card.Content>
	<Card.Footer class="border-t px-6 py-4">
		<Form.Button onclick={() => changePasswordFormSubmit()}>
			Submit
		</Form.Button>
	</Card.Footer>
</Card.Root>
