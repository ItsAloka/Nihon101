/* Pure-logic unit tests — no DB, no network. These are the cheap, fast base of the
 * pyramid: they pin the security-relevant helpers so a refactor can't quietly weaken
 * the password policy or the upload type check. Run with `bun test`. */
import { describe, it, expect } from 'bun:test';
import { validPassword } from '../src/routes/auth';
import { sniffExt } from '../src/routes/media';

describe('validPassword', () => {
  it('rejects too-short passwords', () => {
    expect(validPassword('short1')).toBe(false);
    expect(validPassword('')).toBe(false);
  });
  it('rejects 8 chars with only one character class', () => {
    expect(validPassword('12345678')).toBe(false);
    expect(validPassword('aaaaaaaa')).toBe(false);
  });
  it('accepts 8+ chars spanning two classes', () => {
    expect(validPassword('abcd1234')).toBe(true);
    expect(validPassword('Password')).toBe(true);
  });
  it('accepts a 12+ char passphrase regardless of complexity', () => {
    expect(validPassword('correcthorsebattery')).toBe(true);
  });
  it('rejects passwords over the 72-byte bcrypt cap', () => {
    expect(validPassword('a1'.repeat(40))).toBe(false); // 80 chars
  });
  it('rejects non-strings', () => {
    expect(validPassword(undefined)).toBe(false);
    expect(validPassword(12345678)).toBe(false);
  });
});

describe('sniffExt (image magic bytes, not client MIME)', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const avif = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
  const html = new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>');

  it('detects each allowed image format', () => {
    expect(sniffExt(png)).toBe('png');
    expect(sniffExt(jpg)).toBe('jpg');
    expect(sniffExt(gif)).toBe('gif');
    expect(sniffExt(webp)).toBe('webp');
    expect(sniffExt(avif)).toBe('avif');
  });
  it('rejects a non-image masquerading as one', () => {
    expect(sniffExt(html)).toBeNull();
    expect(sniffExt(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
