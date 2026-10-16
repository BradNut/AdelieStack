import { type PublicConfigDto, publicConfigDto } from '@adelie/shared';
import type { Api } from '#lib/utils/types.ts';

/** What the web assumes when the lookup fails: sign-up closed and no social buttons, so nothing is offered that the API would refuse. */
export const FALLBACK_PUBLIC_CONFIG: PublicConfigDto = { signUpEnabled: false, socialProviders: [] };

/** The API's public runtime config. Any failure reads as the closed fallback, so a broken lookup never offers a sign-up or provider that would be refused. */
export async function loadPublicConfig(api: Api): Promise<PublicConfigDto> {
  try {
    const response = await api.config.$get();
    if (!response.ok) return FALLBACK_PUBLIC_CONFIG;
    const parsed = publicConfigDto.safeParse(await response.json());
    return parsed.success ? parsed.data : FALLBACK_PUBLIC_CONFIG;
  } catch {
    return FALLBACK_PUBLIC_CONFIG;
  }
}
