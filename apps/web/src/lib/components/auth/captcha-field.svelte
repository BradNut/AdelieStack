<script lang="ts">
	import { mode } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { getCaptchaConfig } from '$lib/client/captcha/config';
	import type { CaptchaWidgetHandle } from '$lib/client/captcha/types';
	import { CaptchaConfigError, captchaWidgetFor } from '$lib/client/captcha/widgets';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';

	interface Props {
		/** Called with the Captcha Token when one is ready, and with '' when it expires or is reset. */
		onchange?: (token: string) => void;
	}

	let { onchange }: Props = $props();

	let enabled = $state(false);
	let failed = $state(false);
	let container = $state<HTMLElement>();
	let handle: CaptchaWidgetHandle | undefined;

	/** Tokens are single-use: call after every submit, successful or not. */
	export function reset() {
		onchange?.('');
		handle?.reset();
	}

	function fail(error: unknown) {
		failed = true;
		console.error(error instanceof CaptchaConfigError ? error.message : `Captcha widget failed: ${String(error)}`);
	}

	onMount(() => {
		let destroyed = false;
		getCaptchaConfig().then(
			(config) => {
				if (destroyed) return;
				try {
					if (config.enabled) captchaWidgetFor(config.provider);
				} catch (error) {
					return fail(error);
				}
				enabled = config.enabled;
				if (!config.enabled) return;
				// The container exists once `enabled` is flushed to the DOM.
				queueMicrotask(async () => {
					if (destroyed || !container || !config.siteKey) return;
					try {
						handle = await captchaWidgetFor(config.provider).render(container, {
							siteKey: config.siteKey,
							theme: mode.current === 'dark' ? 'dark' : 'light',
							language: getLocale(),
							onToken: (token) => onchange?.(token),
							onExpire: () => onchange?.(''),
							onError: () => fail(new Error('provider reported an error')),
						});
						if (destroyed) handle.destroy();
					} catch (error) {
						fail(error);
					}
				});
			},
			(error) => fail(error),
		);
		return () => {
			destroyed = true;
			handle?.destroy();
		};
	});
</script>

{#if enabled}
	<div data-testid="captcha-widget" bind:this={container}></div>
{/if}
{#if failed}
	<p role="alert" class="text-sm text-destructive">{m.validation_captcha_unavailable()}</p>
{/if}
