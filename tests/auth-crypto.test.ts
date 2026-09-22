import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, sha256Hex } from '../worker/lib/crypto';

describe('Password hashing', () => {
  it('hashes and verifies password (no plaintext storage)', async () => {
    const password = 'SecurePass!234';
    const hash = await hashPassword(password);
    expect(hash.startsWith('pbkdf2$')).toBe(true);
    expect(hash.includes(password)).toBe(false);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces different hashes for same password (salted)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });
});

describe('Session token hashing', () => {
  it('sha256 is deterministic', async () => {
    const a = await sha256Hex('secret:token');
    const b = await sha256Hex('secret:token');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
