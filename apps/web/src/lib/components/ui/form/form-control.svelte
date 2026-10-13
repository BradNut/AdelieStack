<script lang="ts">
	import type { Snippet } from "svelte";
	import { getFormFieldContext } from "./form-context.svelte.js";

	type ControlProps = {
		id: string;
		name: string;
		"aria-invalid": "true" | undefined;
		"aria-describedby": string | undefined;
		"data-fs-error": "" | undefined;
	};

	let { children }: { children?: Snippet<[{ props: ControlProps }]> } = $props();

	const field = getFormFieldContext();
	const controlProps: ControlProps = $derived({
		id: field.id,
		name: field.name,
		"aria-invalid": field.invalid ? "true" : undefined,
		"aria-describedby": field.invalid ? field.errorsId : undefined,
		"data-fs-error": field.invalid ? "" : undefined,
	});
</script>

{@render children?.({ props: controlProps })}
