import type { Env, Session } from '../types';

export class HttpError extends Error {
  readonly status: number;
  readonly payload: Record<string, string>;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.payload = { error: message };
  }
}

const SESSION_TTL_SECONDS = 60 * 60 * 4;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 8;

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const fromBase64Url = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const randomToken = (bytes = 32): string => toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const sha256 = async (value: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

const derivePasswordKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);

export const hashPassword = async (password: string): Promise<{ hash: string; salt: string }> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derivePasswordKey(password, salt);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 120_000, hash: 'SHA-256' }, key, 256);
  return { hash: toBase64Url(new Uint8Array(bits)), salt: toBase64Url(salt) };
};

export const verifyPassword = async (password: string, hash: string, encodedSalt: string): Promise<boolean> => {
  const salt = fromBase64Url(encodedSalt);
  const key = await derivePasswordKey(password, salt);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 120_000, hash: 'SHA-256' }, key, 256);
  const actual = toBase64Url(new Uint8Array(bits));
  return actual === hash;
};

export const getCookie = (request: Request, name: string): string => {
  const header = request.headers.get('Cookie') || '';
  const match = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
};

export const sessionCookie = (token: string, secure: boolean): string =>
  `xc_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;

export const clearSessionCookie = (secure: boolean): string =>
  `xc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

export const ensureAdmin = async (env: Env): Promise<void> => {
  const existing = await env.DB.prepare('SELECT id FROM admins LIMIT 1').first<{ id: number }>();
  if (existing || !env.ADMIN_BOOTSTRAP_PASSWORD) return;
  const { hash, salt } = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD);
  await env.DB.prepare('INSERT INTO admins (email, password_hash, password_salt) VALUES (?, ?, ?)')
    .bind('admin@xilveno.shop', hash, salt).run();
};

export const canAttemptLogin = async (env: Env, key: string): Promise<boolean> => {
  const hash = await sha256(key);
  const cutoff = Math.floor(Date.now() / 1000) - LOGIN_WINDOW_SECONDS;
  await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(cutoff).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE key_hash = ? AND attempted_at >= ?')
    .bind(hash, cutoff).first<{ count: number }>();
  return Number(row?.count || 0) < LOGIN_MAX_ATTEMPTS;
};

export const recordLoginAttempt = async (env: Env, key: string): Promise<void> => {
  await env.DB.prepare('INSERT INTO login_attempts (key_hash, attempted_at) VALUES (?, ?)')
    .bind(await sha256(key), Math.floor(Date.now() / 1000)).run();
};

export const getSession = async (request: Request, env: Env): Promise<Session | null> => {
  const token = getCookie(request, 'xc_session');
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT id, admin_id, csrf_token, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(tokenHash, Math.floor(Date.now() / 1000)).first<Session>();
  if (!row) return null;
  return row;
};

export const requireSession = async (request: Request, env: Env): Promise<Session> => {
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, 'Authentication required.');
  return session;
};

export const requireCsrf = (request: Request, session: Session): void => {
  const token = request.headers.get('X-CSRF-Token') || '';
  if (!token || token !== session.csrf_token) throw new HttpError(403, 'Invalid CSRF token.');
};

export const createSession = async (env: Env, adminId: number): Promise<{ token: string; session: Session }> => {
  const token = randomToken(32);
  const session = { admin_id: adminId, csrf_token: randomToken(24), expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  await env.DB.prepare('INSERT INTO sessions (token_hash, admin_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), adminId, session.csrf_token, session.expires_at).run();
  const stored = await env.DB.prepare('SELECT id, admin_id, csrf_token, expires_at FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token)).first<Session>();
  if (!stored) throw new Error('Could not create session');
  return { token, session: stored };
};

export const deleteSession = async (request: Request, env: Env): Promise<void> => {
  const token = getCookie(request, 'xc_session');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
};

export const isSecureRequest = (request: Request): boolean => new URL(request.url).protocol === 'https:';