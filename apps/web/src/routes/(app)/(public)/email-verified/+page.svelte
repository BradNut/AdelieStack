<script lang="ts">
	import VerificationResult from '$lib/components/auth/verification-result.svelte';

	const { data } = $props();
</script>

<svelte:head>
	<title>Acme | Email verified</title>
</svelte:head>

<VerificationResult kind="verify" user={data.authedUser} />
