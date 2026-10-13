<script lang="ts">
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';

	const schema = z.object({ email: z.email('Enter a valid email'), name: z.string().optional() });

	const sf = superForm(defaults(zod4(schema)), { SPA: true, validators: zod4Client(schema), resetForm: false });
	const { form, enhance } = sf;
</script>

<form method="POST" use:enhance>
	<Form.Field form={sf} name="email">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>Email</Form.Label>
				<Input {...props} bind:value={$form.email} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
	<Form.Field form={sf} name="name">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>Name</Form.Label>
				<Input {...props} bind:value={$form.name} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
	<Form.Button>Save</Form.Button>
</form>
