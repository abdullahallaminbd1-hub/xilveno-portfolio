import { readFileSync } from 'node:fs';

const base = 'http://127.0.0.1:8787';
const vars = Object.fromEntries(
  readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

let cookie = '';
let csrf = '';

const call = async (name, path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (options.body !== undefined && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (options.method && options.method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  try {
    const response = await fetch(base + path, { ...options, headers });
    const setCookie = response.headers.getSetCookie?.() || [];
    for (const item of setCookie) cookie = item.split(';')[0] || cookie;
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    console.log(`${name}: ${response.status} ${typeof data === 'string' ? data.slice(0, 120) : JSON.stringify(data).slice(0, 200)}`);
    return { ok: response.ok, data };
  } catch (error) {
    console.log(`${name}: THROW ${error.message}`);
    return { ok: false, data: null };
  }
};

const login = await call('POST /api/auth/login', '/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@xilveno.shop', password: vars.ADMIN_BOOTSTRAP_PASSWORD }),
});
csrf = login.data?.csrfToken || '';

await call('POST /api/admin/projects (create QA)', '/api/admin/projects', {
  method: 'POST',
  body: JSON.stringify({
    title: 'QA Test Project', slug: 'qa-test-project', short_description: 'QA', project_type: 'Concept Project',
    status: 'Concept', key_features_json: '["one","two"]', technologies_json: 'HTML\nCSS', sort_order: '99',
    featured: 'false', published: 'false', live_demo_url: '', case_study_url: '',
  }),
});

const projects = await call('GET /api/admin/projects', '/api/admin/projects');
const qa = (projects.data?.results || []).find((row) => row.slug === 'qa-test-project');
if (qa) console.log('QA project:', qa.id, 'features=', qa.key_features_json, 'tech=', qa.technologies_json);
if (qa) {
  await call('PUT /api/admin/projects (publish)', '/api/admin/projects', {
    method: 'PUT',
    body: JSON.stringify({ id: qa.id, title: qa.title, slug: qa.slug, published: 'true', featured: 'true' }),
  });
  await call('PUT gallery (empty)', '/api/admin/project-gallery', {
    method: 'PUT',
    body: JSON.stringify({ project_id: qa.id, media_ids: [] }),
  });
  await call('DELETE /api/admin/projects', '/api/admin/projects', { method: 'DELETE', body: JSON.stringify({ id: qa.id }) });
}
const services = await call('GET /api/admin/services', '/api/admin/services');
const testService = (Array.isArray(services.data) ? services.data : []).find((row) => row.slug === 'qa-test-service');
if (testService) {
  await call('DELETE /api/admin/services', '/api/admin/services', { method: 'DELETE', body: JSON.stringify({ id: testService.id }) });
}
const home = await call('GET /api/admin/home', '/api/admin/home');
console.log('home sections:', home.ok ? Object.keys(home.data).join(',') : 'n/a');
const after = await call('GET /api/admin/projects (final)', '/api/admin/projects');
const leftover = (after.data?.results || []).filter((row) => row.slug?.startsWith('qa-test'));
console.log('leftover QA rows:', leftover.length);
