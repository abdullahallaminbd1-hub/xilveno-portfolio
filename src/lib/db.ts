import type { Env, JsonRecord, MediaRow, PageRow, ProjectRow, SettingRow } from '../types';

export const json = <T>(value: string, fallback: T): T => {
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

export const settings = async (env: Env): Promise<Record<string, string>> => {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all<SettingRow>();
  return Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]));
};

export const setting = async (env: Env, key: string, fallback = ''): Promise<string> => {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
};

export const section = async <T extends JsonRecord>(env: Env, key: string, fallback: T): Promise<T> => {
  const row = await env.DB.prepare('SELECT content_json FROM home_sections WHERE section_key = ?').bind(key).first<{ content_json: string }>();
  return row ? json<T>(row.content_json, fallback) : fallback;
};

export const page = async (env: Env, slug: string): Promise<PageRow | null> =>
  env.DB.prepare('SELECT slug, title, excerpt, body, seo_title, seo_description FROM pages WHERE slug = ?').bind(slug).first<PageRow>();

export const projects = async (env: Env, options: { featured?: boolean; category?: string; search?: string } = {}): Promise<ProjectRow[]> => {
  const conditions = ['p.published = 1'];
  const values: (string | number)[] = [];
  if (options.featured) conditions.push('p.featured = 1');
  if (options.category) { conditions.push('c.slug = ?'); values.push(options.category); }
  if (options.search) { conditions.push('(p.title LIKE ? OR p.short_description LIKE ? OR p.full_description LIKE ?)'); const term = `%${options.search}%`; values.push(term, term, term); }
  const query = `SELECT p.*, c.name AS category_name FROM projects p LEFT JOIN categories c ON c.id = p.category_id WHERE ${conditions.join(' AND ')} ORDER BY p.sort_order ASC, p.updated_at DESC`;
  const result = await env.DB.prepare(query).bind(...values).all<ProjectRow>();
  return result.results || [];
};

export const projectBySlug = async (env: Env, slug: string): Promise<ProjectRow | null> =>
  env.DB.prepare('SELECT p.*, c.name AS category_name FROM projects p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.published = 1').bind(slug).first<ProjectRow>();

export const projectGallery = async (env: Env, projectId: number): Promise<MediaRow[]> => {
  const result = await env.DB.prepare('SELECT m.id, m.object_key, m.filename, m.mime_type, m.byte_size, m.width, m.height, m.alt_text, m.etag FROM project_gallery pg JOIN media m ON m.id = pg.media_id WHERE pg.project_id = ? ORDER BY pg.sort_order ASC, m.id ASC')
    .bind(projectId)
    .all<MediaRow>();
  return result.results || [];
};

export const mediaById = async (env: Env, id: unknown): Promise<MediaRow | null> => {
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return await env.DB.prepare('SELECT id, object_key, filename, mime_type, byte_size, width, height, alt_text, etag FROM media WHERE id = ?')
    .bind(numeric)
    .first<MediaRow>();
};

export const mediaUrl = (row: MediaRow | null | undefined): string =>
  row ? `/media/${encodeURIComponent(row.object_key)}` : '';

export const listRows = async <T>(env: Env, table: string, where = '1 = 1', order = 'sort_order ASC'): Promise<T[]> => {
  const allowed = new Set(['skills', 'services', 'problems', 'process_steps', 'faqs', 'categories', 'navigation', 'inquiries', 'media', 'demos']);
  if (!allowed.has(table)) throw new Error('Invalid table');
  const result = await env.DB.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${order}`).all<T>();
  return result.results || [];
};