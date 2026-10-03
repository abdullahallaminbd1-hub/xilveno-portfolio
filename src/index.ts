import type { Env, JsonRecord, ProjectRow, Session } from './types';
import { listRows, mediaById, projects, section, setting, settings } from './lib/db';
import { canAttemptLogin, clearSessionCookie, createSession, deleteSession, ensureAdmin, getSession, HttpError, isSecureRequest, recordLoginAttempt, requireCsrf, requireSession, sessionCookie, verifyPassword } from './lib/security';
import { esc, render404, renderHome, renderPage, renderProject, renderSearch, renderWork } from './lib/html';
import { ADMIN_CSS } from './lib/admin-css';

const jsonResponse = (data: unknown, status = 200, extra: HeadersInit = {}): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
const textResponse = (data: string, status = 200, headers: HeadersInit = {}): Response => new Response(data, { status, headers });
const methodIsMutation = (request: Request): boolean => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
const clientKey = (request: Request): string => request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

const readBody = async (request: Request): Promise<JsonRecord> => {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) return await request.json() as JsonRecord;
  const form = await request.formData();
  return Object.fromEntries(form.entries()) as JsonRecord;
};

const stringValue = (body: JsonRecord, key: string, fallback = ''): string => typeof body[key] === 'string' ? String(body[key]).trim() : fallback;
const intValue = (body: JsonRecord, key: string, fallback = 0): number => Number.isFinite(Number(body[key])) ? Number(body[key]) : fallback;
const boolValue = (body: JsonRecord, key: string, fallback = false): number => body[key] === undefined ? (fallback ? 1 : 0) : ['1', 'true', 'on', 'yes'].includes(String(body[key]).toLowerCase()) ? 1 : 0;
const validUrl = (value: string): boolean => value === '' || /^https?:\/\/[^\s]+$/i.test(value) || /^\/[A-Za-z0-9_?&=./#-]*$/.test(value);
const splitJsonList = (value: string): string => JSON.stringify(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean));
const jsonListValue = (body: JsonRecord, key: string): string => {
  const value = stringValue(body, key);
  if (!value) return '[]';
  if (value.startsWith('[')) {
    try { return JSON.stringify(JSON.parse(value)); } catch { return '[]'; }
  }
  return splitJsonList(value);
};
const validSlug = (value: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const mediaDimensions = (bytes: Uint8Array, mime: string): { width: number | null; height: number | null } => {
  if (mime === 'image/png' && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === 'image/webp' && bytes.length >= 30 && String.fromCharCode(...bytes.slice(12, 16)) === 'VP8X') {
    return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
  }
  if (mime === 'image/svg+xml') {
    const text = new TextDecoder().decode(bytes.slice(0, 2000));
    const width = Number(text.match(/\bwidth=["']([0-9.]+)/i)?.[1] || 0);
    const height = Number(text.match(/\bheight=["']([0-9.]+)/i)?.[1] || 0);
    return { width: width || null, height: height || null };
  }
  if (mime === 'image/jpeg') {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1]; const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: (bytes[offset + 7] << 8) + bytes[offset + 8], height: (bytes[offset + 5] << 8) + bytes[offset + 6] };
      offset += Math.max(length + 2, 2);
    }
  }
  return { width: null, height: null };
};

const rateLimitPublicInquiry = async (env: Env, request: Request): Promise<boolean> => {
  const key = `inquiry:${clientKey(request)}`;
  const now = Math.floor(Date.now() / 1000);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const encoded = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const cutoff = now - 3600;
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM audit_log WHERE action = ? AND entity = ? AND created_at >= datetime(?, \'unixepoch\')').bind(encoded, 'public-inquiry', cutoff).first<{ count: number }>();
  if (Number(row?.count || 0) >= 5) return false;
  await env.DB.prepare('INSERT INTO audit_log (action, entity, entity_id) VALUES (?, ?, ?)').bind(encoded, 'public-inquiry', encoded).run();
  return true;
};

const handleInquiry = async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  const body = await readBody(request);
  if (stringValue(body, 'company')) return jsonResponse({ ok: true, message: 'Thanks.' }, 200);
  const startedAt = Number(body.started_at || 0);
  if (!startedAt || Date.now() - startedAt < 1500) return jsonResponse({ error: 'Please take a moment before submitting.' }, 400);
  const token = stringValue(body, 'csrf_token');
  const expected = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('public_csrf_secret').first<{ value: string }>();
  if (!token || !expected?.value || token !== expected.value) return jsonResponse({ error: 'Invalid form token.' }, 403);
  if (!await rateLimitPublicInquiry(env, request)) return jsonResponse({ error: 'Too many inquiries from this connection. Please try again later.' }, 429);
  const name = stringValue(body, 'name'); const email = stringValue(body, 'email'); const message = stringValue(body, 'message');
  if (name.length < 2 || name.length > 120) return jsonResponse({ error: 'Please enter your name.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return jsonResponse({ error: 'Please enter a valid email address.' }, 400);
  if (message.length < 10 || message.length > 5000) return jsonResponse({ error: 'Please provide more project detail.' }, 400);
  const ipHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientKey(request)));
  const ipHash = [...new Uint8Array(ipHashBuffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO inquiries (name, email, project_type, budget, timeline, message, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(name, email, stringValue(body, 'project_type'), stringValue(body, 'budget'), stringValue(body, 'timeline'), message, ipHash, request.headers.get('User-Agent') || '').run();
  return jsonResponse({ ok: true, message: 'Your inquiry has been received. I will reply personally.' });
};

const adminLogin = async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  const key = `login:${clientKey(request)}`;
  if (!await canAttemptLogin(env, key)) return jsonResponse({ error: 'Too many login attempts. Try again later.' }, 429);
  await recordLoginAttempt(env, key);
  const body = await readBody(request); const email = stringValue(body, 'email').toLowerCase(); const password = stringValue(body, 'password');
  const admin = await env.DB.prepare('SELECT id, password_hash, password_salt FROM admins WHERE email = ?').bind(email).first<{ id: number; password_hash: string; password_salt: string }>();
  if (!admin || !await verifyPassword(password, admin.password_hash, admin.password_salt)) return jsonResponse({ error: 'Invalid email or password.' }, 401);
  const created = await createSession(env, admin.id);
  return jsonResponse({ ok: true, csrfToken: created.session.csrf_token }, 200, { 'Set-Cookie': sessionCookie(created.token, isSecureRequest(request)) });
};

const adminLogout = async (request: Request, env: Env): Promise<Response> => { await deleteSession(request, env); return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(isSecureRequest(request)) }); };

const dashboardData = async (env: Env): Promise<Response> => {
  const [projectsCount, featuredCount, mediaCount, inquiryCount, recent] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM projects').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM projects WHERE featured = 1').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM media').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM inquiries WHERE status = \'unread\'').first<{ count: number }>(),
    env.DB.prepare('SELECT action, entity, entity_id, created_at FROM audit_log ORDER BY id DESC LIMIT 10').all(),
  ]);
  return jsonResponse({ projects: Number(projectsCount?.count || 0), featuredProjects: Number(featuredCount?.count || 0), media: Number(mediaCount?.count || 0), unreadInquiries: Number(inquiryCount?.count || 0), recent: recent.results || [] });
};

