<script lang="ts">
	import type { LoginMethod } from '@adelie/shared';
	import { Badge } from '#lib/components/ui/badge/index.ts';

	interface Props {
		/** The method this badge sits next to. */
		method: LoginMethod;
		/** The method the visitor signed in with last time; null for a first-time visitor. */
		lastMethod: string | null;
	}

	let { method, lastMethod }: Props = $props();
</script>

{#if lastMethod === method}
	<Badge variant="secondary" data-testid="last-used-badge">Last used</Badge>
{/if}
