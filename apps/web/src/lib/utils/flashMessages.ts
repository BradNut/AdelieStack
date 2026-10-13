import { SIGN_UP_CLOSED_MESSAGE } from '@adelie/shared';

export const alreadySignedInMessage = {
  type: 'success',
  message: 'You are already signed in',
} as const;
export const signUpClosedMessage = {
  type: 'error',
  message: SIGN_UP_CLOSED_MESSAGE,
} as const;
export const notSignedInMessage = {
  type: 'error',
  message: 'You are not signed in',
} as const;
export const forbiddenMessage = {
  type: 'error',
  message: 'You are not allowed to access this',
} as const;
export const signedOutMessage = {
  type: 'success',
  message: 'Successfully signed out',
};
