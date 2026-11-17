<script lang="ts">
	import { type AuthedUser, MATCH_MY_BROWSER, updatePreferredLanguageDto } from '@adelie/shared';
	import { toast } from 'svelte-sonner';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '#lib/auth-client.ts';
	import { authErrorMessage, refreshSession } from '#lib/client/auth-form.ts';
	import { applyPreferredLanguage } from '#lib/client/preferred-language.ts';
	import * as Card from '#lib/components/ui/card/index.ts';
	import * as Form from '#lib/components/ui/form/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { isLocale, type Locale, locales } from '#lib/paraglide/runtime.js';

	interface PreferredLanguageCardProps {
		user: AuthedUser;
	}

	let { user }: PreferredLanguageCardProps = $props();

	/** Every supported locale needs a name here; each is written in its own language, in every catalogue. */
	const localeNames: Record<Locale, () => string> = {
		en: m.language_name_en,
		de: m.language_name_de,
		es: m.language_name_es,
	};

	const sf_language = superForm(defaults(zod4(updatePreferredLanguageDto)), {
		SPA: true,
		validators: zod4Client(updatePreferredLanguageDto),
		resetForm: false,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const locale = isLocale(form.data.preferredLanguage) ? form.data.preferredLanguage : null;
			const { error } = await authClient.updateUser({ locale });
			if (error) {
				toast.error(authErrorMessage(error, m.language_update_failed()));
				return;
			}
			toast.success(m.language_updated());
			// An admin impersonating the account keeps their own site language; only the account's preference changes.
			if (user.impersonating) await refreshSession();
			else await applyPreferredLanguage(locale);
		},
	});

	const { form: languageForm, enhance: languageEnhance, submitting } = sf_language;

	// The choice starts from the stored value and follows it when the session refreshes, until the user picks another.
	// A stored value the web no longer supports counts as none, as it does for mail.
	$effect.pre(() => {
		$languageForm.preferredLanguage = isLocale(user.preferredLanguage) ? user.preferredLanguage : MATCH_MY_BROWSER;
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title id="preferred-language-title">{m.language_label()}</Card.Title>
		<Card.Description>{m.language_description()}</Card.Description>
	</Card.Header>
	<form method="POST" use:languageEnhance>
		<Card.Content>
			<Form.Field form={sf_language} name="preferredLanguage">
				<Form.Control>
					{#snippet children({ props })}
						<RadioGroup.Root {...props} bind:value={$languageForm.preferredLanguage} aria-labelledby="preferred-language-title">
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
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
		</Card.Content>
		<Card.Footer class="border-t px-6 py-4">
			<Form.Button disabled={$submitting}>{m.language_save_button()}</Form.Button>
		</Card.Footer>
	</form>
</Card.Root>
