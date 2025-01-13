<script>
	import '../app.css';
	import { page } from '$app/state';
	import { getFlash } from 'sveltekit-flash-message';
	import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from "$lib/components/ui/sonner";
	import { i18n } from '$lib/i18n';
	import { ParaglideJS } from '@inlang/paraglide-sveltekit';
	import { toastMessage } from '@/utils/superforms';
	import { onNavigate } from '$app/navigation';
	import PageLoadingIndicator from '$lib/utils/page_loading_indicator.svelte';

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

	onNavigate(async (navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((oldStateCaptureResolve) => {
			document.startViewTransition(async () => {
				oldStateCaptureResolve();
				await navigation.complete;
			});
		});
	});
</script>

<PageLoadingIndicator />
<ModeWatcher />
<Toaster />

<ParaglideJS {i18n}>
	<main class="antialiased">
		{@render children?.()}
	</main>
</ParaglideJS>
