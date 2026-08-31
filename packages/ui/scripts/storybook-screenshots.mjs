import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { checkA11y, injectAxe } from 'axe-playwright';

const root = resolve(import.meta.dirname, '../..', '..');
const outputDirectory = resolve(root, 'storybook-screenshots');
const request = globalThis.fetch.bind(globalThis);
const server = spawn(process.execPath, [resolve(import.meta.dirname, '../node_modules/http-server/bin/http-server'), '../../storybook-static', '-p', '6006'], {
  cwd: resolve(import.meta.dirname, '..'),
  stdio: 'inherit',
});

const stopServer = () => server.kill();
process.once('SIGINT', stopServer);
process.once('SIGTERM', stopServer);

try {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await request('http://127.0.0.1:6006/index.json');
      if (response.ok) break;
    } catch {
      // The static server needs a moment to start.
    }
    await delay(250);
  }

  const response = await request('http://127.0.0.1:6006/index.json');
  if (!response.ok) throw new Error(`Storybook index request failed: ${response.status}`);
  const index = await response.json();
  const stories = Object.values(index.entries).filter((entry) => entry.type === 'story');
  await delay(500);

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const story of stories) {
      const page = await browser.newPage();
      try {
        const storyUrl = `http://127.0.0.1:6006/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await page.goto(storyUrl, { waitUntil: 'networkidle' });
            break;
          } catch (error) {
            if (attempt === 2) throw error;
            await delay(500);
          }
        }
        await injectAxe(page);
        await checkA11y(page, undefined, { detailedReport: true, detailedReportOptions: { html: true } });
        await page.screenshot({
          path: resolve(outputDirectory, `${story.id}.png`),
          fullPage: true,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  stopServer();
}
