<script lang="ts">
	import type { AuthedUser } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage, refreshSession } from '#lib/client/auth-form.ts';
	import { applyPreferredLanguage } from '#lib/client/preferred-language.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { isLocale, type Locale, locales } from '#lib/paraglide/runtime.js';

	let { user }: { user: AuthedUser } = $props();

	/** The radio value for "Match my browser", which saves no Preferred Language (`null`). */
	const MATCH_MY_BROWSER = '';

	/** Every supported locale needs a name here; each is written in its own language, in every catalogue. */
	const localeNames: Record<Locale, () => string> = {
		en: m.language_name_en,
		de: m.language_name_de,
		es: m.language_name_es,
	};

	// A stored value the web no longer supports counts as none, as it does for mail.
	const stored = $derived(isLocale(user.preferredLanguage) ? user.preferredLanguage : MATCH_MY_BROWSER);
	// The choice starts from the stored value and follows it when the session refreshes, until the user picks another.
	let choice = $derived<string>(stored);
	let saving = $state(false);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const locale = isLocale(choice) ? choice : null;
		saving = true;
		const { error } = await authClient.updateUser({ locale });
		saving = false;
		if (error) {
			toast.error(authErrorMessage(error, m.language_update_failed()));
			return;
		}
		toast.success(m.language_updated());
		// An admin impersonating the account keeps their own site language; only the account's preference changes.
		if (user.impersonating) await refreshSession();
		else await applyPreferredLanguage(locale);
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title id="preferred-language-title">{m.language_label()}</Card.Title>
		<Card.Description>{m.language_description()}</Card.Description>
	</Card.Header>
	<form method="POST" onsubmit={save}>
		<Card.Content>
			<RadioGroup.Root bind:value={choice} aria-labelledby="preferred-language-title">
				<div class="flex items-center gap-2">
					<RadioGroup.Item value={MATCH_MY_BROWSER} id="preferred-language-browser" />
					<Label for="preferred-language-browser">{m.language_match_browser()}</Label>
				</div>
				{#each locales as locale (locale)}
					<div class="flex items-center gap-2">
						<RadioGroup.Item value={locale} id="preferred-language-{locale}" />
						<Label for="preferred-language-{locale}" lang={locale}>{localeNames[locale]()}</Label>
					</div>
				{/each}
			</RadioGroup.Root>
		</Card.Content>
		<Card.Footer class="border-t px-6 py-4">
			<Button type="submit" disabled={saving}>{m.language_save_button()}</Button>
		</Card.Footer>
	</form>
</Card.Root>
