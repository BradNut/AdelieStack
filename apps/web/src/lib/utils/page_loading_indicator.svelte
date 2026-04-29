<script lang="ts">
	import { onNavigate } from "$app/navigation";

  let visible = $state(false);
  let progress = $state(0);
  let load_durations = $state<number[]>([]);
  let average_load = $derived(load_durations.reduce((a, b) => a + b, 0) / load_durations.length);

	const increment = 1;

	onNavigate((navigation) => {
		const typical_load_time = average_load || 200; //ms
		const frequency = typical_load_time / 100;
		let start = performance.now();
		// Start the progress bar
		visible = true;
		progress = 0;
		const interval = setInterval(() => {
			// Increment the progress bar
			progress += increment;
		}, frequency);
		// Resolve the promise when the page is done loading
		navigation?.complete.then(() => {
			progress = 100; // Fill out the progress bar
			clearInterval(interval);
			// after 100 ms hide the progress bar
			setTimeout(() => {
				visible = false;
			}, 500);
			// Log how long that one took
			const end = performance.now();
			const duration = end - start;
			load_durations = [...load_durations, duration];
		});
	});
</script>

{#if visible}
  <div
    class="fixed top-0 left-0 right-0 h-1 bg-primary z-50 transition-all duration-300 ease-in-out"
    style="width: {progress}%;"
  ></div>
{/if}
