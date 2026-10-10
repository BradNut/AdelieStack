<script lang="ts">
	import { passkeyNameDto } from '@adelie/shared';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { authClient } from '$lib/auth-client';
	import { toastIfError } from '$lib/client/auth-form';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';

	interface PasskeyRow {
		id: string;
		name?: string | null;
		deviceType: string;
		createdAt?: Date | null;
	}

	/** `cross-platform` asks for a roaming authenticator such as a hardware security key. */
	const SECURITY_KEY_ATTACHMENT = 'cross-platform';

	let passkeys = $state<PasskeyRow[]>([]);
	let kind = $state<'passkey' | 'security-key'>('passkey');

	async function load() {
		const { data, error } = await authClient.passkey.listUserPasskeys();
		if (toastIfError(error, 'Could not load your passkeys.')) return;
		passkeys = data ?? [];
	}

	const sf_add = superForm(defaults(zod4(passkeyNameDto)), {
		SPA: true,
		validators: zod4Client(passkeyNameDto),
		resetForm: true,
		async onUpdate({ form }) {
			if (!form.valid) return;
			const isSecurityKey = kind === 'security-key';
			const { error } = await authClient.passkey.addPasskey({
				name: form.data.name || undefined,
				authenticatorAttachment: isSecurityKey ? SECURITY_KEY_ATTACHMENT : undefined,
			});
			if (toastIfError(error, 'Could not add the passkey.')) return;
			toast.success(isSecurityKey ? 'Security key added.' : 'Passkey added.');
			await load();
		},
	});

	const { form: addForm, enhance: addEnhance } = sf_add;

	async function remove(id: string) {
		const { error } = await authClient.passkey.deletePasskey({ id });
		if (toastIfError(error, 'Could not delete the passkey.')) return;
		toast.success('Passkey deleted.');
		await load();
	}

	onMount(load);
</script>

<svelte:head>
	<title>Acme | Passkeys</title>
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>Passkeys and security keys</Card.Title>
		<Card.Description>Sign in without a password using this device or a hardware key.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-6">
		<ul class="grid gap-3" data-testid="passkeys">
			{#each passkeys as passkey (passkey.id)}
				<li class="flex items-center justify-between gap-4 rounded-md border p-3" data-testid="passkey-row">
					<div class="text-sm">
						<p class="font-medium">{passkey.name || 'Unnamed passkey'}</p>
						<p class="text-muted-foreground">{passkey.deviceType}</p>
					</div>
					<Button variant="outline" size="sm" onclick={() => remove(passkey.id)}>Delete</Button>
				</li>
			{:else}
				<li class="text-sm text-muted-foreground">No passkeys yet.</li>
			{/each}
		</ul>
		<form method="POST" use:addEnhance class="grid gap-2 border-t pt-6">
			<Form.Field form={sf_add} name="name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Name (optional)</Form.Label>
						<Input {...props} placeholder="Laptop" bind:value={$addForm.name} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<div class="flex gap-2">
				<Form.Button onclick={() => (kind = 'passkey')}>Add a passkey</Form.Button>
				<Form.Button variant="outline" onclick={() => (kind = 'security-key')}>Add a security key</Form.Button>
			</div>
		</form>
	</Card.Content>
</Card.Root>
