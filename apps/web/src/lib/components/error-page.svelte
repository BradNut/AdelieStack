<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages.js';

	const NOT_FOUND = 404;

	const isNotFound = $derived(page.status === NOT_FOUND);
	const errorId = $derived(page.error?.errorId);
</script>

<div class="flex min-h-[60vh] items-center justify-center p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<p class="text-sm text-muted-foreground">{m.errors_status_label({ status: page.status })}</p>
			<Card.Title class="text-2xl">
				{isNotFound ? m.errors_not_found_title() : m.errors_generic_title()}
			</Card.Title>
			<Card.Description>
				{isNotFound ? m.errors_not_found_description() : m.errors_generic_description()}
			</Card.Description>
		</Card.Header>
		{#if errorId}
			<Card.Content>
				<Alert.Root>
					<Alert.Title>{m.errors_error_id_label()}</Alert.Title>
					<Alert.Description>
						<code class="break-all font-mono text-xs" data-testid="error-id">{errorId}</code>
						<span>{m.errors_error_id_hint()}</span>
					</Alert.Description>
				</Alert.Root>
			</Card.Content>
		{/if}
		<Card.Footer class="gap-2">
			<Button href="/">{m.errors_go_home()}</Button>
			{#if !isNotFound}
				<Button variant="outline" onclick={() => invalidateAll()}>{m.errors_try_again()}</Button>
			{/if}
		</Card.Footer>
	</Card.Root>
</div>
