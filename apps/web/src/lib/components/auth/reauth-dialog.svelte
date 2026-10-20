<script lang="ts">
	import { AppRoute, AuthErrorCode, CREDENTIAL_PROVIDER_ID, isSocialProvider, SOCIAL_PROVIDER_LABELS, type SocialProvider } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { authClient } from '#lib/auth-client.ts';
	import { createCaptchaForm } from '#lib/client/captcha/captcha-form.svelte.ts';
	import { freshSession, ReauthOutcome } from '#lib/client/fresh-session.svelte.ts';
	import { currentReturnPath, withReturnPath } from '#lib/client/return-path.ts';
	import { reauthenticateWithProvider } from '#lib/client/social-auth.ts';
	import CaptchaField from '#lib/components/auth/captcha-field.svelte';
	import TwoFactorChallenge, { type ChallengeError } from '#lib/components/auth/two-factor-challenge.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { captchaErrorMessage } from '#lib/utils/captcha-messages.ts';
	import { throttledMessage } from '#lib/utils/throttle-messages.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	/** How the signed-in user can prove who they are again. Null while still checking. */
	interface Methods {
		email: string;
		userId: string;
		password: boolean;
		passkey: boolean;
		/** Linked providers that the public config still enables; none for a two-factor account (ADR 0008). */
		providers: SocialProvider[];
	}

	/** Where the dialog is: choosing how to confirm, or answering the Two-factor Challenge after a correct password. */
	const Step = {
		METHODS: 'methods',
		CHALLENGE: 'challenge',
	} as const;
	type Step = (typeof Step)[keyof typeof Step];

	let methods = $state<Methods | null>(null);
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	let step = $state<Step>(Step.METHODS);
	/** True while the user is warned that closing at the challenge step signs them out. */
	let leaving = $state(false);
	// Password sign-in is captcha-protected; passkey sign-in is exempt (ADR 0004), so only the password form binds a token.
	const captcha = createCaptchaForm();

	const canReauthenticate = $derived(methods !== null && (methods.password || methods.passkey || methods.providers.length > 0));

	/** A two-factor account confirms with the password and a code, or a passkey; social providers skip the second factor. */
	async function detectMethods(): Promise<Methods> {
		const [session, accounts, passkeys] = await Promise.all([
			authClient.getSession(),
			authClient.listAccounts(),
			authClient.passkey.listUserPasskeys(),
		]);
		const user = session.data?.user;
		const enabledProviders: SocialProvider[] = user?.twoFactorEnabled ? [] : (page.data.socialProviders ?? []).filter(isSocialProvider);
		return {
			email: user?.email ?? '',
			userId: user?.id ?? '',
			password: Boolean(user) && Boolean(accounts.data?.some((account) => account.providerId === CREDENTIAL_PROVIDER_ID)),
			passkey: (passkeys.data?.length ?? 0) > 0,
			providers: enabledProviders.filter((provider) => accounts.data?.some((account) => account.providerId === provider)),
		};
	}

	$effect(() => {
		if (!freshSession.open) return;
		let current = true;
		password = '';
		error = '';
		methods = null;
		step = Step.METHODS;
		leaving = false;
		// A failed lookup leaves no way to re-authenticate here, so it shows the sign-out fallback instead of waiting forever.
		detectMethods()
			.catch((): Methods => ({ email: '', userId: '', password: false, passkey: false, providers: [] }))
			.then((detected) => {
				if (current) methods = detected;
			});
		return () => {
			current = false;
		};
	});

	async function confirmWithPassword(event: SubmitEvent) {
		event.preventDefault();
		if (!methods?.password || busy) return;
		busy = true;
		error = '';
		const { email } = methods;
		const { data, error: signInError } = await captcha.attempt((fetchOptions) => authClient.signIn.email({ email, password }, fetchOptions));
		busy = false;
		if (signInError) {
			error = captchaErrorMessage(signInError) ?? throttledMessage(signInError) ?? m.reauth_password_incorrect();
			return;
		}
		// Better Auth swapped the session cookie for a challenge cookie: a code completes it and creates the fresh session.
		if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
			password = '';
			step = Step.CHALLENGE;
			return;
		}
		freshSession.settle(ReauthOutcome.CONFIRMED);
	}

	/**
	 * Ends the prompt without replaying the action and sends the now signed-out user to sign in, coming back here.
	 * Used once the challenge cannot be completed, or the user chose to leave it.
	 */
	async function leaveToSignIn() {
		const returnTo = currentReturnPath(window.location);
		freshSession.settle(ReauthOutcome.DISMISSED);
		await goto(withReturnPath(AppRoute.LOGIN, returnTo), { invalidateAll: true });
	}

	/** Why the challenge ended, for the message shown on the way to sign in. */
	function challengeEndedMessage(challengeError: ChallengeError): { message: string; description?: string } {
		if (challengeError.code === AuthErrorCode.TWO_FACTOR_LOCKED) {
			return { message: m.reauth_challenge_locked(), description: throttledMessage(challengeError) ?? undefined };
		}
		if (challengeError.code === AuthErrorCode.TWO_FACTOR_ATTEMPTS_EXHAUSTED) return { message: m.reauth_challenge_attempts_used() };
		return { message: m.reauth_challenge_expired() };
	}

	function onChallengeEnded(challengeError: ChallengeError) {
		const { message, description } = challengeEndedMessage(challengeError);
		toast.error(message, { description });
		void leaveToSignIn();
	}

	/** Closing at the challenge step signs the user out, so it asks first; otherwise the prompt is dismissed. */
	function requestClose() {
		if (step === Step.CHALLENGE) {
			leaving = true;
			return;
		}
		freshSession.settle(ReauthOutcome.DISMISSED);
	}

	async function confirmWithPasskey() {
		if (busy) return;
		busy = true;
		error = '';
		const { error: passkeyError } = await authClient.signIn.passkey();
		busy = false;
		if (passkeyError) {
			error = throttledMessage(passkeyError) ?? m.reauth_passkey_failed();
			return;
		}
		freshSession.settle(ReauthOutcome.CONFIRMED);
	}

	async function confirmWithProvider(provider: SocialProvider) {
		if (busy || !methods) return;
		busy = true;
		error = '';
		const { email, userId } = methods;
		const failure = await reauthenticateWithProvider(provider, { email, userId, replay: freshSession.replay });
		// On success the browser is leaving, so the dialog stays as it is.
		if (failure) {
			busy = false;
			error = failure.message;
		}
	}

	function setOpen(open: boolean) {
		if (!open) requestClose();
	}
