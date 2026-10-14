<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";

	interface Props extends HTMLAttributes<HTMLImageElement> {
		user: {
			id: string;
			avatar: string | null;
		};
	}
</script>

<script lang="ts">
	import { Avatar } from "@dicebear/core";
	import funEmoji from "@dicebear/styles/fun-emoji.json" with { type: "json" };

	const { user, ...props }: Props = $props();
	const avatar = $derived(
		user.avatar ||
			new Avatar(funEmoji, {
				seed: user.id,
			}).toDataUri(),
	);
</script>

<img alt="" {...props} src={avatar} />