const tableConfig: Record<string, { table: string; fields: string[]; required: string[] }> = {
  services: { table: 'services', fields: ['slug', 'title', 'icon', 'description', 'overview', 'audience', 'includes_json', 'workflow_json', 'sort_order', 'active'], required: ['slug', 'title'] },
  faqs: { table: 'faqs', fields: ['question', 'answer', 'sort_order', 'active'], required: ['question', 'answer'] },
  process: { table: 'process_steps', fields: ['title', 'description', 'sort_order', 'active'], required: ['title'] },
  skills: { table: 'skills', fields: ['title', 'description', 'icon', 'sort_order', 'active'], required: ['title'] },
  problems: { table: 'problems', fields: ['title', 'description', 'sort_order', 'active'], required: ['title'] },
  categories: { table: 'categories', fields: ['name', 'slug', 'description', 'sort_order'], required: ['name', 'slug'] },
};

const adminCollection = async (request: Request, env: Env, resource: string): Promise<Response> => {
  const session = await requireSession(request, env); const config = tableConfig[resource];
  if (!config) return jsonResponse({ error: 'Unknown resource.' }, 404);
  if (request.method === 'GET') return jsonResponse(await listRows<JsonRecord>(env, config.table));
  requireCsrf(request, session); const body = await readBody(request);
  if (request.method === 'POST') {
    for (const key of config.required) if (!stringValue(body, key)) return jsonResponse({ error: `${key} is required.` }, 400);
    const fields = config.fields; const values = fields.map((field) => field.endsWith('_json') ? (stringValue(body, field).startsWith('[') ? stringValue(body, field) : splitJsonList(stringValue(body, field))) : field === 'sort_order' ? intValue(body, field) : field === 'active' ? boolValue(body, field, true) : stringValue(body, field));
    const placeholders = fields.map(() => '?').join(', '); await env.DB.prepare(`INSERT INTO ${config.table} (${fields.join(', ')}) VALUES (${placeholders})`).bind(...values).run();
    await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity) VALUES (?, ?, ?)').bind(session.admin_id, 'create', resource).run(); return jsonResponse({ ok: true });
  }
  const id = intValue(body, 'id'); if (!id) return jsonResponse({ error: 'id is required.' }, 400);
  if (request.method === 'DELETE') { await env.DB.prepare(`DELETE FROM ${config.table} WHERE id = ?`).bind(id).run(); await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'delete', resource, id).run(); return jsonResponse({ ok: true }); }
  if (request.method === 'PUT' || request.method === 'PATCH') { const fields = config.fields.filter((field) => body[field] !== undefined); if (!fields.length) return jsonResponse({ error: 'No fields supplied.' }, 400); const values = fields.map((field) => field.endsWith('_json') ? (stringValue(body, field).startsWith('[') ? stringValue(body, field) : splitJsonList(stringValue(body, field))) : field === 'sort_order' ? intValue(body, field) : field === 'active' ? boolValue(body, field, true) : stringValue(body, field)); await env.DB.prepare(`UPDATE ${config.table} SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`).bind(...values, id).run(); await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'update', resource, id).run(); return jsonResponse({ ok: true }); }
  return jsonResponse({ error: 'Method not allowed.' }, 405);
};

