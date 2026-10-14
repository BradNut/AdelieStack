import { publicConfigDto } from '@adelie/shared';
import type { Api } from '#lib/utils/types.ts';

/** Whether the API allows registration. Any failure reads as closed, so a broken lookup never offers a sign-up that would be refused. */
export async function loadSignUpEnabled(api: Api): Promise<boolean> {
  try {
    const response = await api.config.$get();
    if (!response.ok) return false;
    const parsed = publicConfigDto.safeParse(await response.json());
    return parsed.success && parsed.data.signUpEnabled;
  } catch {
    return false;
  }
}
