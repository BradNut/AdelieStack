<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Form from '@/components/ui/form';
	import { superForm } from 'sveltekit-superforms';
	import * as Dialog from '@/components/ui/dialog';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import { updateEmailDto, type UpdateEmailDto } from '$lib/dtos/settings/email/update-email.dto';
	import { verifyEmailDto, type VerifyEmailDto } from '$lib/dtos/settings/email/verify-email.dto';
	import { zodClient } from 'sveltekit-superforms/adapters';

	/* ---------------------------------- props --------------------------------- */
	let { updateEmailForm, verifyEmailForm }: { updateEmailForm: UpdateEmailDto; verifyEmailForm: VerifyEmailDto } = $props();

	/* ---------------------------------- state --------------------------------- */
	let verifyDialogOpen = $state(false);

	/* ---------------------------------- forms --------------------------------- */
	const sf_updateEmailForm = superForm(updateEmailForm, {
		resetForm: false,
		validators: zodClient(updateEmailDto),
		onUpdated: ({ form }) => {
			if (!form.valid) {
				return;
			}
			verifyDialogOpen = true;
		}
	});

	const sf_verifyEmailForm = superForm(verifyEmailForm, {
		validators: zodClient(verifyEmailDto),
		onUpdated: ({ form }) => {
			if (!form.valid) {
				return;
			}
			verifyDialogOpen = false;
		}
	});

	const {
		form: updateEmailFormData,
		submit: submitEmailForm,
		enhance: updateEmailFormEnhance
	} = sf_updateEmailForm;

	const {
		form: verifyEmailFormData,
		enhance: verifyEmailFormEnhance,
		submit: verifyEmailFormSubmit
	} = sf_verifyEmailForm;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Change Email</Card.Title>
		<Card.Description>Used to identify your store in the marketplace.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateEmail" use:updateEmailFormEnhance>
			<Form.Field form={sf_updateEmailForm} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Email</Form.Label>
						<Input type="email" autocomplete="email" {...props} bind:value={$updateEmailFormData.email} />
					{/snippet}
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>
		</form>
	</Card.Content>
	<Card.Footer class="border-t px-6 py-4">
		<Form.Button onclick={() => submitEmailForm()}>
			Submit
		</Form.Button>
	</Card.Footer>
</Card.Root>

<!-- Dialogs -->
<Dialog.Root bind:open={verifyDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Verify Email</Dialog.Title>
			<Dialog.Description>
				A code has been sent to the email address specified. Enter the code to confirm your address
				change.
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/verifyEmail" use:verifyEmailFormEnhance>
			<Form.Field form={sf_verifyEmailForm} name="code">
				<Form.Control>
						{#snippet children({ props })}
						<InputOTP.Root maxlength={6} {...props} bind:value={$verifyEmailFormData.code}>
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
				<Form.FieldErrors />
			</Form.Field>
		</form>
		<Dialog.Footer>
			<Button variant="outline">Cancel</Button>
			<Form.Button onclick={() => verifyEmailFormSubmit()}>
				Verify
			</Form.Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
