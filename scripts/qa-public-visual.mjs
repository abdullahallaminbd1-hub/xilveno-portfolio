#!/usr/bin/env node
/**
 * Public site visual regression.
 *
 * Captures screenshots of the public pages at the three breakpoints and writes
 * a text digest of the rendered structure (headings, section order, counts).
 * Run it against the approved baseline first, then against the current build,
 * and compare the two output folders.
 *
 *   node scripts/qa-public-visual.mjs --url=https://xilveno.shop --out=before
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback = '') => {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const baseUrl = arg('url', 'http://127.0.0.1:8790').replace(/\/+$/, '');
const outDir = path.resolve(arg('out', '.qa-public'));
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];
const PAGES = [
  ['home', '/'],
  ['work', '/work/'],
  ['about', '/about/'],
  ['services', '/services/'],
  ['process', '/process/'],
  ['faq', '/faq/'],
  ['contact', '/contact/'],
  ['notfound', '/this-page-does-not-exist/'],
];

const KILL_MOTION_CSS = `
  *,*::before,*::after{animation:none !important;transition:none !important;animation-play-state:paused !important}
  [data-reveal]{opacity:1 !important;transform:none !important}
  .pulse{animation:none !important;opacity:1 !important}
`;

const run = async () => {
  if (!globalThis.__xlSharedBrowser) {
    globalThis.__xlSharedBrowser = await chromium.launch({ headless: true, ...(arg('channel') ? { channel: arg('channel') } : {}) });
  }
  const browser = globalThis.__xlSharedBrowser;
  const report = [];
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    // Animations and reveal-on-scroll effects make screenshots unstable, so they
    // are frozen for the capture only. This never changes the shipped CSS.
    await page.addStyleTag({ content: KILL_MOTION_CSS }).catch(() => {});
    await context.addInitScript(() => {
      const freeze = () => {
        const style = document.createElement('style');
        style.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}[data-reveal]{opacity:1 !important;transform:none !important}.pulse{animation:none !important}';
        document.head.appendChild(style);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', freeze);
      else freeze();
    });
    for (const [name, route] of PAGES) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
      const structure = await page.evaluate(() => ({
        title: document.title,
        headings: Array.from(document.querySelectorAll('h1, h2, h3')).map((node) => `${node.tagName}:${node.textContent.replace(/\s+/g, ' ').trim()}`),
        sections: Array.from(document.querySelectorAll('main > section, main > header')).map((node) => node.className),
        cards: document.querySelectorAll('.card, .project-card, .process-step, .skill-item, .accordion__item').length,
        buttons: Array.from(document.querySelectorAll('.btn')).map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
        footerLinks: Array.from(document.querySelectorAll('.site-footer a')).map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      report.push({ viewport: viewport.name, page: name, route, status: response ? response.status() : 0, ...structure });
      await page.screenshot({ path: path.join(outDir, `${viewport.name}-${name}.png`), fullPage: viewport.name === 'desktop' });
    }
    await context.close();
  }
  await browser.close();
  writeFileSync(path.join(outDir, 'structure.json'), `${JSON.stringify(report, null, 2)}\n`);
  const overflowing = report.filter((item) => item.overflow > 1);
  console.log(`${report.length} page captures written to ${outDir}`);
  if (overflowing.length) {
    console.error(`Horizontal overflow on: ${overflowing.map((item) => `${item.viewport}/${item.page}`).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('No horizontal overflow on the public pages.');
  }
};

run().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});