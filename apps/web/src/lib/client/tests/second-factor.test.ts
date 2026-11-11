import { AppRoute, AuthErrorCode } from '@adelie/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { goto } from '$app/navigation';
import { sendToSecondFactorEnrolment } from '../second-factor';

describe('sendToSecondFactorEnrolment', () => {
  beforeEach(() => {
    vi.mocked(goto).mockReset();
  });

  it('sends the user to two-factor enrolment for SECOND_FACTOR_REQUIRED', async () => {
    const sent = await sendToSecondFactorEnrolment({ status: 403, code: AuthErrorCode.SECOND_FACTOR_REQUIRED });

    expect(sent).toBe(true);
    expect(goto).toHaveBeenCalledWith(AppRoute.SETTINGS_TWO_FACTOR);
  });

  it.each([null, undefined, { status: 403, code: 'FORBIDDEN' }, { status: 403 }])('leaves %j to the caller', async (error) => {
    expect(await sendToSecondFactorEnrolment(error)).toBe(false);
    expect(goto).not.toHaveBeenCalled();
  });
});
