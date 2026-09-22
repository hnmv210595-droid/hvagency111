#!/usr/bin/env tsx
/**
 * Create the first ADMIN account.
 * Usage:
 *   ADMIN_USERNAME=Admin111 ADMIN_PASSWORD='...' ADMIN_EMAIL=admin@example.com npm run create-admin
 *   D1_REMOTE=1 ... npm run create-admin   # write to remote D1
 *
 * Default username: Admin111. Do not hard-code or commit the password;
 * pass ADMIN_PASSWORD via env (local) when creating the account.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function hashPassword(password: string): Promise<string> {
  const ITERATIONS = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  const toHex = (buf: ArrayBuffer | Uint8Array) =>
    Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(derived)}`;
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string, fallback?: string) {
  const answer = await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `);
  return answer.trim() || fallback || '';
}

async function main() {
  const rl = createInterface({ input, output });
  const sqlPath = join(tmpdir(), `hv-create-admin-${Date.now()}.sql`);
  try {
    const username =
      process.env.ADMIN_USERNAME || (await prompt(rl, 'Admin username', 'Admin111'));
    const email = process.env.ADMIN_EMAIL || (await prompt(rl, 'Admin email', ''));
    let password = process.env.ADMIN_PASSWORD || '';
    if (!password) {
      password = await prompt(rl, 'Admin password (min 8 chars)');
    }
    if (!username || password.length < 8) {
      console.error('Username required and password must be at least 8 characters.');
      process.exit(1);
    }

    const id = randomUUID();
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, '').replace('Z', '');
    const hash = await hashPassword(password);

    const sql = `INSERT INTO users (id, username, email, password_hash, role, status, employee_id, created_at, updated_at)
VALUES ('${sqlEscape(id)}', '${sqlEscape(username)}', ${email ? `'${sqlEscape(email)}'` : 'NULL'}, '${sqlEscape(hash)}', 'ADMIN', 'ACTIVE', NULL, '${now}', '${now}');
`;
    writeFileSync(sqlPath, sql, 'utf8');

    const remote = process.env.D1_REMOTE === '1';
    console.log(`Creating ADMIN user "${username}" (${remote ? 'remote' : 'local'} D1)...`);
    execFileSync(
      'npx',
      [
        'wrangler',
        'd1',
        'execute',
        'hv-agency',
        remote ? '--remote' : '--local',
        '--file',
        sqlPath,
      ],
      { stdio: 'inherit', env: process.env, shell: true },
    );
    console.log(
      'Admin created successfully. Store the password securely — it is not saved in plaintext.',
    );
  } finally {
    rl.close();
    try {
      unlinkSync(sqlPath);
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
