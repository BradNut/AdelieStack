<script lang="ts">
	import { onMount } from 'svelte';
	import { authClient } from '$lib/auth-client';
	import { toastIfError } from '$lib/client/auth-form';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';

	const USERS_PAGE_SIZE = 50;

	interface AdminUserRow {
		id: string;
		name: string;
		email: string;
		role?: string | null;
	}

	let users = $state<AdminUserRow[]>([]);

	onMount(async () => {
		const { data, error } = await authClient.admin.listUsers({ query: { limit: USERS_PAGE_SIZE } });
		if (toastIfError(error, 'Could not load users.')) return;
		users = data?.users ?? [];
	});
</script>

<svelte:head>
	<title>Acme | Admin</title>
</svelte:head>

<div class="mx-auto grid w-full max-w-6xl gap-6">
	<h1 class="text-3xl font-semibold">Admin</h1>
	<Card.Root>
		<Card.Header>
			<Card.Title>Users</Card.Title>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Email</Table.Head>
						<Table.Head>Role</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each users as user (user.id)}
						<Table.Row>
							<Table.Cell>{user.name}</Table.Cell>
							<Table.Cell>{user.email}</Table.Cell>
							<Table.Cell>{user.role}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
