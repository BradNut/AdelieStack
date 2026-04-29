
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/(auth)" | "/(app)/(public)" | "/(app)/(protected)" | "/(app)" | "/" | "/(auth)/auth" | "/(auth)/auth/callback" | "/(auth)/auth/callback/google" | "/(auth)/login" | "/(auth)/login/google" | "/(auth)/password" | "/(auth)/password/reset" | "/(app)/(public)/privacy-policy" | "/(app)/(protected)/settings" | "/(app)/(protected)/settings/account" | "/(auth)/signup" | "/(app)/(public)/terms";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/(auth)": Record<string, never>;
			"/(app)/(public)": Record<string, never>;
			"/(app)/(protected)": Record<string, never>;
			"/(app)": Record<string, never>;
			"/": Record<string, never>;
			"/(auth)/auth": Record<string, never>;
			"/(auth)/auth/callback": Record<string, never>;
			"/(auth)/auth/callback/google": Record<string, never>;
			"/(auth)/login": Record<string, never>;
			"/(auth)/login/google": Record<string, never>;
			"/(auth)/password": Record<string, never>;
			"/(auth)/password/reset": Record<string, never>;
			"/(app)/(public)/privacy-policy": Record<string, never>;
			"/(app)/(protected)/settings": Record<string, never>;
			"/(app)/(protected)/settings/account": Record<string, never>;
			"/(auth)/signup": Record<string, never>;
			"/(app)/(public)/terms": Record<string, never>
		};
		Pathname(): "/" | "/auth/callback/google" | "/login" | "/login/google" | "/password/reset" | "/privacy-policy" | "/settings" | "/settings/account" | "/signup" | "/terms";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.png" | string & {};
	}
}