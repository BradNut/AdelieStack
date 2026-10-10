<script lang="ts">
	import { VerificationKind } from '@adelie/shared';
	import VerificationResult from '$lib/components/auth/verification-result.svelte';
</script>

<VerificationResult kind={VerificationKind.CHANGE} />
