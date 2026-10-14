# Web Coding Standards

Generic Svelte 5 (runes, `$props`, `$bindable`, effects), Tailwind, and accessibility guidance comes
from the Svelte plugin's docs and autofixer. This file holds only what is specific to this repo.

## Components

- Import app code through `#lib` (`#lib/components/ui/button/index.js`, `#lib/utils.js`).
- Declare props with a named `interface`, not an inline type:
  `let { user, isEditable = false, onSave }: UserCardProps = $props();`
- Style with Tailwind utilities and `cn()` from `#lib/utils.js` for conditional classes. No inline
  `style` attributes; reach for scoped CSS only when Tailwind cannot express it.
- Build UI from Shadcn components in `#lib/components/ui`.

## Server/Client Boundaries

- Server-only modules live in `src/lib/server/**`; a component importing one is an error.
- Client-only modules live in `src/lib/client/**`; shared helpers in `src/lib/utils/**` must have no
  server dependencies.
- Reuse constants from `@adelie/shared` (`MAX_NAME_LENGTH`, `MIN_PASSWORD_LENGTH`) before adding
  literals.

## Calling the API

`honoClient(fetch)` and `parseApiResponse` from `#lib/utils/api.ts` are the standard way to call the
API from `load` and actions. `parseApiResponse` never throws for non-2xx responses, so branch on
`error` and `status`. See [Data Fetching](./data-fetching.md).

```typescript
// +page.server.ts
import { error } from '@sveltejs/kit';
import { honoClient, parseApiResponse } from '#lib/utils/api';

export async function load({ fetch }) {
  const { data, error: apiError, status } = await parseApiResponse(await honoClient(fetch).users.me.$get());

  if (apiError) {
    error(status, 'Unable to load account');
  }

  return { user: data };
}
```

## Form Actions

Validate with `superValidate(request, zod4(dto))` using DTOs from `@adelie/shared`, return
`fail(StatusCodes.BAD_REQUEST, { form })` when invalid, and call the API through `honoClient`. See
[Forms](./forms.md) for the `Form.*` components and the SPA-mode and server-action patterns.

```typescript
// +page.server.ts
import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { StatusCodes, updateEmailDto } from '@adelie/shared';
import { honoClient, parseApiResponse } from '#lib/utils/api';

export const actions = {
  updateEmail: async ({ request, fetch }) => {
    const updateEmailForm = await superValidate(request, zod4(updateEmailDto));

    if (!updateEmailForm.valid) {
      return fail(StatusCodes.BAD_REQUEST, { updateEmailForm });
    }

    const { error } = await parseApiResponse(
      await honoClient(fetch).users.me.email.request.$post({ json: updateEmailForm.data })
    );

    if (error) {
      return setError(updateEmailForm, 'email', 'Unable to update email.');
    }

    return { updateEmailForm };
  }
};
```

## Error Pages

Read the current page from `$app/state` (`page.status`, `page.error?.message`; a runed object, no `$`
prefix), not the deprecated `$app/stores`.

## Related Documentation

- [Core Principles](../core-principles.md)
- [Data Fetching](./data-fetching.md)
- [Forms](./forms.md)
- [Testing Standards](./testing-standards.md)
