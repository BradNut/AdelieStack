<script lang="ts">
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import * as Form from '#lib/components/ui/form/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';

	const schema = z.object({ email: z.email('Enter a valid email'), name: z.string().min(1, 'Name required') });

	// Superforms keys state by form id, which defaults to a schema hash; keep renders independent.
	const sf = superForm(defaults(zod4(schema)), { id: crypto.randomUUID(), SPA: true, validators: zod4Client(schema), resetForm: false });
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
		<Form.Description>We never share it.</Form.Description>
		<Form.FieldErrors errorClasses="custom-error" />
	</Form.Field>
	<Form.Field form={sf} name="name">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>Name</Form.Label>
				<Input {...props} bind:value={$form.name} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors>
			{#snippet children({ errors, errorProps })}
				{#each errors as error (error)}
					<p {...errorProps}>Custom: {error}</p>
				{/each}
			{/snippet}
		</Form.FieldErrors>
	</Form.Field>
	<Form.Button>Save</Form.Button>
</form>
