<script>
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from "$lib/components/ui/sonner";

	const { children } = $props();
</script>

<ModeWatcher />
<Toaster />
<main class="antialiased">
	{@render children?.()}
</main>
