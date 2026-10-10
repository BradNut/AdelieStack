<script lang="ts">
	import { recoveryCodeDto, twoFactorCodeDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { authErrorMessage, refreshSession, toastIfError } from '$lib/client/auth-form';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';

	async function finishSignIn() {
		await refreshSession();
		await goto('/');
	}

	// The challenge cookie set by the password step authorises these calls; a bad or missing one errors.
	const sf_totp = superForm(defaults(zod4(twoFactorCodeDto)), {
		id: 'totp',
		SPA: true,
		validators: zod4Client(twoFactorCodeDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.twoFactor.verifyTotp({ code: form.data.code });
			if (error) return setError(form, 'code', authErrorMessage(error, 'Invalid code.'));
			await finishSignIn();
		},
	});

	const sf_otp = superForm(defaults(zod4(twoFactorCodeDto)), {
		id: 'emailed-otp',
		SPA: true,
		validators: zod4Client(twoFactorCodeDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.twoFactor.verifyOtp({ code: form.data.code });
			if (error) return setError(form, 'code', authErrorMessage(error, 'Invalid code.'));
			await finishSignIn();
		},
	});

	const sf_recovery = superForm(defaults(zod4(recoveryCodeDto)), {
		id: 'recovery-code',
		SPA: true,
		validators: zod4Client(recoveryCodeDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.twoFactor.verifyBackupCode({ code: form.data.code });
			if (error) return setError(form, 'code', authErrorMessage(error, 'Invalid recovery code.'));
			await finishSignIn();
		},
	});

	const { form: totpForm, enhance: totpEnhance } = sf_totp;
	const { form: otpForm, enhance: otpEnhance } = sf_otp;
	const { form: recoveryForm, enhance: recoveryEnhance } = sf_recovery;

	let otpSent = $state(false);

	async function sendEmailedCode() {
		const { error } = await authClient.twoFactor.sendOtp();
		if (toastIfError(error, 'Could not send the code.')) return;
		otpSent = true;
		toast.success('We emailed you a sign-in code.');
	}
</script>

<svelte:head>
	<title>Acme | Two-factor verification</title>
</svelte:head>

<Card.Root class="mx-auto mt-24 max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Two-factor verification</Card.Title>
		<Card.Description>Confirm it's you to finish signing in.</Card.Description>
	</Card.Header>
	<Card.Content>
		<Tabs.Root value="totp">
			<Tabs.List class="grid w-full grid-cols-3">
				<Tabs.Trigger value="totp">App</Tabs.Trigger>
				<Tabs.Trigger value="email">Email</Tabs.Trigger>
				<Tabs.Trigger value="recovery">Recovery</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="totp">
				<form method="POST" use:totpEnhance class="grid gap-2">
					<Form.Field form={sf_totp} name="code">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Authenticator code</Form.Label>
								<Input
									{...props}
									inputmode="numeric"
									autocomplete="one-time-code"
									placeholder="123456"
									bind:value={$totpForm.code}
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Form.Button>Verify</Form.Button>
				</form>
			</Tabs.Content>
			<Tabs.Content value="email">
				{#if otpSent}
					<form method="POST" use:otpEnhance class="grid gap-2">
						<Form.Field form={sf_otp} name="code">
							<Form.Control>
								{#snippet children({ props })}
									<Form.Label>Emailed code</Form.Label>
									<Input
										{...props}
										inputmode="numeric"
										autocomplete="one-time-code"
										placeholder="123456"
										bind:value={$otpForm.code}
									/>
								{/snippet}
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
						<Form.Button>Verify</Form.Button>
					</form>
				{:else}
					<Button class="mt-2 w-full" onclick={sendEmailedCode}>Email me a code</Button>
				{/if}
			</Tabs.Content>
			<Tabs.Content value="recovery">
				<form method="POST" use:recoveryEnhance class="grid gap-2">
					<Form.Field form={sf_recovery} name="code">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Recovery code</Form.Label>
								<Input
									{...props}
									autocomplete="off"
									placeholder="xxxxx-xxxxx"
									bind:value={$recoveryForm.code}
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Form.Button>Use recovery code</Form.Button>
				</form>
			</Tabs.Content>
		</Tabs.Root>
	</Card.Content>
</Card.Root>
