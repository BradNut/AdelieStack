<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import * as Card from "$lib/components/ui/card";
	import * as Form from "$lib/components/ui/form";
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from "$lib/components/ui/button/button.svelte";
	import CircleAlert from 'lucide-svelte/icons/circle-alert';
	import { enhance } from "$app/forms";

	let verifyDeleteDialogOpen = $state(false);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Delete Account</Card.Title>
	</Card.Header>
	<Card.Content>
		<Alert.Root variant="destructive">
				<CircleAlert class="size-4" />
				<Alert.Title level={3}>Heads up!</Alert.Title>
				<Alert.Description>Deleting your account is a permanent action. Once completed you will be logged out and your account will no longer exist.</Alert.Description>
			</Alert.Root>
	</Card.Content>
	<Card.Footer class="border-t px-6 py-4">
		<Button variant="destructive" onclick={() => verifyDeleteDialogOpen = true}>Delete Account</Button>
	</Card.Footer>
</Card.Root>

<!-- Dialogs -->
<Dialog.Root bind:open={verifyDeleteDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Account</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete your account?
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => verifyDeleteDialogOpen = false}>Cancel</Button>
			<form action="?/deleteAccount" method="POST" use:enhance class="w-full">
				<Button variant="destructive" class="text-start" type="submit">Delete Account</Button>
			</form>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

