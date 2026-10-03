#!/usr/bin/env node
/**
 * Round-trip checks for editable homepage/About content and the About portrait.
 *
 *   $env:QA_PASSWORD = '...'
 *   node scripts/qa-admin-public-content.mjs --url=http://127.0.0.1:8790
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';

const arg = (name, fallback = '') => {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const baseUrl = arg('url', 'http://127.0.0.1:8790').replace(/\/+$/, '');
const passwordFile = process.env.QA_PASSWORD_FILE || arg('password-file');
const password = passwordFile && existsSync(passwordFile)
  ? readFileSync(passwordFile, 'utf8').trim()
  : process.env.QA_PASSWORD || '';
if (!password) throw new Error('Set QA_PASSWORD to the local admin password before running this check.');

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const stamp = Date.now();
const checks = [];
const report = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) throw new Error(name);
};

const HOME = [
  { id: 'hero', key: 'hero', names: ['eyebrow', 'title', 'subtitle', 'cta_text', 'cta_url', 'cta2_text', 'cta2_url', 'panel_title', 'panel_points'] },
  { id: 'tech-stack', key: 'hero', names: ['tech_strip'] },
  { id: 'services', key: 'services_heading', names: ['eyebrow', 'title', 'text'] },
  { id: 'work', key: 'work_heading', names: ['eyebrow', 'title', 'text'] },
  { id: 'problems', key: 'problems_heading', names: ['eyebrow', 'title', 'text'] },
  { id: 'process', key: 'process_heading', names: ['eyebrow', 'title', 'text'] },
  { id: 'skills', key: 'skills_heading', names: ['eyebrow', 'title', 'text'] },
  { id: 'faq', key: 'faq_heading', names: ['eyebrow', 'title', 'text'] },
  { id: 'cta', key: 'cta', names: ['eyebrow', 'title', 'text', 'cta_text', 'cta_url', 'cta2_text', 'cta2_url'] },
];

const saveForm = async (page, selector, expectedToast) => {
  const endpoints = selector === '[data-about-form]' ? ['/api/admin/home', '/api/admin/settings'] : ['/api/admin/home'];
  const responses = endpoints.map((endpoint) => page.waitForResponse((response) =>
    response.url().includes(endpoint) && response.request().method() === 'POST' || response.url().includes(endpoint) && response.request().method() === 'PUT',
  ));
  await page.locator(`${selector} button[type="submit"]`).click();
  const saved = await Promise.all(responses);
  if (saved.some((response) => !response.ok())) throw new Error(`${selector} save request failed.`);
  await page.locator('.admin-toast').filter({ hasText: expectedToast }).last().waitFor({ timeout: 15000 });
};
const listText = (value) => Array.isArray(value) ? value.map((item) => String(item ?? '')).join('\n') : String(value ?? '');
const openAdmin = async (page, route) => {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#admin-sidebar', { timeout: 15000 });
};
const reloadPublic = async (page, route) => {
  const response = await page.goto(`${baseUrl}${route}?qa=${stamp}&reload=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  return { response, text: await page.locator('body').innerText(), hrefs: await page.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href') || '')) };
};
const removeValueRows = async (page) => {
  const rows = page.locator('[data-about-form] [data-value-row]');
  while (await rows.count()) await rows.first().locator('[data-value-remove]').click();
};
const addValueRow = async (page, title, text) => {
  await page.locator('[data-about-form] [data-value-add]').click();
  const row = page.locator('[data-about-form] [data-value-row]').last();
  await row.locator('[data-value-title]').fill(title);
  await row.locator('[data-value-text]').fill(text);
};

const run = async () => {
  const browser = await chromium.launch({ headless: true, ...(arg('channel') ? { channel: arg('channel') } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const publicPage = await context.newPage();
  let homeOriginal;
  let settingsOriginal;
  let originalAboutImageSrc = '';
  const uploadedMedia = [];
  let signedIn = false;

  try {
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('#login-form input[name="email"]', 'admin@xilveno.shop');
    await page.fill('#login-form input[name="password"]', password);
    await Promise.all([
      page.waitForURL('**/admin/dashboard', { timeout: 20000 }),
      page.click('#login-form button[type="submit"]'),
    ]);
    signedIn = true;
    homeOriginal = await page.evaluate(async () => (await fetch('/api/admin/home')).json());
    settingsOriginal = await page.evaluate(async () => (await fetch('/api/admin/settings')).json());
    originalAboutImageSrc = await page.evaluate(async (id) => {
      if (!id) return '';
      const rows = await (await fetch('/api/admin/media')).json();
      const image = rows.find((item) => String(item.id) === String(id));
      return image ? `/media/${encodeURIComponent(image.object_key)}` : '';
    }, settingsOriginal.about_image_media_id);

    await openAdmin(page, '/admin/home');
    const editorSections = await page.locator('[data-section-list] [data-select]').evaluateAll((items) => items.map((item) => item.dataset.select));
    report('homepage section map matches public template', editorSections.join(',') === HOME.map((section) => section.id).join(','), editorSections.join(','));

    for (const section of HOME) {
      await page.locator(`[data-select="${section.id}"]`).click();
      const values = {};
      const markers = [];
      for (const name of section.names) {
        const marker = `QA-${stamp}-${section.id}-${name}`;
        const value = name.endsWith('_url') ? `https://qa.invalid/${marker}` : marker;
        values[name] = value;
        markers.push(marker);
        await page.locator(`[data-home-form] [name="${name}"]`).fill(value);
      }
      await saveForm(page, '[data-home-form]', 'Saved');
      const publicResult = await reloadPublic(publicPage, '/');
      const sectionText = section.id === 'tech-stack' ? await publicPage.locator('.tech-strip').innerText() : publicResult.text;
      const rendered = `${sectionText}\n${publicResult.hrefs.join('\n')}`.toLowerCase();
      const visible = markers.every((marker) => rendered.includes(marker.toLowerCase()));
      report(`${section.id}: saved values render on reloaded homepage`, visible, markers.filter((marker) => !rendered.includes(marker.toLowerCase())).join(', '));
      report(`${section.id}: public response is not cached`, publicResult.response.headers()['cache-control'] === 'no-store');
    }

    const originalAbout = homeOriginal.about || {};
    const aboutValues = Array.isArray(originalAbout.values) ? originalAbout.values : [];
    await openAdmin(page, '/admin/about');
    const aboutMarkers = [];
    const aboutFields = {
      intro_title: `QA-${stamp}-about-intro_title`,
      intro_text: `QA-${stamp}-about-intro_text`,
      profile_focus: `QA-${stamp}-about-profile_focus`,
      profile_working: `QA-${stamp}-about-profile_working`,
      values_title: `QA-${stamp}-about-values_title`,
    };
    for (const [name, value] of Object.entries(aboutFields)) {
      await page.locator(`[data-about-form] [name="${name}"]`).fill(value);
      aboutMarkers.push(value);
    }
    await removeValueRows(page);
    const testedValues = aboutValues.length ? aboutValues : [{}];
    for (const [index] of testedValues.entries()) {
      const title = `QA-${stamp}-about-value-${index}-title`;
      const text = `QA-${stamp}-about-value-${index}-text`;
      await addValueRow(page, title, text);
      aboutMarkers.push(title, text);
    }
    await saveForm(page, '[data-about-form]', 'About page saved');
    let aboutPage = await reloadPublic(publicPage, '/about/');
    report('About text fields render on reloaded public page', aboutMarkers.every((marker) => aboutPage.text.includes(marker)));
    report('About page response is not cached', aboutPage.response.headers()['cache-control'] === 'no-store');

    await openAdmin(page, '/admin/about');
    const picker = page.locator('[data-about-form] [data-picker]');
    const uploadName = `qa-about-${stamp}.png`;
    const uploadChooser = page.waitForEvent('filechooser');
    await picker.locator('[data-picker-upload]').click();
    await (await uploadChooser).setFiles({ name: uploadName, mimeType: 'image/png', buffer: image });
    uploadedMedia.push(uploadName);
    await saveForm(page, '[data-about-form]', 'About page saved');
    aboutPage = await reloadPublic(publicPage, '/about/');
    const firstSrc = await publicPage.locator('.about-portrait img').getAttribute('src');
    report('About portrait upload appears in its public image slot', Boolean(firstSrc?.startsWith('/media/')) && await publicPage.locator('.about-portrait img').evaluate((img) => img.complete && img.naturalWidth > 0));

    await openAdmin(page, '/admin/about');
    const chooseDialog = page.waitForSelector('.admin-modal [data-media]');
    await page.locator('[data-about-form] [data-picker-choose]').click();
    await chooseDialog;
    await page.locator(`.admin-modal [data-media]`).filter({ hasText: uploadName }).click();
    await saveForm(page, '[data-about-form]', 'About page saved');
    aboutPage = await reloadPublic(publicPage, '/about/');
    const chosenSrc = await publicPage.locator('.about-portrait img').getAttribute('src');
    report('About portrait can be selected from the media library', chosenSrc === firstSrc);

    await openAdmin(page, '/admin/about');
    const replacementName = `qa-about-replacement-${stamp}.png`;
    const replacementChooser = page.waitForEvent('filechooser');
    await page.locator('[data-about-form] [data-picker-upload]').click();
    await (await replacementChooser).setFiles({ name: replacementName, mimeType: 'image/png', buffer: image });
    uploadedMedia.push(replacementName);
    await saveForm(page, '[data-about-form]', 'About page saved');
    aboutPage = await reloadPublic(publicPage, '/about/');
    const replacedSrc = await publicPage.locator('.about-portrait img').getAttribute('src');
    report('About portrait replacement appears publicly', Boolean(replacedSrc?.startsWith('/media/')) && replacedSrc !== firstSrc);

    await openAdmin(page, '/admin/about');
    await page.locator('[data-about-form] [data-picker-clear]').click();
    await saveForm(page, '[data-about-form]', 'About page saved');
    aboutPage = await reloadPublic(publicPage, '/about/');
    report('Removing the About portrait restores the public placeholder', await publicPage.locator('.about-portrait__placeholder').isVisible() && await publicPage.locator('.about-portrait img').count() === 0);
  } finally {
    if (signedIn && homeOriginal && settingsOriginal) {
      try {
        for (const section of HOME) {
          await openAdmin(page, '/admin/home');
          await page.locator(`[data-select="${section.id}"]`).click();
          for (const name of section.names) {
            const value = homeOriginal[section.key]?.[name];
            await page.locator(`[data-home-form] [name="${name}"]`).fill(listText(value));
          }
          await saveForm(page, '[data-home-form]', 'Saved');
        }

        await openAdmin(page, '/admin/about');
        for (const name of ['intro_title', 'values_title']) {
          await page.locator(`[data-about-form] [name="${name}"]`).fill(String(homeOriginal.about?.[name] ?? ''));
        }
        await page.locator('[data-about-form] [name="intro_text"]').fill(listText(homeOriginal.about?.intro_text));
        await page.locator('[data-about-form] [name="profile_focus"]').fill(String(homeOriginal.about?.profile?.focus ?? ''));
        await page.locator('[data-about-form] [name="profile_working"]').fill(String(homeOriginal.about?.profile?.working ?? ''));
        await removeValueRows(page);
        for (const value of (Array.isArray(homeOriginal.about?.values) ? homeOriginal.about.values : [])) {
          await addValueRow(page, String(value.title ?? ''), String(value.text ?? ''));
        }
        const originalImageId = String(settingsOriginal.about_image_media_id || '');
        await page.locator('[data-about-form] [name="about_image_media_id"]').evaluate((field, value) => { field.value = value; }, originalImageId);
        await saveForm(page, '[data-about-form]', 'About page saved');

        if (uploadedMedia.length) {
          await openAdmin(page, '/admin/media');
          for (const name of uploadedMedia) {
            const card = page.locator('[data-media-card]').filter({ hasText: name }).first();
            if (await card.count()) {
              await card.locator('[data-media-delete]').click();
              await page.locator('.admin-modal [data-confirm]').click();
              await page.locator('.admin-modal').waitFor({ state: 'detached' });
            }
          }
        }
        const restoredHome = await page.evaluate(async () => (await fetch('/api/admin/home')).json());
        const fieldsRestored = HOME.every((section) => section.names.every((name) =>
          listText(restoredHome[section.key]?.[name]) === listText(homeOriginal[section.key]?.[name]),
        ));
        const originalAbout = homeOriginal.about || {};
        const restoredAbout = restoredHome.about || {};
        const aboutFieldsRestored = ['intro_title', 'intro_text', 'values_title'].every((name) =>
          listText(restoredAbout[name]) === listText(originalAbout[name]),
        ) &&
          String(restoredAbout.profile?.focus || '') === String(originalAbout.profile?.focus || '') &&
          String(restoredAbout.profile?.working || '') === String(originalAbout.profile?.working || '') &&
          JSON.stringify((restoredAbout.values || []).map(({ title, text }) => ({ title, text }))) ===
            JSON.stringify((originalAbout.values || []).map(({ title, text }) => ({ title, text })));
        const restoredSettings = await page.evaluate(async () => (await fetch('/api/admin/settings')).json());
        report(
          'homepage and About fields restored in D1',
          fieldsRestored && aboutFieldsRestored && String(restoredSettings.about_image_media_id || '') === String(settingsOriginal.about_image_media_id || ''),
        );
        const restoredHomePage = await reloadPublic(publicPage, '/');
        const expectedHero = String(homeOriginal.hero?.title || '').replace(/\\n|\n/g, ' ').replace(/\s+/g, ' ').trim();
        const renderedHero = (await publicPage.locator('#abd-hero-title').innerText()).replace(/\s+/g, ' ').trim();
        report('public homepage restored', renderedHero === expectedHero && restoredHomePage.response.headers()['cache-control'] === 'no-store');
        const restoredAboutPage = await reloadPublic(publicPage, '/about/');
        report('public About content restored', (await publicPage.locator('.about-copy h2').innerText()) === String(homeOriginal.about?.intro_title || ''));
        const portrait = publicPage.locator('.about-portrait img');
        const portraitRestored = originalAboutImageSrc
          ? await portrait.count() === 1 && await portrait.getAttribute('src') === originalAboutImageSrc
          : await portrait.count() === 0 && await publicPage.locator('.about-portrait__placeholder').isVisible();
        report('public About portrait restored', portraitRestored && restoredAboutPage.response.headers()['cache-control'] === 'no-store');
        console.log('QA edits restored; uploaded test images removed.');
      } catch (error) {
        console.error(`RESTORE FAILED: ${error.message}`);
        process.exitCode = 1;
      }
    }
    await context.close();
    await browser.close();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} public content checks passed.`);
  if (failed.length) process.exitCode = 1;
};

run().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
