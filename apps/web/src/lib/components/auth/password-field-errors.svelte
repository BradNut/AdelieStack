<script lang="ts">
	import * as Form from '#lib/components/ui/form/index.ts';
	import { passwordFieldErrors } from '#lib/utils/password-policy-messages.ts';
</script>

<!-- Form.FieldErrors that translates password rule codes and the breached-password code. Use inside a Form.Field. -->
<Form.FieldErrors>
	{#snippet children({ errors, errorProps })}
		{#each passwordFieldErrors(errors) as error (error)}
			<div {...errorProps}>{error}</div>
		{/each}
	{/snippet}
</Form.FieldErrors>
