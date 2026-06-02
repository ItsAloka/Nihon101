import { customAlphabet } from 'nanoid';

// URL-safe, no ambiguous chars dropped — 21-char body per portability law.
const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 21);

/** Build a prefixed id, e.g. id('usr') -> "usr_V1StGXR8Z5jdHi6BmyT8a" */
export function id(prefix: string): string {
  return `${prefix}_${nano()}`;
}
