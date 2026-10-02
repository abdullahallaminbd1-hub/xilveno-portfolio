#!/usr/bin/env node
/**
 * Reset the password of the EXISTING remote admin account (D1, --remote).
 *
 * Modes:
 * - Interactive (default): a hidden, double-confirmed password prompt
 *   implemented in pure Node.js (raw-mode stdin, nothing echoed, no
 *   PowerShell). Run it from a real terminal, e.g. the VS Code terminal:
 *       npm run admin:reset-remote-password
 * - --generate: non-interactive mode for automated use. A strong random
 *   password is created in memory, used for the reset and login verification,
 *   then stored ONLY in a private temp file outside the repository. It is
 *   never passed via argv, shell history, logs, or terminal output.
 *   Optional: --url=<worker-url> or env ADMIN_BASE_URL.
 *
 * The password is hashed exactly like src/lib/security.ts:
 * PBKDF2-SHA256, 100000 iterations, 256-bit key, 16-byte salt,
 * base64url-encoded hash and salt.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, pbkdf2 } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);

const DB_NAME = 'xilveno-portfolio-db';
const DEFAULT_BASE_URL = 'https://xilveno-portfolio.abdullahallaminbd1.workers.dev';
const PBKDF2_ITERATIONS = 100_000;
const MIN_LENGTH = 12;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wranglerJs = path.join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const toBase64Url = (buffer) => buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');

/**
 * Read one line from `input` WITHOUT echoing any character (hidden input).
 * Pure Node.js: switches the terminal to raw mode and handles Enter,
 * Backspace, Ctrl+C and escape sequences itself. No child processes.
 */
export const readHidden = ({ input, output, prompt }) => new Promise((resolve, reject) => {
  if (!input.isTTY) {
    reject(new Error('Hidden input needs an interactive terminal (stdin is not a TTY). '
      + 'Run this script from your VS Code terminal, or use --generate for automation.'));
    return;
  }
  output.write(prompt);
  let value = '';
  let escaping = false;
  input.setRawMode(true);
  input.setEncoding('utf8');
  input.resume();
  const finish = (aborted) => {
    input.off('data', onData);
    try { input.read(); } catch { /* discard buffered input */ }
    input.setRawMode(false);
    input.pause();
    output.write('\n');
    if (aborted) reject(new Error('Cancelled by user.'));
    else resolve(value);
  };
  const onData = (chunk) => {
    for (const char of chunk) {
      if (char === '\r' || char === '\n') { finish(false); return; } // Enter submits
      if (char === '\x03') { finish(true); return; } // Ctrl+C aborts
      if (char === '\x7f' || char === '\b') { value = value.slice(0, -1); continue; } // Backspace
      if (char === '\x1b') { escaping = true; continue; } // swallow escape sequences (arrows, etc.)
      if (escaping) { if (/[A-Za-z~]/.test(char)) escaping = false; continue; }
      if (char < ' ') continue; // other control characters are ignored
      value += char; // printable character appended silently (never echoed)
    }
  };
  input.on('data', onData);
});

/** Same algorithm/parameters/encoding as hashPassword() in src/lib/security.ts. */
export const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const derived = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return { hash: toBase64Url(derived), salt: toBase64Url(salt) };
};

/* ------------------------- remote helpers (D1 / wrangler) ------------------------- */

/** Run the locally installed wrangler CLI directly under this Node binary (reliable on Windows). */
const wrangler = (args) => {
  try {
    return execFileSync(process.execPath, [wranglerJs, ...args], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || '').trim().slice(0, 500);
    throw new Error(`wrangler ${args[0] || ''} failed: ${detail}`);
  }
};

const parseWranglerJson = (stdout) => {
  const text = String(stdout).trim();
  const start = text.indexOf('[');
  const json = start === -1 ? text : text.slice(start, text.lastIndexOf(']') + 1);
  return JSON.parse(json);
};

/** Single-statement SELECT against remote D1; returns the result rows. */
const d1Select = (sql) => parseWranglerJson(wrangler([
  'd1', 'execute', DB_NAME, '--remote', '--json', `--command=${sql}`,
]))[0]?.results ?? [];

