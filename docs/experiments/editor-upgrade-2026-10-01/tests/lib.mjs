import { chromium } from 'playwright-core';
export async function launch({ width = 1440, height = 900, userDataDir } = {}) {
  const args = ['--no-sandbox', '--enable-experimental-web-platform-features'];
  let browser, context;
  if (userDataDir) {
    context = await chromium.launchPersistentContext(userDataDir, { executablePath: '/usr/bin/google-chrome', args, viewport: { width, height } });
    browser = null;
  } else {
    browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args });
    context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  }
  const page = context.pages()[0] || await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  await page.goto(process.env.CC_INDEX || 'file:///home/box/ChaosCollege-ws/index.html');
  await page.waitForFunction(() => window.CC?.App?.state && document.querySelector('#home .home-inner'));
  return { browser, context, page, logs, close: async () => { if (browser) await browser.close(); else await context.close(); } };
}
