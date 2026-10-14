<script lang="ts" generics="T extends Record<string, unknown>, U extends FormPathLeaves<T>">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { fromStore } from "svelte/store";
	import { type FormPathLeaves, formFieldProxy, type InputConstraint, type SuperForm } from "sveltekit-superforms";
	import { Field } from "#lib/components/ui/field/index.js";
	import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";
	import { setFormFieldContext } from "./form-context.svelte.js";

	interface FieldState {
		constraints: InputConstraint | undefined;
		errors: string[];
		tainted: boolean | undefined;
		value: T[U];
	}

	interface Props extends WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> {
		form: SuperForm<T>;
		name: U;
		children?: Snippet<[FieldState]>;
	}

	let {
		ref = $bindable(null),
		class: className,
		form,
		name,
		children,
		...restProps
	}: Props = $props();

	const id = $props.id();
	const proxy = $derived(formFieldProxy(form, name));
	const errors = $derived(fromStore(proxy.errors));
	const constraints = $derived(fromStore(proxy.constraints));
	const tainted = $derived(fromStore(proxy.tainted));
	const value = $derived(fromStore(proxy.value));
	const fieldErrors = $derived((errors.current ?? []) as string[]);
	const invalid = $derived(fieldErrors.length > 0);
	let hasDescription = $state(false);

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
			return invalid;
		},
		get errorsId() {
			return `${id}-errors`;
		},
		get descriptionId() {
			return `${id}-description`;
		},
		get hasDescription() {
			return hasDescription;
		},
		set hasDescription(value: boolean) {
			hasDescription = value;
		},
	});
</script>

<Field
	bind:ref
	data-slot="form-item"
	data-invalid={invalid ? "true" : undefined}
	class={cn("gap-2", className)}
	{...restProps}
>
	{@render children?.({
		constraints: constraints.current as InputConstraint | undefined,
		errors: fieldErrors,
		tainted: tainted.current as boolean | undefined,
		value: value.current as T[U],
	})}
</Field>
