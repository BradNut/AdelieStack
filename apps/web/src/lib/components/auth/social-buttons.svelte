<script lang="ts">
	import { type LoginMethod, SOCIAL_PROVIDER_LABELS, type SocialProvider } from '@adelie/shared';
	import { signInWithProvider } from '#lib/client/social-auth.ts';
	import LastUsedBadge from '#lib/components/auth/last-used-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as m from '#lib/paraglide/messages.js';

	interface Props {
		/** The providers the API reports as configured. Nothing renders for an empty list. */
		providers: readonly SocialProvider[];
		/** Defaults to signing in with the provider; the sign-in and sign-up pages share it. */
		onselect?: (provider: SocialProvider) => void | Promise<void>;
		/** The login method the visitor used last, if any; that provider's button is marked. */
		lastMethod?: LoginMethod | null;
	}

	let { providers, onselect = signInWithProvider, lastMethod = null }: Props = $props();
</script>

{#if providers.length > 0}
	<div class="grid gap-4" data-testid="social-buttons">
		<span class="text-center text-sm text-muted-foreground">{m.auth_or_continue_with()}</span>
		{#each providers as provider (provider)}
			<Button variant="outline" class="w-full" onclick={() => onselect(provider)}>
				{SOCIAL_PROVIDER_LABELS[provider]}
				<LastUsedBadge method={provider} {lastMethod} />
			</Button>
		{/each}
	</div>
{/if}
