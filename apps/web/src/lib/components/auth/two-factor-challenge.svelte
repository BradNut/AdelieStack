<script lang="ts" module>
	import { AuthErrorCode } from '@adelie/shared';
	import * as m from '#lib/paraglide/messages.js';
	import { throttledMessage } from '#lib/utils/throttle-messages.ts';

	/** A Better Auth error from a Two-factor Challenge call. */
	interface TwoFactorError {
		status?: number;
		retryAfter?: unknown;
		code?: string;
		message?: string;
	}

	/** What to tell the user once a challenge that cannot be completed has signed them out. */
	export interface ChallengeEnding {
		message: string;
		description?: string;
	}

	/**
	 * Errors after which the challenge cannot be completed (it expired, used up its attempts, or the account is locked),
	 * each with its copy. The one list of challenge-ending codes: adding one here is the only edit.
	 */
	const CHALLENGE_ENDINGS = {
		[AuthErrorCode.TWO_FACTOR_CHALLENGE_INVALID]: () => ({ message: m.reauth_challenge_expired() }),
		[AuthErrorCode.TWO_FACTOR_ATTEMPTS_EXHAUSTED]: () => ({ message: m.reauth_challenge_attempts_used() }),
		[AuthErrorCode.TWO_FACTOR_LOCKED]: (error) => ({
			message: m.reauth_challenge_locked(),
			description: throttledMessage(error) ?? undefined,
		}),
	} satisfies Partial<Record<AuthErrorCode, (error: TwoFactorError) => ChallengeEnding>>;

	/** An error that ends the challenge. */
	interface ChallengeError extends TwoFactorError {
		code: keyof typeof CHALLENGE_ENDINGS;
	}

	function isChallengeEnding(error: TwoFactorError): error is ChallengeError {
		return error.code !== undefined && Object.hasOwn(CHALLENGE_ENDINGS, error.code);
	}

	/**
	 * The emailed code keeps its own attempt counter and expiry. Better Auth then answers with the same
	 * `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` that ends the challenge for the other factors, but the challenge itself is
	 * still valid, so the user is asked to request a new code instead.
	 */
	function emailedCodeError(error: TwoFactorError): string | null {
		if (error.code === AuthErrorCode.TWO_FACTOR_ATTEMPTS_EXHAUSTED) return m.two_factor_emailed_code_used_up();
		if (error.code === AuthErrorCode.TWO_FACTOR_EMAILED_CODE_EXPIRED) return m.two_factor_emailed_code_expired();
		return null;
	}
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

	interface Props {
		/** Runs once a code is accepted and Better Auth has created the new session. */
		onVerified: () => unknown;
		/**
		 * Runs instead of showing the error when the challenge can no longer be completed. Without it the error shows
		 * like any other.
		 */
		onChallengeEnded?: (ending: ChallengeEnding) => void;
	}

	let { onVerified, onChallengeEnded }: Props = $props();

	/** True when the caller took over an error that ends the challenge. */
	function endedChallenge(error: TwoFactorError): boolean {
		if (!onChallengeEnded || !isChallengeEnding(error)) return false;
		onChallengeEnded(CHALLENGE_ENDINGS[error.code](error));
		return true;
	}

	interface CodeForm {
		id: string;
		schema: typeof twoFactorCodeDto | typeof recoveryCodeDto;
		verify: (code: string) => Promise<{ error: TwoFactorError | null }>;
		/** Shown when the server rejects the code without a message of its own. */
		invalidMessage: () => string;
		/** Copy for errors about this code alone, which leave the challenge open. */
		codeError?: (error: TwoFactorError) => string | null;
	}

	// The challenge cookie set by the password step authorises these calls; a bad or missing one errors. `trustDevice`
	// is never sent: a remembered device is a risk signal, not authentication (ADR 0008).
	function codeForm({ id, schema, verify, invalidMessage, codeError }: CodeForm) {
		return superForm(defaults(zod4(schema)), {
			id,
			SPA: true,
			validators: zod4Client(schema),
			resetForm: false,
			async onUpdate({ form }) {
				if (!form.valid) return;
				const { error } = await verify(form.data.code);
				if (error) {
					const message = codeError?.(error);
					if (message) return setError(form, 'code', message);
					if (endedChallenge(error)) return;
					return setError(form, 'code', authErrorMessage(error, invalidMessage()));
				}
				await onVerified();
			},
		});
	}

	const sf_totp = codeForm({
		id: 'totp',
		schema: twoFactorCodeDto,
		verify: (code) => authClient.twoFactor.verifyTotp({ code }),
		invalidMessage: m.two_factor_code_invalid,
	});
	const sf_otp = codeForm({
		id: 'emailed-otp',
		schema: twoFactorCodeDto,
		verify: (code) => authClient.twoFactor.verifyOtp({ code }),
		invalidMessage: m.two_factor_code_invalid,
		codeError: emailedCodeError,
	});
	const sf_recovery = codeForm({
		id: 'recovery-code',
		schema: recoveryCodeDto,
		verify: (code) => authClient.twoFactor.verifyBackupCode({ code }),
		invalidMessage: m.two_factor_recovery_invalid,
	});

	const { form: totpForm, enhance: totpEnhance } = sf_totp;
	const { form: otpForm, enhance: otpEnhance } = sf_otp;
	const { form: recoveryForm, enhance: recoveryEnhance } = sf_recovery;

	// The emailed code is sent only when asked for, so a challenge does not spend the email rate limit by default. Once
	// sent it can be asked for again, for when it expired or ran out of tries; the email rate limit still applies.
	let otpSent = $state(false);
	let sending = $state(false);

	async function sendEmailedCode() {
		if (sending) return;
		sending = true;
		const { error } = await authClient.twoFactor.sendOtp();
		sending = false;
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
			<Button class="mt-2 w-full" variant="outline" disabled={sending} onclick={sendEmailedCode}>{m.two_factor_email_me_again()}</Button>
		{:else}
			<Button class="mt-2 w-full" disabled={sending} onclick={sendEmailedCode}>{m.two_factor_email_me()}</Button>
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
