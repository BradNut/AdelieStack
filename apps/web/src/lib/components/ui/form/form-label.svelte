<script lang="ts">
	import type { ComponentProps } from "svelte";
	import { Label } from "#lib/components/ui/label/index.ts";
	import { cn } from "#lib/utils.ts";
	import { getFormFieldContext } from "./form-context.svelte.js";

	let {
		ref = $bindable(null),
		children,
		class: className,
		...restProps
	}: Omit<ComponentProps<typeof Label>, "for"> = $props();

	const field = getFormFieldContext();
</script>

<Label
	bind:ref
	{...restProps}
	for={field.id}
	data-slot="form-label"
	data-invalid={field.invalid ? "" : undefined}
	class={cn("data-[invalid]:text-destructive", className)}
>
	{@render children?.()}
</Label>
