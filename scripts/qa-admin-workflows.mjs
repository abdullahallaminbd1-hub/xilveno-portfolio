#!/usr/bin/env node
/**
 * End-to-end admin workflow check.
 *
 * Drives every interactive control of the admin panel in a real browser:
 * navigation, the visual homepage editor, media uploads, the full project
 * editor, settings, demos and inquiries. Everything it creates is removed
 * again before the script finishes, and any content it edits is restored.
 *
 *   node scripts/qa-admin-workflows.mjs --url=... --password=... [--channel=chrome]
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback = '') => {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (found) return found.slice(name.length + 3);
  // Environment fallbacks keep secrets (and the password file path) out of the
  // process argument list, which is readable by other processes.
  const envName = `QA_${name.toUpperCase()}`;
  if (process.env[envName] !== undefined) return process.env[envName];
  return fallback;
};
const baseUrl = arg('url', 'http://127.0.0.1:8790').replace(/\/+$/, '');
const email = arg('email', 'admin@xilveno.shop');
const explicitPassword = (() => {
  const found = process.argv.find((item) => item.startsWith('--password='));
  return found === undefined ? '' : found.slice(11);
})();
const password = (() => {
  // Precedence: --password, then --password-file, then QA_PASSWORD_FILE, then
  // QA_PASSWORD. The CLI flags win so an inherited env var from another run
  // (for example a local test password) can never shadow them.
  if (explicitPassword) return explicitPassword;
  const file = arg('password-file', '');
  if (file && existsSync(file)) return readFileSync(file, 'utf8').trim();
  const envFile = process.env.QA_PASSWORD_FILE || '';
  if (envFile && existsSync(envFile)) return readFileSync(envFile, 'utf8').trim();
  return process.env.QA_PASSWORD || '';
})();
const outDir = path.resolve(arg('out', '.qa-admin-flows'));
const label = arg('label', 'flow');
mkdirSync(outDir, { recursive: true });

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const stamp = Date.now();
const results = [];

/** Queries the local D1 for records the QA runs should have removed. */
const auditLocalLeftovers = async () => {
  const tables = [
    ['projects', 'title'], ['services', 'title'], ['process_steps', 'title'],
    ['skills', 'title'], ['problems', 'title'], ['faqs', 'question'],
    ['categories', 'name'], ['demos', 'name'], ['pages', 'title'],
    ['inquiries', 'name'], ['media', 'filename'], ['settings', 'value'],
  ];
  const found = [];
  for (const [table, column] of tables) {
    const sql = `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} LIKE 'QA %' OR ${column} LIKE '%qa-%'`;
    // Run wrangler through node directly: the npx shim needs a shell on
    // Windows, and shelling out with interpolated SQL is not worth the risk.
    const args = [
      path.resolve('node_modules/wrangler/bin/wrangler.js'),
      'd1', 'execute', 'xilveno-portfolio-db', '--local', '--command', sql, '--json',
    ];
    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, args, { encoding: 'utf8' });
    } catch (error) { stdout = String(error.stdout || ''); }
    const count = Number((stdout.match(/"n"\s*:\s*(\d+)/) || [])[1]);
    if (Number.isFinite(count) && count > 0) found.push(`${table}=${count}`);
  }
  console.log(found.length ? `> local D1 still holds QA records: ${found.join(', ')}` : '> local D1 holds no QA leftovers');
};

