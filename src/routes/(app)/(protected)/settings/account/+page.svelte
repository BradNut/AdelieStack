<script>
	import UpdateEmailCard from './update-email-card.svelte';
	import UpdatePasswordCard from './update-password-card.svelte';

	let { data } = $props();
</script>

<UpdateEmailCard updateEmailForm={data.updateEmailForm} verifyEmailForm={data.verifyEmailForm} />
<UpdatePasswordCard changePasswordForm={data.changePasswordForm} />
