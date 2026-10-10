<script lang="ts">
	import VerificationResult from '$lib/components/auth/verification-result.svelte';

	const { data } = $props();
</script>

<svelte:head>
	<title>Acme | Email changed</title>
</svelte:head>

<VerificationResult kind="change" user={data.authedUser} />
