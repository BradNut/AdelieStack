<script>
	import DeleteAccountCard from './delete-account-card.svelte';
import UpdateProfileCard from './update-profile-card.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Acme | Settings</title>
</svelte:head>

<UpdateProfileCard updateProfileForm={data.updateProfileForm} />
<DeleteAccountCard />
