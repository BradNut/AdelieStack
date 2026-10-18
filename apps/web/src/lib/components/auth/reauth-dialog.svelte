<script lang="ts">
	import { CREDENTIAL_PROVIDER_ID, isSocialProvider, SOCIAL_PROVIDER_LABELS, type SocialProvider } from '@adelie/shared';
	import { authClient } from '#lib/auth-client.ts';
	import { createCaptchaForm } from '#lib/client/captcha/captcha-form.svelte.ts';
	import { freshSession, ReauthOutcome } from '#lib/client/fresh-session.svelte.ts';
	import CaptchaField from '#lib/components/auth/captcha-field.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { captchaErrorMessage } from '#lib/utils/captcha-messages.ts';
	import { throttledMessage } from '#lib/utils/throttle-messages.ts';
	import { page } from '$app/state';

	/** How the signed-in user can prove who they are again. Null while still checking. */
	interface Methods {
		email: string;
		password: boolean;
		passkey: boolean;
		/** Linked providers that the public config still enables. */
		providers: SocialProvider[];
	}

	let methods = $state<Methods | null>(null);
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	// Password sign-in is captcha-protected; passkey sign-in is exempt (ADR 0004), so only the password form binds a token.
	const captcha = createCaptchaForm();

	const canReauthenticate = $derived(methods !== null && (methods.password || methods.passkey || methods.providers.length > 0));

	/** Password sign-in on a two-factor account would answer with a challenge, which is out of scope here. */
	async function detectMethods(): Promise<Methods> {
		const [session, accounts, passkeys] = await Promise.all([
			authClient.getSession(),
			authClient.listAccounts(),
			authClient.passkey.listUserPasskeys(),
		]);
		const user = session.data?.user;
		const enabledProviders: SocialProvider[] = (page.data.socialProviders ?? []).filter(isSocialProvider);
		return {
			email: user?.email ?? '',
			password: Boolean(user) && !user?.twoFactorEnabled && Boolean(accounts.data?.some((account) => account.providerId === CREDENTIAL_PROVIDER_ID)),
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
		// A failed lookup leaves no way to re-authenticate here, so it shows the sign-out fallback instead of waiting forever.
		detectMethods()
			.catch((): Methods => ({ email: '', password: false, passkey: false, providers: [] }))
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
		// A two-factor challenge is not a fresh session; the client already started its redirect.
		if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
			error = m.reauth_sign_out_and_in();
			return;
		}
		freshSession.settle(ReauthOutcome.CONFIRMED);
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

	function onOpenChange(open: boolean) {
		if (!open) freshSession.settle(ReauthOutcome.DISMISSED);
	}
</script>

<Dialog.Root open={freshSession.open} {onOpenChange}>
	<Dialog.Content data-testid="reauth-dialog">
		<Dialog.Header>
			<Dialog.Title>{m.reauth_title()}</Dialog.Title>
			<Dialog.Description>{m.reauth_description()}</Dialog.Description>
		</Dialog.Header>
		{#if methods === null}
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
				<Button type="button" variant="outline" disabled={busy}>{m.reauth_use_provider({ provider: SOCIAL_PROVIDER_LABELS[provider] })}</Button>
			{/each}
			{#if error}
				<p id="reauth-error" class="text-sm text-destructive" role="alert" data-testid="reauth-error">{error}</p>
			{/if}
		{/if}
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => freshSession.settle(ReauthOutcome.DISMISSED)}>{m.reauth_cancel()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
