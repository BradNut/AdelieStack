import { getContext, setContext } from 'svelte';

const FORM_FIELD_CONTEXT = Symbol('form-field');

export type FormFieldContext = {
  readonly id: string;
  readonly name: string;
  readonly errors: string[];
  readonly invalid: boolean;
  readonly errorsId: string;
  readonly descriptionId: string;
  /** Set by Form.Description while mounted so the control can reference it. */
  hasDescription: boolean;
};

export function setFormFieldContext(context: FormFieldContext): FormFieldContext {
  return setContext(FORM_FIELD_CONTEXT, context);
}

export function getFormFieldContext(): FormFieldContext {
  const context = getContext<FormFieldContext | undefined>(FORM_FIELD_CONTEXT);
  if (!context) throw new Error('Form.Control, Form.Label, Form.Description and Form.FieldErrors must be used inside Form.Field');
  return context;
}
