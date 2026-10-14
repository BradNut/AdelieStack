<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { FieldDescription } from "#lib/components/ui/field/index.ts";
	import { getFormFieldContext } from "./form-context.svelte.js";

	let { children, ...restProps }: HTMLAttributes<HTMLParagraphElement> = $props();

	const field = getFormFieldContext();

	$effect(() => {
		field.hasDescription = true;
		return () => {
			field.hasDescription = false;
		};
	});
</script>

<FieldDescription id={field.descriptionId} data-slot="form-description" {...restProps}>
	{@render children?.()}
</FieldDescription>
