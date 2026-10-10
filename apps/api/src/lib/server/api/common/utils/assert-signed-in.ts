import { m } from '../i18n';
import { Unauthorized } from './exceptions';

/** Throws 401 unless `value` (the session or user) is present. */
export function assertSignedIn<T>(value: T | null | undefined): asserts value is T {
  if (!value) {
    throw Unauthorized(m.auth_login_required());
  }
}
