<script>
	import "../app.css";
	import { ModeWatcher } from "mode-watcher";
	import { getFlash } from "sveltekit-flash-message";
	import { toastMessage } from "@/utils/superforms";
	import { onNavigate } from "$app/navigation";
	import { page } from "$app/state";
	import { startViewTransition } from "$lib/client/view-transition";
	import { Toaster } from "$lib/components/ui/sonner";
	import PageLoadingIndicator from "$lib/utils/page_loading_indicator.svelte";

	const { data, children } = $props();

	const flash = getFlash(page, {
		clearOnNavigate: true,
		clearAfterMs: 3000,
		clearArray: true,
	});

	$effect(() => {
		// console.log('flash', $flash);
		if ($flash) {
			toastMessage({ type: $flash.type, text: $flash.message });
			// Clearing the flash message could sometimes
			// be required here to avoid double-toasting.
			flash.set(undefined);
		}
	});

	onNavigate(startViewTransition);
</script>

<PageLoadingIndicator />
<!-- The pre-paint theme script is a nonce-d tag in app.html (see hooks.server.ts); a hash would go stale whenever the bundler changes. -->
<ModeWatcher disableHeadScriptInjection />
<Toaster />

<main class="antialiased">
	{@render children?.()}
</main>
