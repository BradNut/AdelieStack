import { RETRY_AFTER_HEADER, StatusCodes } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { withRetryAfter } from '../retry-after';

const respond = (status: number, body: string, headers: Record<string, string> = {}) =>
  withRetryAfter(async () => new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } }))('/api/auth/x');

describe('withRetryAfter', () => {
  it('adds the retry header to a throttled JSON body', async () => {
    const res = await respond(StatusCodes.TOO_MANY_REQUESTS, '{"message":"Too many requests"}', { [RETRY_AFTER_HEADER]: '42' });

    expect(res.status).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect(await res.json()).toEqual({ message: 'Too many requests', retryAfter: 42 });
  });

  it('still reports the wait when the throttled body is not JSON', async () => {
    const res = await respond(StatusCodes.TOO_MANY_REQUESTS, 'slow down', { [RETRY_AFTER_HEADER]: '7' });

    expect(await res.json()).toEqual({ retryAfter: 7 });
  });

  it.each(['', 'soon', '0', '-3'])('leaves a throttled response with header %j untouched', async (value) => {
    const res = await respond(StatusCodes.TOO_MANY_REQUESTS, '{"message":"m"}', value ? { [RETRY_AFTER_HEADER]: value } : {});

    expect(await res.json()).toEqual({ message: 'm' });
  });

  it('leaves other failures untouched', async () => {
    const res = await respond(StatusCodes.UNAUTHORIZED, '{"message":"no"}', { [RETRY_AFTER_HEADER]: '9' });

    expect(await res.json()).toEqual({ message: 'no' });
  });
});
