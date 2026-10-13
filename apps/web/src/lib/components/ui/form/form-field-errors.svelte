<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { getFormFieldContext } from "./form-context.svelte.js";

	let {
		ref = $bindable(null),
		class: className,
		errorClasses,
		children: childrenProp,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, "children"> & {
		errorClasses?: string | undefined | null;
		children?: Snippet<[{ errors: string[]; errorProps: { "data-fs-field-error": "" } }]>;
	} = $props();

	const field = getFormFieldContext();
	const errorProps = { "data-fs-field-error": "" } as const;
</script>

<div
	bind:this={ref}
	id={field.errorsId}
	aria-live="assertive"
	data-slot="form-field-errors"
	class={cn("text-sm font-medium text-destructive", className)}
	{...restProps}
>
	{#if childrenProp}
		{@render childrenProp({ errors: field.errors, errorProps })}
	{:else}
		{#each field.errors as error (error)}
			<div {...errorProps} class={cn(errorClasses)}>{error}</div>
		{/each}
	{/if}
</div>
