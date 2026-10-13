<script lang="ts" generics="T extends Record<string, unknown>, U extends FormPathLeaves<T>">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { fromStore } from "svelte/store";
	import { type FormPathLeaves, formFieldProxy, type SuperForm } from "sveltekit-superforms";
	import { Field } from "$lib/components/ui/field/index.js";
	import { cn, type WithElementRef, type WithoutChildren } from "$lib/utils.js";
	import { setFormFieldContext } from "./form-context.svelte.js";

	type FieldState = {
		constraints: unknown;
		errors: string[];
		tainted: boolean | undefined;
		value: T[U];
	};

	let {
		ref = $bindable(null),
		class: className,
		form,
		name,
		children,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> & {
		form: SuperForm<T>;
		name: U;
		children?: Snippet<[FieldState]>;
	} = $props();

	const id = $props.id();
	const proxy = $derived(formFieldProxy(form, name));
	const errors = $derived(fromStore(proxy.errors));
	const constraints = $derived(fromStore(proxy.constraints));
	const tainted = $derived(fromStore(proxy.tainted));
	const value = $derived(fromStore(proxy.value));
	const fieldErrors = $derived((errors.current ?? []) as string[]);

	setFormFieldContext({
		get id() {
			return `${id}-control`;
		},
		get name() {
			return name;
		},
		get errors() {
			return fieldErrors;
		},
		get invalid() {
			return fieldErrors.length > 0;
		},
		get errorsId() {
			return `${id}-errors`;
		},
	});
</script>

<Field
	bind:ref
	data-slot="form-item"
	data-invalid={fieldErrors.length > 0 ? "true" : undefined}
	class={cn("gap-2", className)}
	{...restProps}
>
	{@render children?.({
		constraints: constraints.current,
		errors: fieldErrors,
		tainted: tainted.current as boolean | undefined,
		value: value.current as T[U],
	})}
</Field>