/** Run a statement that may contain credentials via a temp SQL file so it never appears in argv/history. */
const d1ExecuteFile = (sql) => {
  const file = path.join(tmpdir(), `xilveno-reset-${randomBytes(6).toString('hex')}.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  try {
    return parseWranglerJson(wrangler(['d1', 'execute', DB_NAME, '--remote', '--json', `--file=${file}`]));
  } finally {
    try { unlinkSync(file); } catch { /* already removed */ }
  }
};

/* --------------------------- deployed login verification -------------------------- */

const verifyLogin = async (baseUrl, email, password) => {
  const timed = { signal: AbortSignal.timeout(30_000) };
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }), ...timed,
  });
  if (login.status !== 200) return { ok: false, reason: `login HTTP ${login.status}` };
  const data = await login.json().catch(() => ({}));
  if (data.ok !== true) return { ok: false, reason: 'login response missing ok' };
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) return { ok: false, reason: 'no session cookie issued' };
  const session = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: cookie }, ...timed })
    .then((response) => response.json()).catch(() => ({}));
  if (session.authenticated !== true) return { ok: false, reason: 'session not authenticated' };
  await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { Cookie: cookie }, body: '{}', ...timed,
  }).catch(() => { /* best-effort cleanup */ });
  return { ok: true };
};

/* ------------------------------------ main --------------------------------------- */

const parseArgs = () => {
  const args = process.argv.slice(2);
  const urlArg = args.find((arg) => arg.startsWith('--url='));
  const baseUrl = urlArg
    ? urlArg.slice('--url='.length)
    : (process.env.ADMIN_BASE_URL || DEFAULT_BASE_URL);
  return { generate: args.includes('--generate'), baseUrl: baseUrl.replace(/\/+$/, '') };
};

const obtainPassword = async ({ generate }) => {
  if (generate) return randomBytes(18).toString('base64url'); // strong, never logged or printed
  const password = await readHidden({ input: process.stdin, output: process.stdout, prompt: 'New remote admin password: ' });
  const confirmation = await readHidden({ input: process.stdin, output: process.stdout, prompt: 'Confirm new remote admin password: ' });
  if (!password || password !== confirmation || password.length < MIN_LENGTH) {
    throw new Error('Passwords must match and be at least 12 characters long.');
  }
  return password;
};

const main = async () => {
  const { generate, baseUrl } = parseArgs();

  const existing = d1Select('SELECT id, email FROM admins ORDER BY id LIMIT 1');
  const admin = existing[0];
  if (!admin) {
    throw new Error('No remote admin row exists. This script only UPDATES an existing admin; '
      + 'trigger bootstrap (ADMIN_BOOTSTRAP_PASSWORD) first so ensureAdmin creates the initial row.');
  }
  const adminId = Number(admin.id);
  if (!Number.isInteger(adminId) || adminId < 1) throw new Error('Invalid admin id read from D1.');
  const countBefore = Number(d1Select('SELECT COUNT(*) AS admin_count FROM admins')[0]?.admin_count ?? 0);
  console.log(`Existing admin account: ${admin.email} (id ${adminId}); admin rows: ${countBefore}`);

  const password = await obtainPassword({ generate });
  const { hash, salt } = await hashPassword(password); // identical to src/lib/security.ts scheme

  d1ExecuteFile(`UPDATE admins SET password_hash = '${hash}', password_salt = '${salt}', `
    + `updated_at = CURRENT_TIMESTAMP WHERE id = ${adminId};`);

  const updated = d1Select(`SELECT password_hash, password_salt FROM admins WHERE id = ${adminId}`)[0];
  const countAfter = Number(d1Select('SELECT COUNT(*) AS admin_count FROM admins')[0]?.admin_count ?? 0);
  const resetOk = updated?.password_hash === hash && updated?.password_salt === salt;
  const updatedOk = resetOk && countAfter === countBefore && countAfter === 1;

  console.log(`password reset: ${resetOk ? 'SUCCESS' : 'FAIL'}`);
  console.log(`existing admin account updated: ${updatedOk ? 'YES' : 'NO'}`);

  let loginOk = false;
  let loginReason = resetOk ? '' : 'reset did not succeed';
  if (resetOk) {
    const result = await verifyLogin(baseUrl, admin.email, password);
    loginOk = result.ok;
    loginReason = result.reason || '';
  }
  console.log(`remote admin login: ${loginOk ? 'SUCCESS' : `FAIL${loginReason ? ` (${loginReason})` : ''}`}`);

  if (generate && resetOk) {
    const passwordFile = path.join(tmpdir(), 'xilveno-portfolio-admin-password.txt');
    writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
    console.log(`Generated password stored locally, outside the repository (contents never logged): ${passwordFile}`);
    console.log('Read that file to sign in, or re-run interactively to choose your own password.');
  }

  if (!resetOk || !updatedOk || !loginOk) process.exitCode = 1;
};

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isMain = entry === fileURLToPath(import.meta.url)
  || (entry && path.basename(entry) === 'reset-remote-admin-password.mjs');
if (isMain) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message || error}`);
    process.exit(1);
  });
}