const adminProjects = async (request: Request, env: Env): Promise<Response> => {
  const session = await requireSession(request, env);
  if (request.method === 'GET') return jsonResponse(await env.DB.prepare('SELECT p.*, c.name AS category_name FROM projects p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.sort_order ASC, p.updated_at DESC').all());
  requireCsrf(request, session); const body = await readBody(request); const fields = ['title', 'slug', 'short_description', 'full_description', 'category_id', 'project_type', 'platform', 'role', 'focus', 'status', 'featured', 'featured_image_id', 'case_study_media_id', 'live_demo_url', 'case_study_url', 'challenge', 'approach', 'solution', 'key_features_json', 'technologies_json', 'sort_order', 'published'];
  const id = intValue(body, 'id');
  if (request.method === 'DELETE') { if (!id) return jsonResponse({ error: 'id is required.' }, 400); await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run(); await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'delete', 'projects', id).run(); return jsonResponse({ ok: true }); }
  if (!stringValue(body, 'title') || !stringValue(body, 'slug')) return jsonResponse({ error: 'Title and slug are required.' }, 400);
  if (!validSlug(stringValue(body, 'slug'))) return jsonResponse({ error: 'Slug may contain lowercase letters, numbers, and hyphens.' }, 400);
  if (!validUrl(stringValue(body, 'live_demo_url')) || !validUrl(stringValue(body, 'case_study_url'))) return jsonResponse({ error: 'Invalid project URL.' }, 400);
  const values = fields.map((field) => ['category_id', 'featured_image_id', 'case_study_media_id'].includes(field) ? (body[field] ? intValue(body, field) : null) : ['featured', 'published'].includes(field) ? boolValue(body, field, field === 'published') : field.endsWith('_json') ? jsonListValue(body, field) : field === 'sort_order' ? intValue(body, field) : stringValue(body, field));
  if (request.method === 'POST') { const result = await env.DB.prepare(`INSERT INTO projects (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).bind(...values).run(); const projectId = Number(result.meta.last_row_id || 0); await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'create', 'projects', projectId).run(); return jsonResponse({ ok: true, id: projectId }); }
  if (!id) return jsonResponse({ error: 'id is required.' }, 400);
  if (request.method === 'PUT' || request.method === 'PATCH') { await env.DB.prepare(`UPDATE projects SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, id).run(); await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'update', 'projects', id).run(); return jsonResponse({ ok: true, id }); }
  return jsonResponse({ error: 'Method not allowed.' }, 405);
};

