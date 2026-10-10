<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { authClient } from '$lib/auth-client';
	import { toastIfError } from '$lib/client/auth-form';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	interface SessionRow {
		id: string;
		token: string;
		userAgent?: string | null;
		ipAddress?: string | null;
		createdAt: Date;
	}

	let sessions = $state<SessionRow[]>([]);
	let currentToken = $state<string | null>(null);

	async function load() {
		const [list, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
		if (toastIfError(list.error, 'Could not load your sessions.')) return;
		sessions = list.data ?? [];
		currentToken = current.data?.session.token ?? null;
	}

	async function revoke(token: string) {
		const { error } = await authClient.revokeSession({ token });
		if (toastIfError(error, 'Could not revoke the session.')) return;
		toast.success('Session revoked.');
		await load();
	}

	async function revokeOthers() {
		const { error } = await authClient.revokeOtherSessions();
		if (toastIfError(error, 'Could not revoke your other sessions.')) return;
		toast.success('Signed out of all other sessions.');
		await load();
	}

	onMount(load);
</script>

<svelte:head>
	<title>Acme | Sessions</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Active sessions</Card.Title>
		<Card.Description>Devices currently signed in to your account.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<ul class="grid gap-3" data-testid="sessions">
			{#each sessions as session (session.id)}
				<li class="flex items-center justify-between gap-4 rounded-md border p-3" data-testid="session-row">
					<div class="text-sm">
						<p class="font-medium">{session.userAgent ?? 'Unknown device'}</p>
						<p class="text-muted-foreground">
							{session.ipAddress ?? 'Unknown IP'} · signed in {new Date(session.createdAt).toLocaleString()}
						</p>
					</div>
					{#if session.token === currentToken}
						<span class="text-sm font-medium" data-testid="current-session">This device</span>
					{:else}
						<Button variant="outline" size="sm" onclick={() => revoke(session.token)}>Revoke</Button>
					{/if}
				</li>
			{/each}
		</ul>
	</Card.Content>
	<Card.Footer class="border-t px-6 py-4">
		<Button variant="destructive" onclick={revokeOthers}>Sign out of all other sessions</Button>
	</Card.Footer>
</Card.Root>
