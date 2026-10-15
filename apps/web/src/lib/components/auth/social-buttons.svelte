<script lang="ts">
	import { SOCIAL_PROVIDER_LABELS, type SocialProvider } from '@adelie/shared';
	import LastUsedBadge from '#lib/components/auth/last-used-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';

	interface Props {
		/** The providers the API reports as configured. Nothing renders for an empty list. */
		providers: readonly SocialProvider[];
		onselect: (provider: SocialProvider) => void | Promise<void>;
		/** The login method the visitor used last, if any; that provider's button is marked. */
		lastMethod?: string | null;
	}

	let { providers, onselect, lastMethod = null }: Props = $props();
</script>

{#if providers.length > 0}
	<div class="grid gap-4" data-testid="social-buttons">
		<span class="text-center text-sm text-muted-foreground">or continue with</span>
		{#each providers as provider (provider)}
			<Button variant="outline" class="w-full" onclick={() => onselect(provider)}>
				{SOCIAL_PROVIDER_LABELS[provider]}
				<LastUsedBadge method={provider} {lastMethod} />
			</Button>
		{/each}
	</div>
{/if}
