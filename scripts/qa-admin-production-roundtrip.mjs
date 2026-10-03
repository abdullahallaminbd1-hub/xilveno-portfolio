#!/usr/bin/env node
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';

const arg = (name, fallback = '') => {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const baseUrl = arg('url', 'https://xilveno.shop').replace(/\/+$/, '');
const passwordFile = process.env.QA_PASSWORD_FILE || '';
const password = passwordFile && existsSync(passwordFile)
  ? readFileSync(passwordFile, 'utf8').trim()
  : process.env.QA_PASSWORD || '';
if (!password) throw new Error('Set QA_PASSWORD_FILE or QA_PASSWORD for production QA.');

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const stamp = Date.now();
const serviceMarker = `QA-${stamp}-service`;
const faqMarker = `QA-${stamp}-faq`;
const faqAnswerMarker = `QA-${stamp}-faq-answer`;
const settingsMarker = `QA ${stamp} SEO title`;
const projectTitle = `QA Production ${stamp}`;
const projectSlug = `qa-production-${stamp}`;
const featuredName = `${projectSlug}-featured.png`;
const leadName = `${projectSlug}-lead.png`;
const checks = [];
const check = (label, passed, detail = '') => {
  checks.push({ label, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!passed) throw new Error(label);
};

const run = async () => {
  const browser = await chromium.launch({ headless: true, channel: arg('channel', 'chrome') });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let signedIn = false;
  let serviceOriginal;
  let faqOriginal;
  let seoTitleOriginal;
  let serviceId = '';
  let faqId = '';
  let projectId = '';
  const uploadedNames = [featuredName, leadName];

  const go = async (route) => page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  const waitSaved = async (endpoint, method, action) => {
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes(endpoint) && response.request().method() === method,
    );
    await action();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`${endpoint} save failed (${response.status()}).`);
  };
  const publicText = async (route) => {
    await page.goto(`${baseUrl}${route}?qa=${stamp}&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    return page.locator('body').innerText();
  };
  const editCollectionRow = async (resource, id, field, value) => {
    await go(resource === 'faqs' ? '/admin/faq' : `/admin/${resource}`);
    const row = page.locator(`[data-row="${id}"]`);
    await row.locator('[data-edit]').click();
    await row.locator(`[data-row-form] [name="${field}"]`).fill(value);
    await waitSaved(`/api/admin/${resource}`, 'PUT', () => row.locator('[data-row-form] button[type="submit"]').click());
    await page.locator('.admin-toast').filter({ hasText: 'Changes saved.' }).last().waitFor();
  };
  const saveProject = async () => waitSaved('/api/admin/projects', 'PUT', () => page.locator('[data-project-form] button[type="submit"]').click());
  const deleteMedia = async (filename) => {
    await go('/admin/media');
    await page.locator('[data-dropzone]').waitFor({ state: 'visible' });
    const exists = await page.evaluate(async (name) => {
      const rows = await (await fetch('/api/admin/media')).json();
      return rows.some((item) => item.filename === name);
    }, filename);
    if (!exists) return;
    const card = page.locator('[data-media-card]').filter({ hasText: filename }).first();
    await card.waitFor({ state: 'visible' });
    const deletion = page.waitForResponse((response) =>
      response.url().includes('/api/admin/media') && response.request().method() === 'DELETE',
    );
    await card.locator('[data-media-delete]').click();
    await page.locator('.admin-modal [data-confirm]').click();
    const response = await deletion;
    if (!response.ok()) throw new Error(`Delete failed for ${filename} (${response.status()}).`);
    await page.waitForFunction(async (name) => {
      const rows = await (await fetch('/api/admin/media')).json();
      return !rows.some((item) => item.filename === name);
    }, filename);
  };

  try {
    await go('/admin/login');
    await page.fill('#login-form input[name="email"]', arg('email', 'admin@xilveno.shop'));
    await page.fill('#login-form input[name="password"]', password);
    await Promise.all([
      page.waitForURL('**/admin/dashboard', { timeout: 20000 }),
      page.locator('#login-form button[type="submit"]').click(),
    ]);
    signedIn = true;

    const screens = [
      ['/admin/home', '[data-home-form]'],
      ['/admin/about', '[data-about-form]'],
      ['/admin/projects', '.admin-table'],
      ['/admin/media', '[data-dropzone]'],
      ['/admin/services', '[data-add-card]'],
      ['/admin/faq', '[data-add-card]'],
      ['/admin/settings', '[data-settings-form="branding"]'],
    ];
    for (const [route, selector] of screens) {
      await go(route);
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15000 });
      check(`${route} renders in Chrome`, await page.locator(selector).count() > 0);
    }

    const [services, faqs] = await Promise.all([
      page.evaluate(async () => {
        const rows = await (await fetch('/api/admin/services')).json();
        return Array.isArray(rows) ? rows : rows.results || [];
      }),
      page.evaluate(async () => {
        const rows = await (await fetch('/api/admin/faqs')).json();
        return Array.isArray(rows) ? rows : rows.results || [];
      }),
    ]);
    const service = services.find((item) => Number(item.active) === 1);
    const faq = faqs.find((item) => Number(item.active) === 1);
    if (!service || !faq) throw new Error('Production needs an active service and FAQ row for reversible edit tests.');
    serviceId = String(service.id);
    faqId = String(faq.id);
    serviceOriginal = { description: String(service.description || ''), overview: String(service.overview || '') };
    faqOriginal = { question: String(faq.question || ''), answer: String(faq.answer || '') };

    await editCollectionRow('services', service.id, 'description', serviceMarker);
    check('service edit appears on the public homepage', (await publicText('/')).includes(serviceMarker));
    await editCollectionRow('services', service.id, 'overview', serviceMarker);
    check('service edit appears on the public services page', (await publicText('/services/')).includes(serviceMarker));
    await editCollectionRow('services', service.id, 'description', serviceOriginal.description);
    await editCollectionRow('services', service.id, 'overview', serviceOriginal.overview);
    serviceOriginal = undefined;
    check('service content restored publicly', !(await publicText('/')).includes(serviceMarker));
    check('service detail restored publicly', !(await publicText('/services/')).includes(serviceMarker));

    await editCollectionRow('faqs', faq.id, 'question', faqMarker);
    await editCollectionRow('faqs', faq.id, 'answer', faqAnswerMarker);
    await publicText('/faq/');
    await page.locator('[data-accordion-trigger]').filter({ hasText: faqMarker }).click();
    check('FAQ question and answer edits appear on the public FAQ page', (await page.locator('body').innerText()).includes(faqMarker) && (await page.locator('body').innerText()).includes(faqAnswerMarker));
    await editCollectionRow('faqs', faq.id, 'question', faqOriginal.question);
    await editCollectionRow('faqs', faq.id, 'answer', faqOriginal.answer);
    faqOriginal = undefined;
    await publicText('/faq/');
    await page.locator('[data-accordion-trigger]').filter({ hasText: faq.question }).click();
    const restoredFaqText = await page.locator('body').innerText();
    check('FAQ content restored publicly', !restoredFaqText.includes(faqMarker) && !restoredFaqText.includes(faqAnswerMarker) && restoredFaqText.includes(String(faqOriginal?.answer || faq.answer)));

    await go('/admin/settings');
    seoTitleOriginal = await page.locator('[data-settings-form="seo"] [name="seo_title"]').inputValue();
    await page.locator('[data-settings-form="seo"] [name="seo_title"]').fill(settingsMarker);
    await waitSaved('/api/admin/settings', 'PUT', () => page.locator('[data-settings-form="seo"] button[type="submit"]').click());
    await page.goto(`${baseUrl}/?qa=${stamp}&seo=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    check('SEO title edit appears on the public homepage', (await page.title()) === settingsMarker);
    await go('/admin/settings');
    await page.locator('[data-settings-form="seo"] [name="seo_title"]').fill(seoTitleOriginal);
    await waitSaved('/api/admin/settings', 'PUT', () => page.locator('[data-settings-form="seo"] button[type="submit"]').click());
    const originalSeoTitle = seoTitleOriginal;
    seoTitleOriginal = undefined;
    await page.goto(`${baseUrl}/?qa=${stamp}&seo-restored=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    check('SEO title restored publicly', (await page.title()) === originalSeoTitle);

    await go('/admin/projects/new');
    await page.locator('[data-project-form] [name="title"]').fill(projectTitle);
    await page.locator('[data-project-form] [name="short_description"]').fill(`Production image QA ${stamp}`);
    await page.locator('[data-project-form] [name="full_description"]').fill(`Production image QA ${stamp}`);
    await page.locator('[data-project-form] [name="published"]').check();
    await page.locator('[data-project-form] [name="featured"]').check();
    const generatedSlug = await page.locator('[data-project-form] [name="slug"]').inputValue();
    check('project slug generated from its title', generatedSlug === projectSlug, generatedSlug);
    const createResponse = page.waitForResponse((response) =>
      response.url().includes('/api/admin/projects') && response.request().method() === 'POST',
    );
    const projectNavigation = page.waitForURL(/\/admin\/projects\/\d+$/);
    await page.locator('[data-project-form] button[type="submit"]').click();
    const createdResponse = await createResponse;
    if (!createdResponse.ok()) throw new Error(`Project create failed (${createdResponse.status()}).`);
    await projectNavigation;
    projectId = page.url().match(/\/admin\/projects\/(\d+)$/)?.[1] || '';
    check('temporary project created', Boolean(projectId), projectId);

    const uploadToPicker = async (pickerIndex, filename) => {
      const picker = page.locator('[data-project-form] [data-picker]').nth(pickerIndex);
      const responsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/admin/media') && response.request().method() === 'POST',
      );
      const chooserPromise = page.waitForEvent('filechooser');
      await picker.locator('[data-picker-upload]').click();
      await (await chooserPromise).setFiles({ name: filename, mimeType: 'image/png', buffer: image });
      const response = await responsePromise;
      if (!response.ok()) throw new Error(`Upload failed for ${filename} (${response.status()}).`);
      await page.locator('.admin-toast').filter({ hasText: 'Image uploaded.' }).last().waitFor();
    };
    await uploadToPicker(0, featuredName);
    await uploadToPicker(1, leadName);
    await saveProject();
    const galleryResponse = page.waitForResponse((response) =>
      response.url().includes('/api/admin/project-gallery') && response.request().method() === 'PUT',
    );
    await page.locator('[data-gallery-add]').click();
    await page.waitForSelector('.admin-modal [data-media]');
    for (const filename of [featuredName, leadName]) {
      await page.locator('.admin-modal [data-media]').filter({ hasText: filename }).first().locator('.admin-media-card__name').click();
    }
    await page.locator('.admin-modal [data-count]').filter({ hasText: '2 selected' }).waitFor();
    await page.locator('.admin-modal [data-use]').click();
    const savedGallery = await galleryResponse;
    if (!savedGallery.ok()) throw new Error(`Project gallery save failed (${savedGallery.status()}).`);

    const caseStudyUrl = `/work/${projectSlug}/`;
    await page.goto(`${baseUrl}${caseStudyUrl}?qa=${stamp}`, { waitUntil: 'domcontentloaded' });
    const lead = page.locator('.post-thumbnail img');
    await lead.evaluate((img) => img.decode());
    check('saved case-study image is publicly visible', (await lead.getAttribute('src'))?.startsWith('/media/'));
    check('saved project gallery is publicly visible', await page.locator('.gallery-grid img').count() === 2);

    await page.goto(`${baseUrl}/?qa=${stamp}&project=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const cardImage = page.locator(`.project-card__media[href="/work/${projectSlug}/"] img`);
    await cardImage.scrollIntoViewIfNeeded();
    await cardImage.evaluate((img) => img.decode());
    const originalCardSrc = await cardImage.getAttribute('src');
    check('saved project card image is publicly visible', Boolean(originalCardSrc?.startsWith('/media/')));

    await go('/admin/projects/' + projectId);
    await page.locator('[data-project-form] [data-picker]').first().locator('[data-picker-clear]').click();
    await saveProject();
    await page.goto(`${baseUrl}/?qa=${stamp}&removed=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    check('removing the project image restores its public placeholder', await page.locator(`.project-card__media[href="/work/${projectSlug}/"] .project-card__placeholder`).isVisible());

    await go('/admin/projects/' + projectId);
    const chooserPromise = page.waitForSelector('.admin-modal [data-media]');
    await page.locator('[data-project-form] [data-picker]').first().locator('[data-picker-choose]').click();
    await chooserPromise;
    await page.locator('.admin-modal [data-media]').filter({ hasText: featuredName }).first().locator('.admin-media-card__name').click();
    await saveProject();
    await page.goto(`${baseUrl}/?qa=${stamp}&chosen=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const chosenImage = page.locator(`.project-card__media[href="/work/${projectSlug}/"] img`);
    await chosenImage.scrollIntoViewIfNeeded();
    await chosenImage.evaluate((img) => img.decode());
    check('media-library selection appears on the public project card', await chosenImage.getAttribute('src') === originalCardSrc);

    await go('/admin/media');
    const featuredCard = page.locator('[data-media-card]').filter({ hasText: featuredName }).first();
    const altMarker = `QA production image ${stamp}`;
    await featuredCard.locator('[data-alt]').fill(altMarker);
    await waitSaved('/api/admin/media', 'PATCH', () => featuredCard.locator('[data-alt-save]').click());
    await page.goto(`${baseUrl}/?qa=${stamp}&alt=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    check('media alt-text edit appears in public image markup', await page.locator(`.project-card__media[href="/work/${projectSlug}/"] img`).getAttribute('alt') === altMarker);
    await go('/admin/media');
    await page.locator('[data-media-card]').filter({ hasText: featuredName }).first().locator('[data-alt]').fill('');
    await waitSaved('/api/admin/media', 'PATCH', () => page.locator('[data-media-card]').filter({ hasText: featuredName }).first().locator('[data-alt-save]').click());
    check('media alt text restored', (await page.locator('[data-media-card]').filter({ hasText: featuredName }).first().locator('[data-alt]').inputValue()) === '');
    await page.goto(`${baseUrl}/?qa=${stamp}&alt-restored=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    check(
      'public image alt-text fallback restored',
      await page.locator(`.project-card__media[href="/work/${projectSlug}/"] img`).getAttribute('alt') === projectTitle,
    );
  } finally {
    const cleanupErrors = [];
    const cleanup = async (label, action) => {
      try {
        await action();
      } catch (error) {
        cleanupErrors.push(`${label}: ${error.message}`);
      }
    };
    if (signedIn) {
      if (serviceOriginal !== undefined) {
        await cleanup('restore service description', () => editCollectionRow('services', serviceId, 'description', serviceOriginal.description));
        await cleanup('restore service overview', () => editCollectionRow('services', serviceId, 'overview', serviceOriginal.overview));
      }
      if (faqOriginal !== undefined) {
        await cleanup('restore FAQ', () => editCollectionRow('faqs', faqId, 'question', faqOriginal.question));
        await cleanup('restore FAQ answer', () => editCollectionRow('faqs', faqId, 'answer', faqOriginal.answer));
      }
      if (seoTitleOriginal !== undefined) {
        await cleanup('restore SEO title', async () => {
          await go('/admin/settings');
          await page.locator('[data-settings-form="seo"] [name="seo_title"]').fill(seoTitleOriginal);
          await waitSaved('/api/admin/settings', 'PUT', () => page.locator('[data-settings-form="seo"] button[type="submit"]').click());
        });
      }
      if (projectId) {
        await cleanup('delete temporary project', async () => {
          await go(`/admin/projects/${projectId}`);
          await page.locator('[data-project-delete]').click();
          await page.locator('.admin-modal [data-confirm]').click();
          await page.waitForURL('**/admin/projects');
        });
      }
      for (const filename of uploadedNames) {
        await cleanup(`delete QA image ${filename}`, () => deleteMedia(filename));
      }
      await cleanup('verify production QA data cleanup', async () => {
        const leftovers = await page.evaluate(async (slug) => {
          const [projects, media] = await Promise.all([
            fetch('/api/admin/projects').then((response) => response.json()),
            fetch('/api/admin/media').then((response) => response.json()),
          ]);
          return {
            project: (projects.results || []).some((item) => item.slug === slug),
            media: media.some((item) => item.filename === `${slug}-featured.png` || item.filename === `${slug}-lead.png`),
          };
        }, projectSlug);
        if (leftovers.project || leftovers.media) throw new Error(JSON.stringify(leftovers));
        console.log('PASS  temporary project and images removed from production');
      });
    }
    await context.close();
    await browser.close();
    for (const error of cleanupErrors) console.error(`RESTORE FAILED: ${error}`);
    if (cleanupErrors.length) process.exitCode = 1;
  }

  const failed = checks.filter((item) => !item.passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} production content checks passed.`);
  if (failed.length) process.exitCode = 1;
};

run().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
