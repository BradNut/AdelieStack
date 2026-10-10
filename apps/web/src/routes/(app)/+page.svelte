<script lang="ts">
	let { data } = $props();
</script>

<h1 class="text-2xl font-semibold">Welcome {data.authedUser?.name ?? 'visitor'}</h1>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