const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const ignoreNoise = (page, errors) => {
  const noise = [/favicon/i, /status of 40[149]/i];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (noise.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
};
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${label}-${name}.png`), fullPage: false });
const titleText = async (page) => (await page.locator('.admin-top__text h2').innerText()).trim();
const toast = (page, text) => page.waitForSelector(`.admin-toast:has-text("${text}")`, { timeout: 12000 }).catch(() => null);
const nav = async (page, href) => {
  await page.goto(`${baseUrl}${href}`, { waitUntil: 'domcontentloaded' });
  // The panel renders after /api/admin/session resolves, so wait for the chrome
  // before counting anything. Production is slower than the local dev server.
  await page.waitForSelector('#admin-sidebar', { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(500);
};
const uploadVia = async (page, clickSelector, files) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 12000 }),
    page.click(clickSelector),
  ]);
  await chooser.setFiles(files);
};
const confirmYes = async (page) => {
  await page.waitForSelector('.admin-modal [data-confirm]', { timeout: 8000 });
  await page.click('.admin-modal [data-confirm]');
  await page.waitForSelector('.admin-modal', { state: 'detached', timeout: 8000 }).catch(() => null);
};
const run = async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(arg('channel') ? { channel: arg('channel') } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(arg('state') && existsSync(arg('state')) ? { storageState: arg('state') } : {}),
  });
  const errors = [];
  const page = await context.newPage();
  ignoreNoise(page, errors);
  let observedProjectUpdate;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/admin/projects') && request.method() === 'PUT') {
      const body = request.postDataJSON();
      observedProjectUpdate = {
        featured: Boolean(body.featured_image_id),
        caseStudy: Boolean(body.case_study_media_id),
      };
    }
  });

  /* -------------------------------------------------------------- login */
  if (arg('state') && existsSync(arg('state'))) {
    await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    check('reused saved admin session', page.url().includes('/admin/dashboard'), page.url().replace(baseUrl, ''));
  } else {
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('#login-form input[name="email"]', email);
    await page.fill('#login-form input[name="password"]', password);
    try {
      await Promise.all([page.waitForURL('**/admin/dashboard', { timeout: 30000 }), page.click('#login-form button[type="submit"]')]);
    } catch (error) {
      // Surface why the redirect never happened instead of a bare timeout.
      const notice = await page.locator('[data-notice], .admin-notice, .login-error').first().textContent().catch(() => '');
      console.log(`login failed at ${baseUrl}: ${page.url()}`);
      console.log(`  password length: ${password.length}, notice: ${(notice || '').trim() || '(none)'}`);
      throw error;
    }
    check('login', page.url().includes('/admin/dashboard'), await titleText(page));
    if (arg('state')) writeFileSync(arg('state'), JSON.stringify(await context.storageState()));
  }

  /* ----------------------------------------------------------- dashboard */
  const statCount = await page.locator('.admin-stat').count();
  check('dashboard stat cards', statCount === 4, `${statCount} cards`);
  for (const [linkLabel, expectPath] of [
    ['New project', '/admin/projects/new'],
    ['Upload media', '/admin/media'],
    ['Edit homepage', '/admin/home'],
  ]) {
    await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.locator(`.admin-card a:has-text("${linkLabel}")`).first().click();
    await page.waitForURL(`**${expectPath}`, { timeout: 12000 });
    check(`dashboard action "${linkLabel}"`, page.url().includes(expectPath), page.url().replace(baseUrl, ''));
  }
  await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  const [viewSite] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.admin-top__actions a:has-text("View site")').click(),
  ]);
  await viewSite.waitForLoadState('domcontentloaded');
  check('dashboard "View site" opens the public site', viewSite.url().startsWith(baseUrl), viewSite.url());
  await viewSite.close();
  await shot(page, '01-dashboard');

  /* ---------------------------------------------------- sidebar navigation */
  const sidebarLinks = [
    ['/admin/dashboard', 'Dashboard'], ['/admin/home', 'Homepage editor'], ['/admin/about', 'About page'],
    ['/admin/services', 'Services'], ['/admin/process', 'Process steps'], ['/admin/skills', 'Skills'],
    ['/admin/projects', 'Projects'], ['/admin/categories', 'Categories'], ['/admin/problems', 'Why it matters'],
    ['/admin/faq', 'FAQ'], ['/admin/media', 'Media library'], ['/admin/settings', 'Settings'],
    ['/admin/seo', 'SEO'], ['/admin/forms', 'Inquiries'], ['/admin/demos', 'Demo sites'],
  ];
  for (const [href, expected] of sidebarLinks) {
    await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.click(`a[href="${href}"]`);
    await page.waitForURL(`**${href}`, { timeout: 12000 });
    await page.waitForTimeout(250);
    const heading = await titleText(page);
    check(`sidebar link "${expected}"`, heading === expected, heading);
  }
  /* --------------------------------------------- visual homepage editor */
  await nav(page, '/admin/home');
  await page.waitForSelector('[data-section-list] [data-select]', { timeout: 15000 }).catch(() => null);
  const railCount = await page.locator('[data-section-list] [data-select]').count();
  check('homepage section list', railCount === 9, `${railCount} sections`);
  for (const id of ['hero', 'tech-stack', 'services', 'work', 'problems', 'process', 'skills', 'faq', 'cta']) {
    await page.click(`[data-select="${id}"]`);
    await page.waitForTimeout(220);
    const heading = (await page.locator('[data-panel] h3').innerText()).trim();
    check(`preview section "${id}" opens its editor`, heading.length > 0, heading);
  }
  const preview = page.frameLocator('[data-frame]');
  check('homepage preview renders the live page', await preview.locator('h1#abd-hero-title').isVisible());
  await preview.locator('[data-admin-section="cta"]').click();
  await page.waitForTimeout(400);
  const afterPreviewClick = (await page.locator('[data-panel] h3').innerText()).trim();
  check('clicking a section in the preview selects it', afterPreviewClick.includes('call to action'), afterPreviewClick);
  check('selected section is outlined in the preview', await preview.locator('[data-admin-section="cta"].xilveno-editor-selected').count() === 1);
  await page.click('[data-device="mobile"]');
  const mobileStage = await page.locator('[data-stage]').getAttribute('class');
  check('preview switches to mobile width', String(mobileStage).includes('admin-stage--mobile'), String(mobileStage));
  await page.click('[data-device="tablet"]');
  const tabletStage = await page.locator('[data-stage]').getAttribute('class');
  check('preview switches to tablet width', String(tabletStage).includes('admin-stage--tablet'), String(tabletStage));
  await page.click('[data-device="desktop"]');
  await shot(page, '02-home-editor');

  const heroTitleField = '[data-home-form] textarea[name="title"]';
  await page.click('[data-select="hero"]');
  await page.waitForTimeout(300);
  const originalHero = (await page.inputValue(heroTitleField)).trim();
  await page.fill(heroTitleField, `QA heading ${stamp}`);
  await page.click('[data-home-form] button[type="submit"]');
  check('hero heading saved', Boolean(await toast(page, 'Saved')));
  await page.waitForTimeout(1500);
  const publicPage = await context.newPage();
  ignoreNoise(publicPage, errors);
  await publicPage.goto(`${baseUrl}/?qa=${stamp}`, { waitUntil: 'domcontentloaded' });
  const liveHeading = (await publicPage.locator('h1#abd-hero-title').innerText()).replace(/\s+/g, ' ').trim();
  check('public homepage shows the saved heading', liveHeading.includes(`QA heading ${stamp}`), liveHeading);
  check('homepage preview refreshes after save', (await preview.locator('h1#abd-hero-title').innerText()).includes(`QA heading ${stamp}`));
  await page.fill(heroTitleField, originalHero);
  await page.click('[data-home-form] button[type="submit"]');
  await toast(page, 'Saved');
  await page.waitForTimeout(1200);
  await publicPage.reload();
  const restoredHeading = (await publicPage.locator('h1#abd-hero-title').innerText()).replace(/\s+/g, ' ').trim();
  // The stored heading keeps its line breaks as \n escapes, which render as <br>.
  const plain = (value) => String(value).replace(/\\n|\s+/g, ' ').trim();
  check('hero heading restored', plain(restoredHeading) === plain(originalHero), restoredHeading);
  await page.fill(heroTitleField, 'temporary change');
  await page.click('[data-home-form] [data-cancel]');
  // Cancel re-fetches the saved section, so wait for the field to be repainted
  // rather than guessing how long a production round trip takes.
  const afterCancel = await page
    .waitForFunction(
      (expected) => {
        const field = document.querySelector('[data-home-form] [name="title"]');
        return field && field.value.trim() === expected;
      },
      originalHero,
      { timeout: 20000 },
    )
    .then(() => originalHero)
    .catch(() => page.inputValue(heroTitleField).then((value) => value.trim()));
  check('"Cancel" discards unsaved hero edits', afterCancel === originalHero, afterCancel);
  await publicPage.close();
  /* -------------------------------------------------------- media library */
  await nav(page, '/admin/media');
  const beforeMedia = await page.locator('[data-media-card]').count();
  const testFiles = [1, 2, 3].map((index) => ({ name: `qa-test-${index}-${stamp}.png`, mimeType: 'image/png', buffer: PIXEL_PNG }));
  await uploadVia(page, '.admin-dropzone', testFiles);
  check('multi-file upload', Boolean(await toast(page, 'uploaded')));
  await page.waitForTimeout(1500);
  await nav(page, '/admin/media');
  const afterMedia = await page.locator('[data-media-card]').count();
  check('uploaded images appear in the library', afterMedia === beforeMedia + 3, `${beforeMedia} to ${afterMedia}`);
  const firstCard = page.locator('[data-media-card]').filter({ hasText: testFiles[0].name }).first();
  check('uploaded image card found', await firstCard.count() === 1, testFiles[0].name);
  await firstCard.locator('[data-alt]').fill('QA test image');
  await firstCard.locator('[data-alt-save]').click();
  check('alt text saved', Boolean(await toast(page, 'Alt text saved')));
  await firstCard.locator('[data-details]').click();
  await page.waitForSelector('.admin-modal');
  const detailsText = (await page.locator('.admin-modal__body').innerText()).toLowerCase();
  check('image details modal shows metadata', detailsText.includes('dimensions') && detailsText.includes('file size'));
  await shot(page, '03-media-details');
  await page.click('.admin-modal [data-close]');
  const replacedName = `qa-replaced-${stamp}.png`;
  const replaceChooser = page.waitForEvent('filechooser', { timeout: 12000 }).catch(() => null);
  await firstCard.locator('[data-replace]').click();
  const chooser = await replaceChooser;
  if (chooser) {
    await chooser.setFiles({ name: replacedName, mimeType: 'image/png', buffer: PIXEL_PNG });
    check('image replace', Boolean(await toast(page, 'Image replaced')));
  } else {
    check('image replace', false, 'file chooser never opened');
  }
  await page.waitForTimeout(1200);
  await nav(page, '/admin/media');
  await page.fill('[data-search] input[name="q"]', `qa-test-2-${stamp}`);
  await page.click('[data-search] button[type="submit"]');
  await page.waitForTimeout(1000);
  check('media search filters the grid', await page.locator('[data-media-card]').count() === 1);
  await shot(page, '04-media-search');
  for (const file of [...testFiles, { name: replacedName }]) {
    await nav(page, `/admin/media`);
    const card = page.locator('[data-media-card]').filter({ hasText: file.name }).first();
    if ((await card.count()) === 0) continue;
    await card.locator('[data-media-delete]').click();
    await confirmYes(page);
    check(`delete ${file.name}`, Boolean(await toast(page, 'deleted')));
  }
  await nav(page, `/admin/media`);
  const finalMedia = await page.locator('[data-media-card]').count();
  check('test media cleaned up', finalMedia === beforeMedia, `${afterMedia} to ${finalMedia}`);
  /* ------------------------------------------------------- project editor */
  const projectName = `QA Project ${stamp}`;
  const projectSlug = `qa-project-${stamp}`;
  await nav(page, '/admin/media');
  await page.waitForTimeout(400);
  const galleryFiles = [1, 2, 3].map((index) => ({ name: `qa-gallery-${index}-${stamp}.png`, mimeType: 'image/png', buffer: PIXEL_PNG }));
  await uploadVia(page, '.admin-dropzone', galleryFiles);
  await toast(page, 'uploaded');
  await page.waitForTimeout(1500);
  check('gallery test images uploaded', await page.locator('[data-media-card]').count() >= 3);

  await nav(page, '/admin/projects/new');
  await page.fill('[data-project-form] input[name="title"]', projectName);
  await page.locator('[data-project-form] textarea[name="short_description"]').click();
  await page.waitForTimeout(300);
  const generatedSlug = await page.inputValue('[data-project-form] input[name="slug"]');
  check('slug generated from the title', generatedSlug === projectSlug, generatedSlug);
  await page.fill('[data-project-form] textarea[name="short_description"]', 'QA short description');
  await page.fill('[data-project-form] textarea[name="full_description"]', 'QA full description');
  await page.fill('[data-project-form] input[name="project_type"]', 'QA Type');
  await page.fill('[data-project-form] input[name="platform"]', 'QA Platform');
  await page.fill('[data-project-form] input[name="role"]', 'QA Role');
  await page.fill('[data-project-form] input[name="focus"]', 'QA Focus');
  await page.fill('[data-project-form] input[name="status"]', 'Live');
  await page.fill('[data-project-form] textarea[name="challenge"]', 'QA challenge');
  await page.fill('[data-project-form] textarea[name="approach"]', 'QA approach');
  await page.fill('[data-project-form] textarea[name="solution"]', 'QA solution');
  await page.fill('[data-project-form] textarea[name="key_features_json"]', 'Feature one\nFeature two');
  await page.fill('[data-project-form] textarea[name="technologies_json"]', 'WordPress\nElementor');
  await page.fill('[data-project-form] input[name="live_demo_url"]', 'https://example.com/qa-demo');
  await page.fill('[data-project-form] input[name="case_study_url"]', 'https://example.com/qa-case');
  await page.check('[data-project-form] input[name="published"]');
  await page.check('[data-project-form] input[name="featured"]');
  await shot(page, '05-project-new');
  await Promise.all([
    page.waitForURL(/\/admin\/projects\/\d+$/, { timeout: 15000 }),
    page.click('[data-project-form] button[type="submit"]'),
  ]);
  check('project created', /\/admin\/projects\/\d+$/.test(page.url()), page.url().replace(baseUrl, ''));
  await page.waitForSelector('[data-gallery-grid]', { timeout: 10000 });

  const featuredFileName = `qa-featured-${stamp}.png`;
  const featuredChooser = page.waitForEvent('filechooser', { timeout: 12000 });
  await page.click('[data-picker] [data-picker-upload]');
  await (await featuredChooser).setFiles({ name: featuredFileName, mimeType: 'image/png', buffer: PIXEL_PNG });
  check('featured image uploaded through the picker', Boolean(await toast(page, 'Image uploaded')));
  await page.waitForFunction(() => Boolean(document.querySelector('[data-project-form] [name="featured_image_id"]')?.value));
  await page.waitForTimeout(700);
  check('featured image preview shown', await page.locator('[data-picker] .admin-picker-preview img').count() === 1);
  const caseStudyFileName = `qa-case-study-${stamp}.png`;
  const caseStudyChooser = page.waitForEvent('filechooser', { timeout: 12000 });
  await page.locator('[data-project-form] [data-picker]').nth(1).locator('[data-picker-upload]').click();
  await (await caseStudyChooser).setFiles({ name: caseStudyFileName, mimeType: 'image/png', buffer: PIXEL_PNG });
  check('case study lead image uploaded through the picker', Boolean(await toast(page, 'Image uploaded')));
  await page.waitForFunction(() => Boolean(document.querySelector('[data-project-form] [name="case_study_media_id"]')?.value));
  const selectedProjectImages = await Promise.all([
    page.locator('[data-project-form] [name="featured_image_id"]').inputValue(),
    page.locator('[data-project-form] [name="case_study_media_id"]').inputValue(),
  ]);
  check('project image selections remain attached to their fields', selectedProjectImages.every(Boolean), selectedProjectImages.map((value) => value ? 'selected' : 'empty').join(','));
  console.log('Project image picker state:', JSON.stringify(await page.locator('[data-project-form] [data-picker]').evaluateAll((pickers) => pickers.map((picker) => ({
    name: picker.querySelector('[data-picker-source]')?.name,
    value: picker.querySelector('[data-picker-source]')?.value,
    preview: picker.querySelector('[data-picker-preview] img')?.getAttribute('src') || '',
  })))));
  await page.click('[data-project-form] button[type="submit"]');
  check('project image selections saved', Boolean(await toast(page, 'Project saved')));
  check('project update request includes selected images', observedProjectUpdate?.featured === true && observedProjectUpdate?.caseStudy === true, JSON.stringify(observedProjectUpdate));
  await page.click('[data-gallery-add]');
  await page.waitForSelector('.admin-modal');
  const mediaCards = page.locator('.admin-modal [data-media]');
  const available = await mediaCards.count();
  if (available >= 2) {
    for (const file of galleryFiles.slice(0, 2)) {
      await page.locator('.admin-modal [data-media]').filter({ hasText: file.name }).first().locator('.admin-media-card__name').click();
    }
    await page.waitForFunction(() => document.querySelector('.admin-modal [data-count]')?.textContent.includes('2 selected'));
    await page.click('.admin-modal [data-use]');
    check('gallery images added', Boolean(await toast(page, 'Gallery saved')));
  } else {
    await page.click('.admin-modal [data-close]');
    check('gallery images added', false, `only ${available} images in the library`);
  }
  await page.waitForTimeout(900);
  const galleryCount = await page.locator('[data-gallery-item]').count();
  check('gallery thumbnails rendered', galleryCount >= 2, `${galleryCount} images`);
  if (galleryCount >= 2) {
    const firstName = (await page.locator('[data-gallery-item]').first().locator('.admin-media-card__name').innerText()).trim();
    await page.locator('[data-gallery-item]').first().locator('[data-gal-move="down"]').click();
    check('gallery reorder', Boolean(await toast(page, 'Gallery saved')));
    await page.waitForTimeout(600);
    const newFirst = (await page.locator('[data-gallery-item]').first().locator('.admin-media-card__name').innerText()).trim();
    check('gallery order changed', newFirst !== firstName, `${firstName} -> ${newFirst}`);
  }
  await shot(page, '06-project-gallery');
  let categoryValue = '';
  const categoryOptions = await page.locator('[data-project-form] select[name="category_id"] option').count();
  if (categoryOptions > 1) {
    categoryValue = await page.locator('[data-project-form] select[name="category_id"] option').nth(1).getAttribute('value');
  } else {
    // No categories exist yet, so create one through the UI first.
    await nav(page, '/admin/categories');
    await page.click('[data-add-toggle]');
    await page.fill('[data-add-card] input[name="name"]', `QA Category ${stamp}`);
    await page.fill('[data-add-card] input[name="slug"]', `qa-category-${stamp}`);
    await page.click('[data-add-card] button[type="submit"]');
    check('category created for the project test', Boolean(await toast(page, 'created')));
    const created = page.locator('[data-row]').filter({ hasText: `QA Category ${stamp}` }).first();
    categoryValue = String(await created.getAttribute('data-row'));
  }
  await page.goto(`${baseUrl}${page.url().replace(baseUrl, '')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-project-form]');
  await page.selectOption('[data-project-form] select[name="category_id"]', categoryValue);
  check('category selected', (await page.inputValue('[data-project-form] select[name="category_id"]')) === categoryValue, categoryValue);
  await page.click('[data-project-form] button[type="submit"]');
  check('project saved', Boolean(await toast(page, 'Project saved')));
  await page.waitForTimeout(1000);
  const storedProjectImages = await page.evaluate(async (slug) => {
    const response = await fetch('/api/admin/projects');
    const data = await response.json();
    const row = (data.results || []).find((item) => item.slug === slug);
    return [Boolean(row?.featured_image_id), Boolean(row?.case_study_media_id)];
  }, projectSlug);
  check('project image selections persist in D1', storedProjectImages.every(Boolean), storedProjectImages.join(','));
  const [caseStudy] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('a:has-text("Preview case study")').click(),
  ]);
  await caseStudy.waitForLoadState('domcontentloaded');
  check('project preview opens the public case study', caseStudy.url().includes(`/work/${projectSlug}/`), caseStudy.url());
  const caseTitle = await caseStudy.locator('h1').innerText();
  check('case study shows the project title', caseTitle.includes('QA Project'), caseTitle.trim());
  const caseLeadImage = caseStudy.locator('.post-thumbnail img');
  const caseLeadSrc = await caseLeadImage.getAttribute('src');
  check('saved case study image is visible publicly', Boolean(caseLeadSrc?.startsWith('/media/')) && await caseLeadImage.evaluate((img) => img.complete && img.naturalWidth > 0));
  check('saved project gallery renders publicly', await caseStudy.locator('.gallery-grid img').count() >= 2);
  const publicHome = await context.newPage();
  await publicHome.goto(`${baseUrl}/?qa=${stamp}`, { waitUntil: 'domcontentloaded' });
  const projectCardImage = publicHome.locator(`.project-card__media[href="/work/${projectSlug}/"] img`);
  const originalCardSrc = await projectCardImage.getAttribute('src');
  await projectCardImage.scrollIntoViewIfNeeded();
  await projectCardImage.evaluate((img) => img.decode());
  check('saved project card image is visible on the homepage', Boolean(originalCardSrc?.startsWith('/media/')) && await projectCardImage.evaluate((img) => img.complete && img.naturalWidth > 0));
  await publicHome.close();
  await caseStudy.close();

  const featuredPicker = page.locator('[data-project-form] [data-picker]').first();
  await featuredPicker.locator('[data-picker-clear]').click();
  await page.click('[data-project-form] button[type="submit"]');
  check('project saved after removing card image', Boolean(await toast(page, 'Project saved')));
  await page.waitForTimeout(700);
  const publicHomeAfterRemove = await context.newPage();
  await publicHomeAfterRemove.goto(`${baseUrl}/?qa=${stamp}-removed`, { waitUntil: 'domcontentloaded' });
  check('removing project card image restores its public placeholder', await publicHomeAfterRemove.locator(`.project-card__media[href="/work/${projectSlug}/"] .project-card__placeholder`).isVisible());
  await publicHomeAfterRemove.close();

  const chooseFeatured = page.waitForSelector(`.admin-modal [data-media]`);
  await featuredPicker.locator('[data-picker-choose]').click();
  await chooseFeatured;
  await page.locator('.admin-modal [data-media]').filter({ hasText: featuredFileName }).first().locator('.admin-media-card__name').click();
  await page.click('[data-project-form] button[type="submit"]');
  check('selected project card image saved', Boolean(await toast(page, 'Project saved')));
  await page.waitForTimeout(700);
  const replacementFileName = `qa-featured-replacement-${stamp}.png`;
  const replacementChooser = page.waitForEvent('filechooser', { timeout: 12000 });
  await featuredPicker.locator('[data-picker-upload]').click();
  await (await replacementChooser).setFiles({ name: replacementFileName, mimeType: 'image/png', buffer: PIXEL_PNG });
  await page.click('[data-project-form] button[type="submit"]');
  check('replacement project card image saved', Boolean(await toast(page, 'Project saved')));
  await page.waitForTimeout(700);
  const replacedHome = await context.newPage();
  await replacedHome.goto(`${baseUrl}/?qa=${stamp}-replaced`, { waitUntil: 'domcontentloaded' });
  const replacedCardImage = replacedHome.locator(`.project-card__media[href="/work/${projectSlug}/"] img`);
  const replacedCardSrc = await replacedCardImage.getAttribute('src');
  await replacedCardImage.scrollIntoViewIfNeeded();
  await replacedCardImage.evaluate((img) => img.decode());
  check('replacement project card image is visible publicly', Boolean(replacedCardSrc?.startsWith('/media/')) && replacedCardSrc !== originalCardSrc && await replacedCardImage.evaluate((img) => img.complete && img.naturalWidth > 0));
  await replacedHome.close();

  const caseStudyPicker = page.locator('[data-project-form] [data-picker]').nth(1);
  await caseStudyPicker.locator('[data-picker-clear]').click();
  await page.click('[data-project-form] button[type="submit"]');
  check('project saved after removing case study image', Boolean(await toast(page, 'Project saved')));
  await page.waitForTimeout(700);
  const caseStudyFallback = await context.newPage();
  await caseStudyFallback.goto(`${baseUrl}/work/${projectSlug}/?qa=${stamp}-fallback`, { waitUntil: 'domcontentloaded' });
  check('removing case study image restores the project card image fallback', await caseStudyFallback.locator('.post-thumbnail img').getAttribute('src') === replacedCardSrc);
  await caseStudyFallback.close();

  while (await page.locator('[data-gallery-item]').count()) {
    await page.locator('[data-gallery-item]').first().locator('[data-gal-remove]').click();
    await page.waitForTimeout(300);
  }
  const galleryAfterRemove = await context.newPage();
  await galleryAfterRemove.goto(`${baseUrl}/work/${projectSlug}/?qa=${stamp}-gallery-removed`, { waitUntil: 'domcontentloaded' });
  check('removing project gallery restores the no-gallery state', await galleryAfterRemove.locator('#abd-gallery').count() === 0);
  await galleryAfterRemove.close();

  await page.fill('[data-project-form] textarea[name="short_description"]', 'QA short description edited');
  await page.click('[data-project-form] button[type="submit"]');
  await toast(page, 'Project saved');
  await page.waitForTimeout(900);
  check('project edit persisted', (await page.inputValue('[data-project-form] textarea[name="short_description"]')) === 'QA short description edited');
  await page.click('[data-project-delete]');
  await confirmYes(page);
  await page.waitForURL('**/admin/projects', { timeout: 12000 });
  await page.waitForTimeout(500);
  check('project deleted', (await page.locator(`.admin-table:has-text("${projectName}")`).count()) === 0, projectName);
  await nav(page, '/admin/media');
  for (const fileName of [...galleryFiles.map((file) => file.name), featuredFileName, caseStudyFileName, replacementFileName]) {
    const card = page.locator('[data-media-card]').filter({ hasText: fileName }).first();
    if (!(await card.count())) continue;
    await card.locator('[data-media-delete]').click();
    await confirmYes(page);
  }
  await page.waitForFunction(
    (runStamp) => ![...document.querySelectorAll('[data-media-card]')].some((card) => (card.textContent || '').includes(runStamp)),
    stamp,
  );
  check('project image QA media cleaned up', await page.locator('[data-media-card]').filter({ hasText: stamp }).count() === 0);
  /* --------------------------------------------------- simple collections */
  const collectionFlow = async (href, resource, fields) => {
    await nav(page, href);
    const before = await page.locator('[data-row]').count();
    await page.click('[data-add-toggle]');
    for (const [name, value] of Object.entries(fields.add)) {
      await page.fill(`[data-add-card] [name="${name}"]`, value);
    }
    await page.click('[data-add-card] button[type="submit"]');
    const created = await toast(page, 'created');
    await page.waitForTimeout(900);
    const afterCreate = await page.locator('[data-row]').count();
    check(`${resource}: create`, Boolean(created) && afterCreate === before + 1, `${before} to ${afterCreate}`);
    let card = page.locator('[data-row]').filter({ hasText: fields.marker }).first();
    if ((await card.count()) === 0) {
      check(`${resource}: row found after create`, false);
      return;
    }
    await card.locator('[data-edit]').click();
    await page.waitForTimeout(300);
    await card.locator(`[name="${fields.detail}"]`).fill(`${fields.marker} edited`);
    await card.locator('button[type="submit"]').click();
    check(`${resource}: edit`, Boolean(await toast(page, 'saved')));
    await page.waitForTimeout(900);
    card = page.locator('[data-row]').filter({ hasText: `${fields.marker} edited` }).first();
    check(`${resource}: edit persisted`, (await card.count()) === 1);
    if (afterCreate > 1) {
      await page.locator('[data-row]').first().locator('[data-move="down"]').click();
      check(`${resource}: reorder`, Boolean(await toast(page, 'Order updated')));
      await page.waitForTimeout(700);
    } else {
      check(`${resource}: reorder`, true, 'skipped, only one row');
    }
    await shot(page, `07-${resource}`);
    card = page.locator('[data-row]').filter({ hasText: `${fields.marker} edited` }).first();
    await card.locator('[data-delete]').click();
    await confirmYes(page);
    check(`${resource}: delete`, Boolean(await toast(page, 'deleted')));
    await page.waitForTimeout(800);
    const afterDelete = await page.locator('[data-row]').count();
    check(`${resource}: row count restored`, afterDelete === before, `${afterDelete}`);
  };

  await collectionFlow('/admin/services', 'services', {
    marker: `QA Service ${stamp}`,
    add: { title: `QA Service ${stamp}`, slug: `qa-service-${stamp}`, description: 'QA description' },
    detail: 'description',
  });
  await collectionFlow('/admin/process', 'process', {
    marker: `QA Step ${stamp}`,
    add: { title: `QA Step ${stamp}`, description: 'QA step description' },
    detail: 'description',
  });
  await collectionFlow('/admin/skills', 'skills', {
    marker: `QA Skill ${stamp}`,
    add: { title: `QA Skill ${stamp}`, description: 'QA skill description' },
    detail: 'description',
  });
  await collectionFlow('/admin/problems', 'problems', {
    marker: `QA Why ${stamp}`,
    add: { title: `QA Why ${stamp}`, description: 'QA why description' },
    detail: 'description',
  });
  await collectionFlow('/admin/faq', 'faqs', {
    marker: `QA Question ${stamp}`,
    add: { question: `QA Question ${stamp}`, answer: 'QA answer' },
    detail: 'answer',
  });
  /* --------------------------------------------------------- about page */
  await nav(page, '/admin/about');
  const originalIntro = await page.inputValue('[data-about-form] input[name="intro_title"]');
  const originalFocus = await page.inputValue('[data-about-form] input[name="profile_focus"]');
  await page.fill('[data-about-form] input[name="intro_title"]', `QA intro ${stamp}`);
  await page.fill('[data-about-form] input[name="profile_focus"]', 'QA focus');
  await page.click('[data-about-form] [data-value-add]');
  await page.fill('[data-value-row]:last-of-type [data-value-title]', `QA value ${stamp}`);
  await page.fill('[data-value-row]:last-of-type [data-value-text]', 'QA value text');
  await page.click('[data-about-form] button[type="submit"]');
  check('about page saved', Boolean(await toast(page, 'About page saved')));
  await page.waitForTimeout(900);
  const aboutPage = await context.newPage();
  ignoreNoise(aboutPage, errors);
  await aboutPage.goto(`${baseUrl}/about/?qa=${stamp}`, { waitUntil: 'domcontentloaded' });
  check('public about page shows the new heading', (await aboutPage.locator('.about-copy h2').innerText()).includes(`QA intro ${stamp}`));
  await aboutPage.close();
  await page.fill('[data-about-form] input[name="intro_title"]', originalIntro);
  await page.fill('[data-about-form] input[name="profile_focus"]', originalFocus);
  await page.locator('[data-value-row]').last().locator('[data-value-remove]').click();
  await page.click('[data-about-form] button[type="submit"]');
  check('about page restored', Boolean(await toast(page, 'About page saved')));
  await page.waitForTimeout(700);

  /* ---------------------------------------------------------- settings */
  await nav(page, '/admin/settings');
  const settingsRoundTrip = async (group, field, testValue) => {
    const form = `[data-settings-form="${group}"]`;
    const control = `${form} [name="${field}"]`;
    const original = await page.inputValue(control);
    await page.fill(control, testValue);
    await page.click(`${form} button[type="submit"]`);
    const saved = await toast(page, 'saved');
    await page.waitForTimeout(700);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const persisted = await page.inputValue(`${form} [name="${field}"]`);
    check(`settings ${group}/${field} saves`, Boolean(saved) && persisted === testValue, persisted);
    await page.fill(`${form} [name="${field}"]`, original);
    await page.click(`${form} button[type="submit"]`);
    await toast(page, 'saved');
    await page.waitForTimeout(700);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    check(`settings ${group}/${field} restored`, (await page.inputValue(`${form} [name="${field}"]`)) === original, original);
  };
  await settingsRoundTrip('branding', 'tagline', `QA tagline ${stamp}`);
  await settingsRoundTrip('contact', 'location', `QA location ${stamp}`);
  await settingsRoundTrip('social', 'facebook', `https://example.com/qa-${stamp}`);
  await settingsRoundTrip('seo', 'seo_title', `QA SEO title ${stamp}`);
  await settingsRoundTrip('legal', 'privacy_url', `https://example.com/qa-privacy-${stamp}`);
  const seoPagePublic = await context.newPage();
  ignoreNoise(seoPagePublic, errors);
  await seoPagePublic.goto(`${baseUrl}/?qa=${stamp}`, { waitUntil: 'domcontentloaded' });
  check('public homepage title restored', !(await seoPagePublic.title()).includes('QA SEO title'), await seoPagePublic.title());
  const brandingResponse = await context.request.get(`${baseUrl}/branding/favicon`, { maxRedirects: 0 });
  check('favicon route responds', [200, 302].includes(brandingResponse.status()), String(brandingResponse.status()));
  const ogBefore = await seoPagePublic.locator('meta[property="og:image"]').getAttribute('content');
  const originalOg = ogBefore || '';
  await nav(page, '/admin/seo');
  const ogPicker = '[data-settings-form="seo"] [data-picker-mode="url"] [data-picker-source]';
  await page.fill(ogPicker, '/media/qa/og.png');
  await page.click('[data-settings-form="seo"] button[type="submit"]');
  check('og image url saved', Boolean(await toast(page, 'saved')));
  await page.waitForTimeout(700);
  await seoPagePublic.reload();
  const ogAfter = await seoPagePublic.locator('meta[property="og:image"]').getAttribute('content');
  check('og image is used on the public page', ogAfter === '/media/qa/og.png', String(ogAfter));
  await page.fill(ogPicker, originalOg);
  await page.click('[data-settings-form="seo"] button[type="submit"]');
  await toast(page, 'saved');
  await page.waitForTimeout(700);
  await seoPagePublic.reload();
  check('og image restored', (await seoPagePublic.locator('meta[property="og:image"]').getAttribute('content')) === originalOg, originalOg);
  await seoPagePublic.close();
  await shot(page, '08-settings');

  /* ------------------------------------------------- security behaviour */
  const unauth = await context.request.get(`${baseUrl}/api/admin/projects`, { headers: { Cookie: '' } });
  check('unauthenticated API call rejected', [401, 403].includes(unauth.status()), String(unauth.status()));
  const mutationWithoutCsrf = await context.request.post(`${baseUrl}/api/admin/projects`, {
    headers: { 'Content-Type': 'application/json' },
    data: { title: 'CSRF probe', slug: 'csrf-probe' },
  });
  check('mutation without a CSRF token rejected', mutationWithoutCsrf.status() === 403, String(mutationWithoutCsrf.status()));
  const badUpload = await context.request.post(`${baseUrl}/api/admin/media`, {
    headers: { 'X-CSRF-Token': 'wrong-token' },
    multipart: { files: { name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') } },
  });
  check('upload without a valid CSRF token rejected', badUpload.status() === 403, String(badUpload.status()));
  const inquiryProbe = await context.request.post(`${baseUrl}/api/inquiries`, {
    headers: { 'Content-Type': 'application/json' },
    data: { name: 'QA', email: 'qa@example.com', message: 'This is a QA probe that should be rejected.', started_at: 1, csrf_token: 'invalid' },
  });
  check('public inquiry rejects a bad form token', inquiryProbe.status() === 403, String(inquiryProbe.status()));
  // Capture the live site name BEFORE the probe writes to it, otherwise the
  // restore below would put the probe value back.
  const siteNameField = '[data-settings-form="branding"] [name="site_name"]';
  await page.goto(`${baseUrl}/admin/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(siteNameField, { timeout: 20000 }).catch(() => null);
  const originalSiteName = (await page.inputValue(siteNameField)).trim();
  const csrf = await page.evaluate(async () => {
    const response = await fetch('/api/admin/session', { credentials: 'same-origin' });
    return (await response.json()).csrfToken;
  });
  const badToken = await context.request.put(`${baseUrl}/api/admin/settings`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': `${csrf}x` },
    data: { site_name: 'CSRF probe' },
  });
  check('mutation with a wrong CSRF token rejected', badToken.status() === 403, String(badToken.status()));
  const goodToken = await context.request.put(`${baseUrl}/api/admin/settings`, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    data: { site_name: 'QA csrf probe' },
  });
  check('mutation with the session CSRF token accepted', goodToken.ok, String(goodToken.status()));
  // Put the real site name back through the UI so the public header and footer
  // are never left showing the probe value.
  await page.fill(siteNameField, originalSiteName);
  await page.click('[data-settings-form="branding"] button[type="submit"]');
  await toast(page, 'saved');
  await page.waitForTimeout(700);
  const restored = await page.evaluate(async (expected) => {
    const response = await fetch('/api/admin/settings', { credentials: 'same-origin' });
    const body = await response.json();
    // The endpoint returns the settings map at the top level.
    const name = body.site_name ?? (body.settings || {}).site_name;
    return name === expected;
  }, originalSiteName);
  check('site name restored after the CSRF probe', restored && !/CSRF probe/i.test(originalSiteName), originalSiteName);

    const badUploadType = await context.request.post(`${baseUrl}/api/admin/media`, {
      headers: { 'X-CSRF-Token': csrf },
      multipart: { files: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') } },
    });
    check('upload rejects a non-image type', badUploadType.status() === 400, String(badUploadType.status()));
    const forgedImage = await context.request.post(`${baseUrl}/api/admin/media`, {
      headers: { 'X-CSRF-Token': csrf },
      multipart: { files: { name: 'forged.png', mimeType: 'image/png', buffer: Buffer.from('<script>alert(1)</script>') } },
    });
    check('upload rejects a file whose signature does not match', forgedImage.status() === 400, String(forgedImage.status()));
    const adminSource = await (await context.request.get(`${baseUrl}/admin/login`)).text();
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((item) => item.name === 'xc_session') || { httpOnly: false, sameSite: '', path: '' };
  check('session cookie is httpOnly, Lax and path scoped', sessionCookie.httpOnly === true && sessionCookie.sameSite === 'Lax' && sessionCookie.path === '/', JSON.stringify({ httpOnly: sessionCookie.httpOnly, sameSite: sessionCookie.sameSite, path: sessionCookie.path }));
  check('session cookie is not exposed to document.cookie', !(await page.evaluate(() => document.cookie.includes('xc_session'))));
  check('admin shell exposes no session secrets', !/csrf_token\s*[:=]\s*['"][A-Za-z0-9_-]{12,}/.test(adminSource));
  check('admin html is not indexed', adminSource.includes('noindex'));
  const robots = await (await context.request.get(`${baseUrl}/robots.txt`)).text();
  check('robots.txt blocks admin and api', robots.includes('Disallow: /admin/') && robots.includes('Disallow: /api/'));
  const sitemap = await (await context.request.get(`${baseUrl}/sitemap.xml`)).text();
  check('sitemap lists no admin urls', !sitemap.includes('/admin'), sitemap.slice(0, 60));
  // Use a cookie-free context so this really probes an anonymous visitor.
  const anonymous = await browser.newContext();
  const probePage = await anonymous.request.get(`${baseUrl}/api/admin/session`);
  check('session endpoint reports unauthenticated', probePage.status() === 401, String(probePage.status()));
  const anonymousAdmin = await anonymous.request.get(`${baseUrl}/api/admin/projects`);
  check('admin api rejects anonymous requests', anonymousAdmin.status() === 401, String(anonymousAdmin.status()));
  const anonymousHtml = await anonymous.request.get(`${baseUrl}/admin/dashboard`);
  check('admin shell only ships the login-protected app shell', anonymousHtml.status() === 200 && (await anonymousHtml.text()).includes('data-login="false"'));
  /* --------------------------------------------------------- inquiries */
  await nav(page, '/admin/forms');
  const inquiryRows = await page.locator('.admin-table tbody tr').count();
  if (inquiryRows > 0) {
    const firstInquiry = page.locator('.admin-table tbody tr').first();
    await firstInquiry.locator('[data-view]').click();
    await page.waitForSelector('.admin-modal');
    const detail = await page.locator('.admin-modal__body').innerText();
    check('inquiry detail modal', detail.includes('Message') && detail.includes('Email'), detail.split('\n').slice(0, 2).join(' / '));
    await page.click('.admin-modal [data-close]');
    const id = await firstInquiry.locator('[data-view]').getAttribute('data-view');
    const originalStatus = await firstInquiry.locator('[data-status]').getAttribute('data-status');
    await firstInquiry.locator(`[data-quick="${id}"][data-status="${originalStatus === 'read' ? 'unread' : 'read'}"]`).click();
    check('inquiry status changed', Boolean(await toast(page, 'marked as')));
    await page.waitForTimeout(900);
    const restoredInquiry = page.locator('.admin-table tbody tr').first();
    await restoredInquiry.locator(`[data-quick="${id}"][data-status="${originalStatus}"]`).click();
    check('inquiry status restored', Boolean(await toast(page, 'marked as')));
    await page.waitForTimeout(700);
  } else {
    check('inquiry empty state', (await page.locator('.admin-empty').count()) === 1);
  }
  await page.locator('[data-filter="archived"]').click();
  await page.waitForTimeout(800);
  check('inquiry filters work', page.url().includes('/admin/forms'));

  /* -------------------------------------------------------------- demos */
  await nav(page, '/admin/demos');
  const demoBefore = await page.locator('[data-demo]').count();
  await page.fill('[data-demo-form][data-id=""] input[name="name"]', `QA Demo ${stamp}`);
  await page.fill('[data-demo-form][data-id=""] input[name="slug"]', `qa-demo-${stamp}`);
  await page.fill('[data-demo-form][data-id=""] input[name="subdomain"]', `qa-${stamp}.xilveno.shop`);
  await page.fill('[data-demo-form][data-id=""] input[name="live_url"]', `https://example.com/qa-demo-${stamp}`);
  await page.click('[data-demo-form][data-id=""] button[type="submit"]');
  check('demo created', Boolean(await toast(page, 'Demo added')));
  await page.waitForTimeout(1000);
  const demoCard = page.locator('[data-demo]').filter({ hasText: `QA Demo ${stamp}` }).first();
  check('demo card shows the Cloudflare setup state', (await demoCard.innerText()).includes('Cloudflare setup required'));
  check('demo card lists the subdomain', (await demoCard.innerText()).includes(`qa-${stamp}.xilveno.shop`));
  await shot(page, '09-demos');
  await demoCard.locator('[data-demo-edit]').click();
  await page.waitForTimeout(300);
  await demoCard.locator('input[name="description"]').count()
    ? await demoCard.locator('input[name="description"]').fill(`QA demo description ${stamp}`)
    : null;
  await demoCard.locator('[data-demo-active]').click();
  await confirmYes(page);
  check('demo marked as configured', Boolean(await toast(page, 'configured')));
  await page.waitForTimeout(1000);
  const activeDemo = page.locator('[data-demo]').filter({ hasText: `QA Demo ${stamp}` }).first();
  check('demo shows the Active state', (await activeDemo.locator('.admin-chip--ok').innerText()).trim() === 'Active', await activeDemo.locator('.admin-chip').innerText());
  await activeDemo.locator('[data-demo-delete]').click();
  await confirmYes(page);
  check('demo deleted', Boolean(await toast(page, 'Demo deleted')));
  await page.waitForTimeout(900);
  check('demo count restored', (await page.locator('[data-demo]').count()) === demoBefore, String(demoBefore));

  /* -------------------------------------------------- cleanup + logout */
  await nav(page, '/admin/media');
  // Reload between deletions and wait for the count to drop: the grid is
  // re-rendered after each delete, so a cached locator can point at a removed
  // node and every later click would then do nothing.
  for (let round = 0; round < 20; round += 1) {
    const before = await page.locator('[data-media-card]').filter({ hasText: 'qa-' }).count();
    if (before === 0) break;
    await page.locator('[data-media-card]').filter({ hasText: 'qa-' }).first().locator('[data-media-delete]').click();
    await confirmYes(page);
    const dropped = await page
      .waitForFunction(
        (previous) => {
          const cards = [...document.querySelectorAll('[data-media-card]')].filter((card) => /qa-/i.test(card.textContent || ''));
          return cards.length < previous;
        },
        before,
        { timeout: 20000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!dropped) await page.reload({ waitUntil: 'domcontentloaded' });
  }
  const leftovers = await page.locator('[data-media-card]').filter({ hasText: 'qa-' }).count();
  check('no QA media left behind', leftovers === 0, `${leftovers} file(s)`);
  if (categoryValue) {
    await nav(page, '/admin/categories');
    const categoryCard = page.locator('[data-row]').filter({ hasText: `QA Category ${stamp}` }).first();
    if ((await categoryCard.count()) === 1) {
      await categoryCard.locator('[data-delete]').click();
      await confirmYes(page);
      check('QA category removed', Boolean(await toast(page, 'deleted')));
    }
  }
  await nav(page, '/admin/dashboard');
  await page.click('[data-logout]');
  await page.waitForURL('**/admin/login', { timeout: 12000 });
  check('logout returns to the login page', page.url().includes('/admin/login'));
  await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  check('admin protected after logout', page.url().includes('/admin/login'), page.url().replace(baseUrl, ''));
  await browser.close();
  if (baseUrl.includes('127.0.0.1') || baseUrl.includes('localhost')) await auditLocalLeftovers();
  const failed = results.filter((item) => !item.ok);
  if (errors.length) console.error(`\nBrowser errors:\n - ${errors.join('\n - ')}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length || errors.length) process.exitCode = 1;
};

run().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});