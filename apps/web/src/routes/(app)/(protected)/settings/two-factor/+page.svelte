<script lang="ts">
	import { passwordConfirmDto, twoFactorCodeDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { renderSVG } from 'uqr';
	import { authClient } from '$lib/auth-client';
	import { authErrorMessage, refreshSession } from '$lib/client/auth-form';
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';

	let { data } = $props();

	const enabled = $derived(data.authedUser?.twoFactorEnabled ?? false);

	/** Set between starting enrolment and confirming the first code. */
	let enrolment = $state<{ totpURI: string; backupCodes: string[] } | null>(null);
	let regeneratedCodes = $state<string[] | null>(null);

	const sf_enable = superForm(defaults(zod4(passwordConfirmDto)), {
		id: 'enable-two-factor',
		SPA: true,
		validators: zod4Client(passwordConfirmDto),
		resetForm: true,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { data: result, error } = await authClient.twoFactor.enable({ password: form.data.password });
			if (error) return setError(form, 'password', authErrorMessage(error, 'Incorrect password.'));
			enrolment = result && 'totpURI' in result ? { totpURI: result.totpURI, backupCodes: result.backupCodes } : null;
		},
	});

	const sf_confirm = superForm(defaults(zod4(twoFactorCodeDto)), {
		id: 'confirm-two-factor',
		SPA: true,
		validators: zod4Client(twoFactorCodeDto),
		resetForm: true,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.twoFactor.verifyTotp({ code: form.data.code });
			if (error) return setError(form, 'code', authErrorMessage(error, 'Invalid code.'));
			enrolment = null;
			toast.success('Two-factor authentication is on.');
			await refreshSession();
		},
	});

	const sf_disable = superForm(defaults(zod4(passwordConfirmDto)), {
		id: 'disable-two-factor',
		SPA: true,
		validators: zod4Client(passwordConfirmDto),
		resetForm: true,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.twoFactor.disable({ password: form.data.password });
			if (error) return setError(form, 'password', authErrorMessage(error, 'Incorrect password.'));
			regeneratedCodes = null;
			toast.success('Two-factor authentication is off.');
			await refreshSession();
		},
	});

	const sf_regenerate = superForm(defaults(zod4(passwordConfirmDto)), {
		id: 'regenerate-codes',
		SPA: true,
		validators: zod4Client(passwordConfirmDto),
		resetForm: true,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { data: result, error } = await authClient.twoFactor.generateBackupCodes({ password: form.data.password });
			if (error) return setError(form, 'password', authErrorMessage(error, 'Incorrect password.'));
			regeneratedCodes = result?.backupCodes ?? null;
			toast.success('New recovery codes generated. Your old codes no longer work.');
		},
	});

	const { form: enableForm, enhance: enableEnhance } = sf_enable;
	const { form: confirmForm, enhance: confirmEnhance } = sf_confirm;
	const { form: disableForm, enhance: disableEnhance } = sf_disable;
	const { form: regenerateForm, enhance: regenerateEnhance } = sf_regenerate;
</script>

<svelte:head>
	<title>Acme | Two-factor</title>
</svelte:head>

{#snippet codesList(codes: string[])}
	<ul class="grid grid-cols-2 gap-2 font-mono text-sm" data-testid="recovery-codes">
		{#each codes as code (code)}
			<li>{code}</li>
		{/each}
	</ul>
{/snippet}

{#if enrolment}
	<Card.Root>
		<Card.Header>
			<Card.Title>Set up your authenticator app</Card.Title>
			<Card.Description>Scan the code, then enter the 6-digit code it shows to finish.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<div class="size-48 [&>svg]:size-full" data-testid="totp-qr">
				{@html renderSVG(enrolment.totpURI)}
			</div>
			<p class="text-sm text-muted-foreground">
				Can't scan? Enter this link in your app: <code class="break-all" data-testid="totp-uri">{enrolment.totpURI}</code>
			</p>
			<div>
				<h3 class="mb-2 font-medium">Recovery codes</h3>
				<p class="mb-2 text-sm text-muted-foreground">Save these now. Each works once if you lose your device.</p>
				{@render codesList(enrolment.backupCodes)}
			</div>
			<form method="POST" use:confirmEnhance class="grid gap-2">
				<Form.Field form={sf_confirm} name="code">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Authenticator code</Form.Label>
							<Input
								{...props}
								inputmode="numeric"
								autocomplete="one-time-code"
								bind:value={$confirmForm.code}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Button>Confirm and turn on</Form.Button>
			</form>
		</Card.Content>
	</Card.Root>
{:else if enabled}
	<Card.Root>
		<Card.Header>
			<Card.Title>Two-factor authentication is on</Card.Title>
			<Card.Description>You'll be asked for a code when you sign in with your password.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-6">
			<form method="POST" use:regenerateEnhance class="grid gap-2">
				<h3 class="font-medium">Regenerate recovery codes</h3>
				<Form.Field form={sf_regenerate} name="password">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Password to regenerate codes</Form.Label>
							<Input
								{...props}
								type="password"
								autocomplete="current-password"
								bind:value={$regenerateForm.password}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Button>Regenerate codes</Form.Button>
			</form>
			{#if regeneratedCodes}
				{@render codesList(regeneratedCodes)}
			{/if}
			<form method="POST" use:disableEnhance class="grid gap-2 border-t pt-6">
				<h3 class="font-medium">Turn off two-factor</h3>
				<Form.Field form={sf_disable} name="password">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Password to turn off two-factor</Form.Label>
							<Input
								{...props}
								type="password"
								autocomplete="current-password"
								bind:value={$disableForm.password}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Button variant="destructive">Turn off</Form.Button>
			</form>
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root>
		<Card.Header>
			<Card.Title>Two-factor authentication is off</Card.Title>
			<Card.Description>Add a second step to sign-in with an authenticator app, or an emailed code.</Card.Description>
		</Card.Header>
		<form method="POST" use:enableEnhance>
			<Card.Content>
				<Form.Field form={sf_enable} name="password">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Password to set up two-factor</Form.Label>
							<Input
								{...props}
								type="password"
								autocomplete="current-password"
								bind:value={$enableForm.password}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</Card.Content>
			<Card.Footer class="border-t px-6 py-4">
				<Form.Button>Set up two-factor</Form.Button>
			</Card.Footer>
		</form>
	</Card.Root>
{/if}