</script>

<!-- A function binding, so a close the dialog refuses at the challenge step leaves it open. -->
<Dialog.Root bind:open={() => freshSession.open, setOpen}>
	<Dialog.Content data-testid="reauth-dialog">
		<Dialog.Header>
			<Dialog.Title>{m.reauth_title()}</Dialog.Title>
			<Dialog.Description>{m.reauth_description()}</Dialog.Description>
		</Dialog.Header>
		{#if step === Step.CHALLENGE}
			{#if leaving}
				<p class="text-sm" role="alert" data-testid="reauth-leave-warning">{m.reauth_leave_warning()}</p>
				<div class="grid gap-2">
					<Button type="button" variant="destructive" onclick={leaveToSignIn}>{m.reauth_leave_confirm()}</Button>
					<Button type="button" variant="outline" onclick={() => (leaving = false)}>{m.reauth_leave_stay()}</Button>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.reauth_two_factor_prompt()}</p>
				<TwoFactorChallenge onVerified={() => freshSession.settle(ReauthOutcome.CONFIRMED)} {onChallengeEnded} />
			{/if}
		{:else if methods === null}
			<p class="text-sm text-muted-foreground">{m.reauth_checking()}</p>
		{:else if !canReauthenticate}
			<p class="text-sm" role="alert" data-testid="reauth-fallback">{m.reauth_sign_out_and_in()}</p>
		{:else}
			{#if methods.password}
				<form class="grid gap-4" onsubmit={confirmWithPassword}>
					<div class="grid gap-2">
						<Label for="reauth-password">{m.reauth_password_label()}</Label>
						<Input id="reauth-password" type="password" autocomplete="current-password" required bind:value={password} aria-invalid={error ? true : undefined} aria-describedby={error ? 'reauth-error' : undefined} />
					</div>
					<!-- Mounted only while the dialog is open, so each opening gets a fresh challenge that closing tears down. -->
					<CaptchaField bind:this={captcha.field} onchange={captcha.setToken} />
					<Button type="submit" disabled={busy}>{m.reauth_confirm()}</Button>
				</form>
			{/if}
			{#if methods.passkey}
				<Button type="button" variant="outline" disabled={busy} onclick={confirmWithPasskey}>{m.reauth_use_passkey()}</Button>
			{/if}
			{#each methods.providers as provider (provider)}
				<Button type="button" variant="outline" disabled={busy} onclick={() => confirmWithProvider(provider)}>{m.reauth_use_provider({ provider: SOCIAL_PROVIDER_LABELS[provider] })}</Button>
			{/each}
			{#if error}
				<p id="reauth-error" class="text-sm text-destructive" role="alert" data-testid="reauth-error">{error}</p>
			{/if}
		{/if}
		<Dialog.Footer>
			{#if !leaving}
				<Button type="button" variant="ghost" onclick={requestClose}>{m.reauth_cancel()}</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
