<script lang="ts">
	import type { Snippet } from "svelte";
	import { getFormFieldContext } from "./form-context.svelte.js";

	interface ControlProps {
		id: string;
		name: string;
		"aria-invalid": "true" | undefined;
		"aria-describedby": string | undefined;
		"data-invalid": "" | undefined;
	}

	interface Props {
		children?: Snippet<[{ props: ControlProps }]>;
	}

	let { children }: Props = $props();

	const field = getFormFieldContext();
	const describedBy = $derived(
		[field.hasDescription ? field.descriptionId : null, field.invalid ? field.errorsId : null].filter(Boolean).join(" ") || undefined
	);
	const controlProps: ControlProps = $derived({
		id: field.id,
		name: field.name,
		"aria-invalid": field.invalid ? "true" : undefined,
		"aria-describedby": describedBy,
		"data-invalid": field.invalid ? "" : undefined,
	});
</script>

{@render children?.({ props: controlProps })}
