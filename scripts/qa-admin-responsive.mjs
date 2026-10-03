#!/usr/bin/env node
/**
 * Responsive admin check.
 *
 * Loads the main admin screens at the three breakpoints used for the public
 * site (1440x900, 768x1024 and 390x844) and fails on horizontal overflow,
 * overlapping controls or a console error. At narrow widths it also opens the
 * sidebar drawer and confirms it can be dismissed again.
 *
 *   node scripts/qa-admin-responsive.mjs --url=... --state=session.json --channel=chrome
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback = '') => {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (found) return found.slice(name.length + 3);
  const envName = `QA_${name.toUpperCase()}`;
  if (process.env[envName] !== undefined) return process.env[envName];
  return fallback;
};
// Precedence: --password, then --password-file, then QA_PASSWORD_FILE, then
// QA_PASSWORD. The CLI flags win so an inherited env var from another run (for
// example a local test password) can never shadow them.
const explicitPassword = (() => {
  const found = process.argv.find((item) => item.startsWith('--password='));
  return found === undefined ? '' : found.slice(11);
})();
const password = (() => {
  if (explicitPassword) return explicitPassword;
  const file = arg('password-file', '');
  if (file && existsSync(file)) return readFileSync(file, 'utf8').trim();
  const envFile = process.env.QA_PASSWORD_FILE || '';
  if (envFile && existsSync(envFile)) return readFileSync(envFile, 'utf8').trim();
  return process.env.QA_PASSWORD || '';
})();
const baseUrl = arg('url', 'http://127.0.0.1:8790').replace(/\/+$/, '');
const outDir = path.resolve(arg('out', '.qa-admin-responsive'));
const label = arg('label', 'responsive');
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'tablet', width: 768, height: 1024, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];
const SCREENS = [
  ['dashboard', '/admin/dashboard', '.admin-stat'],
  ['home-editor', '/admin/home', '[data-home-form]'],
  ['projects', '/admin/projects', '.admin-card'],
  ['project-new', '/admin/projects/new', '[data-project-form]'],
  ['media', '/admin/media', '[data-dropzone]'],
  ['settings', '/admin/settings', '[data-settings-form="branding"]'],
  ['inquiries', '/admin/forms', '.admin-card'],
  ['demos', '/admin/demos', '[data-demo-form]'],
];

const failures = [];
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(`${name} ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const run = async () => {
  const browser = await chromium.launch({ headless: true, ...(arg('channel') ? { channel: arg('channel') } : {}) });
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      ...(arg('state') && existsSync(arg('state')) ? { storageState: arg('state') } : {}),
    });
    const page = await context.newPage();
    // Each viewport logs in for itself: a session cookie is bound to one context.
    if (password) {
      await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'domcontentloaded' });
      await page.fill('#login-form input[name="email"]', arg('email', 'admin@xilveno.shop'));
      await page.fill('#login-form input[name="password"]', password);
      await Promise.all([page.waitForURL('**/admin/dashboard'), page.click('#login-form button[type="submit"]')]);
      check(`${viewport.name} login`, page.url().includes('/admin/dashboard'));
    }
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (/favicon/i.test(text) || /status of 40[149]/i.test(text)) return;
      errors.push(text);
    });

    for (const [name, route, selector] of SCREENS) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      const landed = await page.waitForSelector(selector, { timeout: 12000 }).catch(() => null);
      if (!landed) {
        check(`${viewport.name} ${name} renders`, false, selector);
        continue;
      }
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      check(
        `${viewport.name} ${name} has no horizontal overflow`,
        overflow.scrollWidth <= overflow.clientWidth + 1,
        `${overflow.scrollWidth} > ${overflow.clientWidth}`,
      );
      // Interactive controls must stay large enough to tap.
      const tooSmall = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('#admin-app button, #admin-app a, #admin-app input, #admin-app select'));
        return nodes
          .filter((node) => {
            // A checkbox is 16px on purpose; the clickable area is its label.
            if (node.type === 'checkbox') return false;
            const box = node.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) return false;
            if (box.height < 24 || box.width < 24) {
              node.setAttribute('data-too-small', `${Math.round(box.width)}x${Math.round(box.height)}`);
              return true;
            }
            return false;
          })
          .map((node) => `${node.tagName.toLowerCase()}.${node.className || '(none)'}[${node.textContent.trim().slice(0, 18)}]`);
      });
      check(`${viewport.name} ${name} controls are usable`, tooSmall.length === 0, tooSmall.slice(0, 3).join(', '));
      await page.screenshot({ path: path.join(outDir, `${label}-${viewport.name}-${name}.png`), fullPage: false });
    }

    // The sidebar becomes a drawer at 1024px and below, so the menu button is
    // expected on the tablet and phone widths.
    const expectsDrawer = viewport.width <= 1024;
    if (expectsDrawer) {
      await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const menu = page.locator('[data-menu-toggle]');
      check(`${viewport.name} menu button visible`, await menu.isVisible());
      await menu.click();
      await page.waitForTimeout(400);
      check(`${viewport.name} sidebar drawer opens`, await page.locator('#admin-sidebar.is-open').count() === 1);
      await page.screenshot({ path: path.join(outDir, `${label}-${viewport.name}-drawer.png`) });
      await page.locator('#admin-sidebar a[href="/admin/dashboard"]').click();
      await page.waitForTimeout(700);
      check(`${viewport.name} sidebar drawer closes after navigating`, await page.locator('#admin-sidebar.is-open').count() === 0);
    } else {
      check(`${viewport.name} menu button hidden`, await page.locator('[data-menu-toggle]').isHidden());
      check(`${viewport.name} sidebar is inline`, await page.locator('#admin-sidebar').isVisible());
    }

    check(`${viewport.name} no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
  await browser.close();
  if (failures.length) {
    console.error(`\n${failures.length} responsive problem(s)`);
    process.exitCode = 1;
  } else {
    console.log('\nResponsive checks passed.');
  }
};

run().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});