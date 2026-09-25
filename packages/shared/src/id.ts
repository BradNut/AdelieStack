import { customAlphabet } from 'nanoid';

export function generateId(length = 16, alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') {
  const nanoId = customAlphabet(alphabet, length);
  return nanoId();
}
