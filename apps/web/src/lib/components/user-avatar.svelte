<script lang="ts" module>
	import { Style } from "@dicebear/core";
	import funEmojiDefinition from "@dicebear/styles/fun-emoji.json" with { type: "json" };
	import type { HTMLAttributes } from "svelte/elements";

	/** Built once for every avatar: DiceBear 11 takes a Style, not a bare style definition. */
	const funEmoji = new Style(funEmojiDefinition);

	interface Props extends HTMLAttributes<HTMLImageElement> {
		user: {
			id: string;
			avatar: string | null;
		};
	}
</script>

<script lang="ts">
	import { Avatar } from "@dicebear/core";

	const { user, ...props }: Props = $props();
	const avatar = $derived(
		user.avatar ||
			new Avatar(funEmoji, {
				seed: user.id,
			}).toDataUri(),
	);
</script>

<img alt="" {...props} src={avatar} />
