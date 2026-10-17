import { SOCIAL_PROVIDERS, type SocialProvider } from '@adelie/shared';
import type { BetterAuthOptions } from 'better-auth';
import { type EnvsDto, SOCIAL_PROVIDER_ENV_NAMES } from '#lib/server/api/common/configs/dtos/env.dto';

/** What a deployer configures for one provider; the secret never leaves the API. */
export interface SocialCredentials {
  clientId: string;
  clientSecret: string;
}

/** Only the providers whose credentials are configured. Empty on a fresh install. */
export type SocialCredentialsByProvider = Partial<Record<SocialProvider, SocialCredentials>>;

/** A provider is on only when both its client id and secret are set. The env schema rejects half a pair. */
export function socialCredentialsFromEnvs(envs: EnvsDto): SocialCredentialsByProvider {
  const credentials: SocialCredentialsByProvider = {};
  for (const provider of SOCIAL_PROVIDERS) {
    const clientId = envs[SOCIAL_PROVIDER_ENV_NAMES[provider].id];
    const clientSecret = envs[SOCIAL_PROVIDER_ENV_NAMES[provider].secret];
    if (typeof clientId === 'string' && typeof clientSecret === 'string') credentials[provider] = { clientId, clientSecret };
  }
  return credentials;
}

/** What the web may know: which providers are on, never their credentials. */
export function enabledSocialProviders(credentials: SocialCredentialsByProvider): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((provider) => credentials[provider] !== undefined);
}

type SocialProvidersOption = NonNullable<BetterAuthOptions['socialProviders']>;

/**
 * Better Auth's `socialProviders` for the configured providers, with the sign-up gate applied to each:
 * while sign-up is closed, a provider sign-in for an unknown email is rejected (`signup_disabled`) and
 * existing users can still sign in. Better Auth reads `disableSignUp` for both the redirect callback and
 * the id-token sign-in. Providers that are not configured are not registered at all.
 */
export function socialProvidersOption(providers: SocialProvidersOption, signUpEnabled: boolean): SocialProvidersOption {
  return Object.fromEntries(Object.entries(providers).map(([id, options]) => [id, { ...options, disableSignUp: !signUpEnabled }]));
}
