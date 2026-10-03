#!/usr/bin/env node
/**
 * Browser regression check for the admin panel.
 *
 * Signs in with a real browser and visits every admin screen, failing on
 * console errors, page errors and missing landmarks. Screenshots are written
 * to the directory given by --out (default: .qa-admin).
 *
 *   node scripts/qa-admin-panel.mjs --url=http://127.0.0.1:8790 \
 *        --email=admin@xilveno.shop --password=... [--viewport=1440x900] [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback = '') => {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const baseUrl = arg('url', 'http://127.0.0.1:8790').replace(/\/+$/, '');
const email = arg('email', 'admin@xilveno.shop');
const password = arg('password', '');
const [width, height] = arg('viewport', '1440x900').split('x').map(Number);
const outDir = path.resolve(arg('out', '.qa-admin'));
mkdirSync(outDir, { recursive: true });

const PAGES = [
  { name: 'dashboard', path: '/admin/dashboard', selector: '.admin-stat' },
  { name: 'home-editor', path: '/admin/home', selector: '[data-frame]' },
  { name: 'home-editor-panel', path: '/admin/home', selector: '[data-home-form]' },
  { name: 'about', path: '/admin/about', selector: '[data-about-form]' },
  { name: 'services', path: '/admin/services', selector: '[data-add-card]' },
  { name: 'process', path: '/admin/process', selector: '[data-row-form]' },
  { name: 'skills', path: '/admin/skills', selector: '[data-add-card]' },
  { name: 'problems', path: '/admin/problems', selector: '[data-add-card]' },
  { name: 'faq', path: '/admin/faq', selector: '[data-row-form]' },
  { name: 'categories', path: '/admin/categories', selector: '[data-add-card]' },
  { name: 'projects', path: '/admin/projects', selector: '.admin-table, .admin-empty' },
  { name: 'project-new', path: '/admin/projects/new', selector: '[data-project-form]' },
  { name: 'media', path: '/admin/media', selector: '[data-dropzone]' },
  { name: 'settings', path: '/admin/settings', selector: '[data-settings-form="branding"]' },
  { name: 'settings-contact', path: '/admin/settings', selector: '[data-settings-form="contact"]' },
  { name: 'settings-social', path: '/admin/settings', selector: '[data-settings-form="social"]' },
  { name: 'settings-seo', path: '/admin/settings', selector: '[data-settings-form="seo"]' },
  { name: 'settings-legal', path: '/admin/settings', selector: '[data-settings-form="legal"]' },
  { name: 'seo', path: '/admin/seo', selector: '[data-settings-form="seo"]' },
  { name: 'inquiries', path: '/admin/forms', selector: '.admin-table, .admin-empty' },
  { name: 'demos', path: '/admin/demos', selector: '[data-demo-form]' },
];

const IGNORED_CONSOLE = [
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  // Visiting /admin/* after logging out intentionally calls /api/admin/session,
  // which answers 401 and then redirects to the login screen.
  /Failed to load resource: the server responded with a status of 401/i,
];
const failures = [];
const run = async () => {
  const browser = await chromium.launch({
    headless: !flag('headed'),
    // --channel=chrome uses the locally installed Google Chrome, which is the
    // browser the admin panel is supported in.
    ...(arg('channel') ? { channel: arg('channel') } : {}),
  });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let current = 'startup';
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    failures.push(`[console:${current}] ${text}`);
  });
  page.on('pageerror', (error) => failures.push(`[pageerror:${current}] ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    if (failure && !IGNORED_CONSOLE.some((pattern) => pattern.test(failure.errorText))) {
      failures.push(`[requestfailed:${current}] ${request.url()} ${failure.errorText}`);
    }
  });

  current = 'login';
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#login-form input[name="email"]', email);
  await page.fill('#login-form input[name="password"]', password);
  await Promise.all([
    page.waitForURL('**/admin/dashboard', { timeout: 15000 }),
    page.click('#login-form button[type="submit"]'),
  ]);
  console.log('login: ok');

  for (const entry of PAGES) {
    current = entry.name;
    await page.goto(`${baseUrl}${entry.path}`, { waitUntil: 'domcontentloaded' });
    const found = await page
      .waitForSelector(entry.selector, { timeout: 12000 })
      .catch(() => null);
    if (!found) failures.push(`[missing:${current}] no element matching "${entry.selector}" on ${entry.path}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `${entry.name}.png`), fullPage: false });
    console.log(`page ${entry.path}: ok`);
  }

  current = 'logout';
  await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.click('[data-logout]');
  await page.waitForURL('**/admin/login', { timeout: 10000 });
  await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const redirected = page.url().includes('/admin/login');
  if (!redirected) failures.push('[logout] /admin/dashboard was still reachable after logging out');
  console.log(`logout: ${redirected ? 'ok' : 'FAILED'}`);

  await browser.close();
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const problem of failures) console.error(` - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll admin checks passed.');
  }
};

run().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});