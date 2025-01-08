<script>
	import UpdateProfileCard from './update-profile-card.svelte';

	let { data } = $props();
</script>

<UpdateProfileCard updateProfileForm={data.updateProfileForm} />
