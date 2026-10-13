// Stand-in for SvelteKit's `$app/state` under Vitest, where the client router does not exist.
// Superforms reads `page.form` from it, so publishing an action result reaches the form.
export const page = $state<{
  form: unknown;
  status: number;
  url: URL;
  data: Record<string, unknown>;
  params: Record<string, string>;
  route: { id: string };
}>({
  form: null,
  status: 200,
  url: new URL('http://localhost/'),
  data: {},
  params: {},
  route: { id: '/' },
});

export const navigating = $state<{ to: null }>({ to: null });

export function publishActionResult(result: { data?: unknown; status?: number }) {
  page.form = result.data;
  page.status = result.status ?? 200;
}
