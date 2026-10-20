<script lang="ts" module>
	import { AuthErrorCode } from '@adelie/shared';

	/** A Better Auth error from a Two-factor Challenge call. */
	export interface ChallengeError {
		status?: number;
		retryAfter?: unknown;
		code?: string;
		message?: string;
	}

	/** Errors after which the challenge cannot be completed: it expired, used up its attempts, or the account is locked. */
	const CHALLENGE_ENDING_CODES: ReadonlySet<string> = new Set([
		AuthErrorCode.TWO_FACTOR_CHALLENGE_INVALID,
		AuthErrorCode.TWO_FACTOR_ATTEMPTS_EXHAUSTED,
		AuthErrorCode.TWO_FACTOR_LOCKED,
	]);
</script>

<script lang="ts">
	import { recoveryCodeDto, twoFactorCodeDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage } from '#lib/client/auth-form.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Form from '#lib/components/ui/form/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as Tabs from '#lib/components/ui/tabs/index.ts';
	import * as m from '#lib/paraglide/messages.js';

	interface Props {
		/** Runs once a code is accepted and Better Auth has created the new session. */
		onVerified: () => unknown;
		/**
		 * Runs instead of showing the error when the challenge can no longer be completed. Without it the error shows
		 * like any other.
		 */
		onChallengeEnded?: (error: ChallengeError) => void;
	}

	let { onVerified, onChallengeEnded }: Props = $props();

	/** True when the caller took over an error that ends the challenge. */
	function endedChallenge(error: ChallengeError): boolean {
		if (!onChallengeEnded || !error.code || !CHALLENGE_ENDING_CODES.has(error.code)) return false;
		onChallengeEnded(error);
		return true;
	}

	// The challenge cookie set by the password step authorises these calls; a bad or missing one errors. `trustDevice`
	// is never sent: a remembered device is a risk signal, not authentication (ADR 0008).
	const sf_totp = superForm(defaults(zod4(twoFactorCodeDto)), {
		id: 'totp',
		SPA: true,
		validators: zod4Client(twoFactorCodeDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const { error } = await authClient.twoFactor.verifyTotp({ code: form.data.code });
			if (error) {
				if (endedChallenge(error)) return;
				return setError(form, 'code', authErrorMessage(error, m.two_factor_code_invalid()));
			}
			await onVerified();
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
			if (error) {
				if (endedChallenge(error)) return;
				return setError(form, 'code', authErrorMessage(error, m.two_factor_code_invalid()));
			}
			await onVerified();
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
			if (error) {
				if (endedChallenge(error)) return;
				return setError(form, 'code', authErrorMessage(error, m.two_factor_recovery_invalid()));
			}
			await onVerified();
		},
	});

	const { form: totpForm, enhance: totpEnhance } = sf_totp;
	const { form: otpForm, enhance: otpEnhance } = sf_otp;
	const { form: recoveryForm, enhance: recoveryEnhance } = sf_recovery;

	// The emailed code is sent only when asked for, so a challenge does not spend the email rate limit by default.
	let otpSent = $state(false);

	async function sendEmailedCode() {
		const { error } = await authClient.twoFactor.sendOtp();
		if (error) {
			if (!endedChallenge(error)) toast.error(authErrorMessage(error, m.two_factor_send_failed()));
			return;
		}
		otpSent = true;
		toast.success(m.two_factor_code_sent());
	}
</script>

<Tabs.Root value="totp">
	<Tabs.List class="grid w-full grid-cols-3">
		<Tabs.Trigger value="totp">{m.two_factor_tab_app()}</Tabs.Trigger>
		<Tabs.Trigger value="email">{m.two_factor_tab_email()}</Tabs.Trigger>
		<Tabs.Trigger value="recovery">{m.two_factor_tab_recovery()}</Tabs.Trigger>
	</Tabs.List>
	<Tabs.Content value="totp">
		<form method="POST" use:totpEnhance class="grid gap-2">
			<Form.Field form={sf_totp} name="code">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.two_factor_authenticator_label()}</Form.Label>
						<Input {...props} inputmode="numeric" autocomplete="one-time-code" placeholder="123456" bind:value={$totpForm.code} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Button>{m.two_factor_verify()}</Form.Button>
		</form>
	</Tabs.Content>
	<Tabs.Content value="email">
		{#if otpSent}
			<form method="POST" use:otpEnhance class="grid gap-2">
				<Form.Field form={sf_otp} name="code">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.two_factor_emailed_label()}</Form.Label>
							<Input {...props} inputmode="numeric" autocomplete="one-time-code" placeholder="123456" bind:value={$otpForm.code} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
				<Form.Button>{m.two_factor_verify()}</Form.Button>
			</form>
		{:else}
			<Button class="mt-2 w-full" onclick={sendEmailedCode}>{m.two_factor_email_me()}</Button>
		{/if}
	</Tabs.Content>
	<Tabs.Content value="recovery">
		<form method="POST" use:recoveryEnhance class="grid gap-2">
			<Form.Field form={sf_recovery} name="code">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.two_factor_recovery_label()}</Form.Label>
						<Input {...props} autocomplete="off" placeholder="xxxxx-xxxxx" bind:value={$recoveryForm.code} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Button>{m.two_factor_use_recovery()}</Form.Button>
		</form>
	</Tabs.Content>
</Tabs.Root>