const adminInquiries = async (request: Request, env: Env): Promise<Response> => {
  const session = await requireSession(request, env);
  if (request.method === 'GET') {
    const status = new URL(request.url).searchParams.get('status');
    const query = status ? 'SELECT id, name, email, project_type, budget, timeline, message, status, created_at FROM inquiries WHERE status = ? ORDER BY created_at DESC' : 'SELECT id, name, email, project_type, budget, timeline, message, status, created_at FROM inquiries ORDER BY created_at DESC';
    const result = status ? await env.DB.prepare(query).bind(status).all() : await env.DB.prepare(query).all();
    return jsonResponse(result.results || []);
  }
  requireCsrf(request, session);
  const body = await readBody(request); const id = intValue(body, 'id');
  if (!id) return jsonResponse({ error: 'id is required.' }, 400);
  if (request.method === 'PATCH' || request.method === 'PUT') {
    const status = stringValue(body, 'status');
    if (!['unread', 'read', 'archived'].includes(status)) return jsonResponse({ error: 'Invalid inquiry status.' }, 400);
    await env.DB.prepare('UPDATE inquiries SET status = ? WHERE id = ?').bind(status, id).run();
    await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'update', 'inquiries', id).run();
    return jsonResponse({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM inquiries WHERE id = ?').bind(id).run();
    await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'delete', 'inquiries', id).run();
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Method not allowed.' }, 405);
};

const demoValues = (fields: string[], body: JsonRecord): unknown[] => fields.map((field) => (
  field === 'category_id'
    ? (body[field] ? intValue(body, field) : null)
    : field === 'sort_order' ? intValue(body, field) : stringValue(body, field)
));

const adminDemos = async (request: Request, env: Env): Promise<Response> => {
  const session = await requireSession(request, env);
  if (request.method === 'GET') return jsonResponse(await listRows<JsonRecord>(env, 'demos', '1 = 1', 'sort_order ASC'));
  requireCsrf(request, session); const body = await readBody(request); const fields = ['name', 'slug', 'subdomain', 'description', 'status', 'live_url', 'category_id', 'sort_order'];
  const id = intValue(body, 'id');
  if (request.method === 'DELETE') {
    if (!id) return jsonResponse({ error: 'id is required.' }, 400);
    await env.DB.prepare('DELETE FROM demos WHERE id = ?').bind(id).run();
    await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'delete', 'demos', id).run();
    return jsonResponse({ ok: true });
  }
  if (request.method === 'PUT' || request.method === 'PATCH') {
    if (!id) return jsonResponse({ error: 'id is required.' }, 400);
    const provided = fields.filter((field) => body[field] !== undefined);
    if (!provided.length) return jsonResponse({ error: 'No fields supplied.' }, 400);
    // Only validate the identity fields when this request actually changes them,
    // so a partial update such as "mark as configured" keeps working.
    if (provided.some((field) => ['name', 'slug', 'subdomain'].includes(field))) {
      const current = await env.DB.prepare('SELECT name, slug, subdomain FROM demos WHERE id = ?').bind(id).first<{ name: string; slug: string; subdomain: string }>();
      if (!current) return jsonResponse({ error: 'Demo not found.' }, 404);
      const name = body.name === undefined ? current.name : stringValue(body, 'name');
      const slug = body.slug === undefined ? current.slug : stringValue(body, 'slug');
      const subdomain = body.subdomain === undefined ? current.subdomain : stringValue(body, 'subdomain');
      if (!name || !slug || !subdomain) return jsonResponse({ error: 'Name, slug, and subdomain are required.' }, 400);
      if (!/^[a-z0-9-]+$/.test(slug) || !/^[a-z0-9-]+\.xilveno\.shop$/.test(subdomain)) return jsonResponse({ error: 'Use a slug and subdomain such as dental.xilveno.shop.' }, 400);
    }
    await env.DB.prepare(`UPDATE demos SET ${provided.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`).bind(...demoValues(provided, body), id).run();
    await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'update', 'demos', id).run();
    return jsonResponse({ ok: true });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  const name = stringValue(body, 'name'); const slug = stringValue(body, 'slug'); const subdomain = stringValue(body, 'subdomain');
  if (!name || !slug || !subdomain) return jsonResponse({ error: 'Name, slug, and subdomain are required.' }, 400);
  if (!/^[a-z0-9-]+$/.test(slug) || !/^[a-z0-9-]+\.xilveno\.shop$/.test(subdomain)) return jsonResponse({ error: 'Use a slug and subdomain such as dental.xilveno.shop.' }, 400);
  const duplicate = await env.DB.prepare('SELECT id FROM demos WHERE slug = ? OR subdomain = ?').bind(slug, subdomain).first<{ id: number }>();
  if (duplicate) return jsonResponse({ error: 'That demo slug or subdomain is already in use.' }, 409);
  await env.DB.prepare(`INSERT INTO demos (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).bind(...demoValues(fields, body)).run();
  await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity) VALUES (?, ?, ?)').bind(session.admin_id, 'create', 'demos').run();
  return jsonResponse({ ok: true });
};

const adminSettings = async (request: Request, env: Env): Promise<Response> => {
  const session = await requireSession(request, env);
  if (request.method === 'GET') return jsonResponse(await settings(env));
  requireCsrf(request, session);
  const body = await readBody(request);
  const allowed = ['site_name', 'tagline', 'email', 'phone', 'whatsapp', 'location', 'seo_title', 'seo_home_description', 'default_og_image', 'canonical_base', 'robots_mode', 'privacy_url', 'terms_url', 'social_links', 'favicon_media_id', 'about_image_media_id'];
  const socialKeys = ['facebook', 'instagram', 'linkedin', 'behance', 'dribbble', 'other'];
  const social = socialKeys.reduce<Record<string, string>>((result, key) => { if (body[key] !== undefined) result[key] = stringValue(body, key); return result; }, {});
  if (body.social_links !== undefined) {
    try { Object.assign(social, JSON.parse(stringValue(body, 'social_links'))); } catch { return jsonResponse({ error: 'Social links must be valid JSON.' }, 400); }
  }
  const values: Record<string, unknown> = { ...body, ...(Object.keys(social).length ? { social_links: JSON.stringify(social) } : {}) };
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.includes(key)) continue;
    if (['default_og_image', 'canonical_base', 'privacy_url', 'terms_url'].includes(key) && !validUrl(String(value))) return jsonResponse({ error: `Invalid URL for ${key}.` }, 400);
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').bind(key, String(value)).run();
  }
  await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity) VALUES (?, ?, ?)').bind(session.admin_id, 'update', 'settings').run();
  return jsonResponse({ ok: true });
};

const verifyImage = async (bytes: ArrayBuffer, mime: string): Promise<boolean> => { const header = new Uint8Array(bytes).slice(0, 12); if (mime === 'image/png') return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47; if (mime === 'image/jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff; if (mime === 'image/webp') return String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP'; if (mime === 'image/svg+xml') return new TextDecoder().decode(bytes.slice(0, 500)).trimStart().startsWith('<svg') || new TextDecoder().decode(bytes.slice(0, 500)).includes('<svg'); return false; };

const adminMedia = async (request: Request, env: Env): Promise<Response> => {
  const session = await requireSession(request, env);
  if (methodIsMutation(request)) requireCsrf(request, session);
  if (request.method === 'GET') {
    const query = new URL(request.url).searchParams.get('q') || '';
    const result = query ? await env.DB.prepare('SELECT * FROM media WHERE filename LIKE ? ORDER BY created_at DESC').bind(`%${query}%`).all() : await env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
    return jsonResponse(result.results || []);
  }
  if (request.method === 'DELETE') { const body = await readBody(request); const id = intValue(body, 'id'); const media = await env.DB.prepare('SELECT object_key FROM media WHERE id = ?').bind(id).first<{ object_key: string }>(); if (media) { await env.MEDIA.delete(media.object_key); await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run(); await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'delete', 'media', id).run(); } return jsonResponse({ ok: true }); }
  if (request.method === 'PATCH') { const body = await readBody(request); const id = intValue(body, 'id'); if (!id) return jsonResponse({ error: 'id is required.' }, 400); await env.DB.prepare('UPDATE media SET alt_text = ? WHERE id = ?').bind(stringValue(body, 'alt_text'), id).run(); return jsonResponse({ ok: true }); }
  if (request.method !== 'POST' && request.method !== 'PUT') return jsonResponse({ error: 'Method not allowed.' }, 405);
  const form = await request.formData(); const files = form.getAll('files').concat(form.get('file') || []).filter((value): value is File => value instanceof File); if (!files.length) return jsonResponse({ error: 'Image file is required.' }, 400);
  const replaceId = intValue(Object.fromEntries(form.entries()) as JsonRecord, 'id');
  const uploaded: JsonRecord[] = [];
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) return jsonResponse({ error: 'Image exceeds the 8 MB limit.' }, 400);
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']); if (!allowed.has(file.type)) return jsonResponse({ error: 'Unsupported image type.' }, 400);
    const bytes = await file.arrayBuffer(); if (!await verifyImage(bytes, file.type)) return jsonResponse({ error: 'Image signature does not match its MIME type.' }, 400);
    const key = `media/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-120)}`; const object = await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } }); const dimensions = mediaDimensions(new Uint8Array(bytes), file.type);
    if (request.method === 'PUT' && replaceId) { const old = await env.DB.prepare('SELECT object_key FROM media WHERE id = ?').bind(replaceId).first<{ object_key: string }>(); if (old) await env.MEDIA.delete(old.object_key); await env.DB.prepare('UPDATE media SET object_key = ?, filename = ?, mime_type = ?, byte_size = ?, width = ?, height = ?, alt_text = ?, etag = ? WHERE id = ?').bind(key, file.name, file.type, file.size, dimensions.width, dimensions.height, stringValue(Object.fromEntries(form.entries()) as JsonRecord, 'alt_text'), object?.etag || '', replaceId).run(); uploaded.push({ id: replaceId, key }); } else { const result = await env.DB.prepare('INSERT INTO media (object_key, filename, mime_type, byte_size, width, height, alt_text, etag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(key, file.name, file.type, file.size, dimensions.width, dimensions.height, stringValue(Object.fromEntries(form.entries()) as JsonRecord, 'alt_text'), object?.etag || '').run(); uploaded.push({ id: Number(result.meta.last_row_id || 0), key }); }
  }
  return jsonResponse({ ok: true, media: uploaded });
};

const adminProjectGallery = async (request: Request, env: Env): Promise<Response> => {
  const session = await requireSession(request, env);
  const body = request.method === 'GET' ? null : await readBody(request);
  const projectId = intValue(body || Object.fromEntries(new URL(request.url).searchParams.entries()) as JsonRecord, 'project_id');
  if (!projectId) return jsonResponse({ error: 'project_id is required.' }, 400);
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT m.*, pg.sort_order FROM project_gallery pg JOIN media m ON m.id = pg.media_id WHERE pg.project_id = ? ORDER BY pg.sort_order ASC, m.id ASC').bind(projectId).all();
    return jsonResponse(rows.results || []);
  }
  requireCsrf(request, session);
  if (request.method === 'PUT' || request.method === 'POST') {
    const mediaIds = Array.isArray(body?.media_ids) ? body?.media_ids.map((value) => Number(value)).filter(Boolean) : [];
    await env.DB.prepare('DELETE FROM project_gallery WHERE project_id = ?').bind(projectId).run();
    for (const [index, mediaId] of mediaIds.entries()) await env.DB.prepare('INSERT INTO project_gallery (project_id, media_id, sort_order) VALUES (?, ?, ?)').bind(projectId, mediaId, index).run();
    await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'update', 'project_gallery', projectId).run();
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Method not allowed.' }, 405);
};

const mediaObject = async (request: Request, env: Env, key: string): Promise<Response> => { const object = await env.MEDIA.get(decodeURIComponent(key)); if (!object) return textResponse('Not found', 404); const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('etag', object.httpEtag); headers.set('Cache-Control', 'public, max-age=31536000, immutable'); return new Response(object.body, { headers }); };

/**
 * Serves the selected site favicon or the built-in SVG fallback.
 */
const brandingAsset = async (request: Request, env: Env): Promise<Response> => {
  const settingKey = 'favicon_media_id';
  const fallback = '/assets/images/favicon.svg';
  const id = await setting(env, settingKey, '');
  const media = id ? await mediaById(env, id) : null;
  if (media) return Response.redirect(new URL(`/media/${encodeURIComponent(media.object_key)}`, request.url).toString(), 302);
  return env.ASSETS.fetch(new Request(new URL(fallback, request.url).toString(), { headers: request.headers }));
};

const adminPage = (pathname: string): Response => {
  const login = pathname === '/admin/login';
  const title = login ? 'Sign in · Xilveno admin' : 'Xilveno admin';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${title}</title><link rel="icon" href="/branding/favicon"><style>${ADMIN_CSS}</style></head><body class="admin-body"><div id="admin-app" data-login="${login ? 'true' : 'false'}" data-page="${esc(pathname)}"><div class="admin-shell"><div class="admin-card">Loading the admin panel…</div></div></div><script type="module" src="/assets/js/admin.js"></script></body></html>`;
  return textResponse(html, 200, { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' });
};


const handleApi = async (request: Request, env: Env, pathname: string): Promise<Response> => {
  if (pathname === '/api/inquiries') return handleInquiry(request, env);
  if (pathname === '/api/auth/login') return adminLogin(request, env);
  if (pathname === '/api/auth/logout') return adminLogout(request, env);
  if (pathname === '/api/admin/session') { const session = await getSession(request, env); return session ? jsonResponse({ authenticated: true, csrfToken: session.csrf_token }) : jsonResponse({ authenticated: false }, 401); }
  if (pathname === '/api/admin/dashboard') { await requireSession(request, env); return dashboardData(env); }
  if (pathname === '/api/admin/settings') return adminSettings(request, env);
  if (pathname === '/api/admin/projects') return adminProjects(request, env);
  if (pathname === '/api/admin/inquiries') return adminInquiries(request, env);
  if (pathname === '/api/admin/demos') return adminDemos(request, env);
  if (pathname.startsWith('/api/admin/media')) return adminMedia(request, env);
  if (pathname === '/api/admin/project-gallery') return adminProjectGallery(request, env);
  const collectionMatch = pathname.match(/^\/api\/admin\/(services|faqs|process|skills|categories|problems)$/); if (collectionMatch) return adminCollection(request, env, collectionMatch[1]);
  if (pathname === '/api/admin/home') { const session = await requireSession(request, env); if (request.method === 'GET') { const keys = ['hero', 'services_heading', 'problems_heading', 'work_heading', 'process_heading', 'skills_heading', 'faq_heading', 'cta', 'about']; const result: Record<string, unknown> = {}; for (const key of keys) result[key] = await section(env, key, {}); return jsonResponse(result); } requireCsrf(request, session); const body = await readBody(request); for (const [key, value] of Object.entries(body)) if (['hero', 'services_heading', 'problems_heading', 'work_heading', 'process_heading', 'skills_heading', 'faq_heading', 'cta', 'about'].includes(key)) await env.DB.prepare('INSERT OR REPLACE INTO home_sections (section_key, content_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').bind(key, typeof value === 'string' ? value : JSON.stringify(value)).run(); return jsonResponse({ ok: true }); }
  return jsonResponse({ error: 'Not found.' }, 404);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      await ensureAdmin(env);
      const requestUrl = new URL(request.url); const pathname = requestUrl.pathname.replace(/\/+/g, '/');
      if (pathname.startsWith('/api/')) return await handleApi(request, env, pathname);
      if (pathname.startsWith('/admin')) { if (pathname === '/admin' || pathname === '/admin/') return Response.redirect(new URL('/admin/dashboard', request.url), 302); return adminPage(pathname); }
      if (pathname === '/branding/favicon') return brandingAsset(request, env);
      if (pathname.startsWith('/media/')) return mediaObject(request, env, pathname.slice('/media/'.length));
      if (pathname === '/') return renderHome(env, requestUrl);
      if (pathname === '/work' || pathname === '/work/') return renderWork(env, requestUrl);
      if (pathname.startsWith('/work/')) return renderProject(env, requestUrl, pathname.slice('/work/'.length).replace(/\/$/, ''));
      if (pathname === '/search' || pathname === '/search/') return renderSearch(env, requestUrl);
      if (['about', 'services', 'process', 'faq', 'contact'].some((slug) => pathname === `/${slug}` || pathname === `/${slug}/`)) return renderPage(env, requestUrl, pathname.split('/')[1]);
      if (pathname === '/robots.txt') return textResponse(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${new URL('/sitemap.xml', request.url).toString()}\n`, 200, { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'public, max-age=3600' });
      if (pathname === '/sitemap.xml') { const rows = await projects(env); const base = (await settings(env)).canonical_base || new URL(request.url).origin; const urls = ['/', '/work/', '/about/', '/services/', '/process/', '/faq/', '/contact/', ...rows.map((row) => `/work/${row.slug}/`)]; return textResponse(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((item) => `<url><loc>${esc(new URL(item, base).toString())}</loc></url>`).join('')}</urlset>`, 200, { 'Content-Type': 'application/xml; charset=UTF-8', 'Cache-Control': 'public, max-age=3600' }); }
      if (pathname.startsWith('/assets/')) return env.ASSETS.fetch(request);
      return render404(env, requestUrl);
    } catch (error) {
      if (error instanceof HttpError || (error && typeof error === 'object' && (error as { name?: unknown }).name === 'HttpError' && typeof (error as { status?: unknown }).status === 'number')) {
        const httpError = error as HttpError;
        return jsonResponse(httpError.payload || { error: httpError.message }, httpError.status);
      }
      console.error(error);
      return jsonResponse({ error: 'Internal server error.' }, 500);
    }
  },
};