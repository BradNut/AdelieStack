# Forms

Forms use `sveltekit-superforms` 3 with the local `Form.*` components in `src/lib/components/ui/form`
(`Field`, `Control`, `Label`, `Description`, `FieldErrors`, `Button`). The components read the superform's field stores through
`formFieldProxy`, so they work the same in both modes below. formsnap is not used (see `docs/adr/0003-local-form-components-instead-of-formsnap.md`).

## SPA mode (current auth forms)

`superForm(defaults(zod4(dto)), { SPA: true, validators: zod4Client(dto), onUpdate })`. Validation runs in the browser and `onUpdate` calls the
Better Auth browser client (passkey, TOTP and captcha flows need it). No `+page.server.ts` action is involved, so there is no form POST and the
SvelteKit CSRF origin check does not apply.

## Server actions

Use these when a form should work without the browser client or without JavaScript:

```ts
// +page.server.ts
export const load: PageServerLoad = async () => ({ form: await superValidate(zod4(dto)) });

export const actions: Actions = {
  default: async (event) => {
    const form = await superValidate(event, zod4(dto));
    if (!form.valid) return fail(StatusCodes.BAD_REQUEST, { form });
    const { error } = await event.locals.api.thing.$post({ json: form.data }).then(event.locals.parseApiResponse);
    if (error) return setError(form, 'field', 'Message');
    redirect(StatusCodes.SEE_OTHER, '/next', successMessage, event); // sveltekit-flash-message/server
  },
};
```

```svelte
<!-- +page.svelte -->
const sf = superForm(data.form, { validators: zod4Client(dto) });
const { form, enhance } = sf;
<form method="POST" use:enhance>
  <Form.Field form={sf} name="field">
    <Form.Control>{#snippet children({ props })}<Form.Label>Field</Form.Label><Input {...props} bind:value={$form.field} />{/snippet}</Form.Control>
    <Form.FieldErrors />
  </Form.Field>
  <Form.Button>Save</Form.Button>
</form>
```

Server actions are real form POSTs, so SvelteKit checks the request `Origin` against the trusted origin. Behind a TLS proxy the default works;
for plain HTTP build with `WEB_ORIGIN`. See the deployment runbook, "Request Origin". The pattern above is the one used in the
secondchancepuzzles project.

## Rules

- Client constraints must match the server validation limits in `@adelie/shared`.
- Import `Form.*` from `#lib/components/ui/form`; do not add formsnap back without revisiting the ADR.
