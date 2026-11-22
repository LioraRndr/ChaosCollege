/* Smart cutout, cloud edition: components come from the server's own mirror
   (/vendor/cutout/) under the strict CSP, the result is saved to the account.
   Start the server first (fresh data dir), then:
   node t14-cloud-cutout.cjs <photo.jpg> [base url] [screenshot dir] */
const { chromium } = require('playwright');
const path = require('path');

const photo = path.resolve(process.argv[2] || 'photo.jpg');
const BASE = process.argv[3] || 'http://127.0.0.1:8090/';
const shots = path.resolve(process.argv[4] || '.');
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()} ${m.text().slice(0, 200)}`); });
  ctx.on('request', (r) => requests.push(r.url()));
  await page.goto(BASE);
  await page.waitForSelector('#authGate');
  const user = `抠图${Date.now() % 100000}`;
  await page.fill('#authGate input[name=username]', user);
  await page.fill('#authGate input[name=password]', 'password123');
  await page.fill('#authGate input[name=confirm]', 'password123');
  await page.click('#authGate .auth-submit');
  await page.waitForSelector('#home .home-inner');
  await page.click('[data-quick="1"]');
  await page.waitForFunction(() => CC.App.state.doc);
  await page.setInputFiles('#imageInput', photo);
  await page.waitForFunction(() => CC.App.state.doc.layers.length === 1 && CC.App.canCutout());
  check('components come from this server', (await page.evaluate(() => CC.cutout.source())) === 'server');
  await page.click('[data-insp-action="image-cutout"]');
  await page.waitForSelector('.cutout-dialog [data-cut-start]:not([hidden])');
  check('first use names the server as source', /本站服务器/.test(await page.textContent('.cutout-dialog [data-cut-msg]')));
  await page.click('.cutout-dialog [data-cut-start]');
  await page.waitForFunction(() => document.querySelector('.cutout-dialog [data-cut-overlay]').hidden || !document.querySelector('.cutout-dialog [data-cut-start]').hidden, null, { timeout: 600000 });
  const failed = await page.evaluate(() => (document.querySelector('.cutout-dialog [data-cut-overlay]').hidden ? '' : document.querySelector('.cutout-dialog [data-cut-msg]').textContent));
  const info = await page.textContent('.cutout-dialog [data-cut-info]');
  check('cutout runs under the server CSP', !failed, failed || info);
  check('cross-origin isolation', true, `crossOriginIsolated=${await page.evaluate(() => crossOriginIsolated)}`);
  await page.screenshot({ path: path.join(shots, 'cutout-cloud.png') });
  await page.click('.cutout-dialog .modal-foot [data-primary="1"]');
  await page.waitForSelector('.cutout-dialog', { state: 'detached', timeout: 60000 });
  await page.waitForFunction(() => CC.App.state.saveStatus === 'saved' && !CC.App.state.dirty, null, { timeout: 30000 });
  const state = await page.evaluate(() => { const l = CC.App.primaryLayer(); return { id: CC.App.state.doc.id, asset: l.assetId, src: l.cutout?.src }; });
  check('cutout saved to the account', !!state.src && state.asset !== state.src);
  const external = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('blob:') && !u.startsWith('data:'));
  check('no request left this server', external.length === 0, external.slice(0, 3).join(' '));
  await page.reload();
  await page.waitForSelector('#home .home-inner');
  await page.evaluate((id) => CC.App.openProject(id).then(() => CC.App.hideHome?.()), state.id);
  await page.waitForFunction(() => CC.App.state.doc && CC.App.primaryLayer?.() !== undefined);
  const again = await page.evaluate(() => { const l = CC.App.state.doc.layers[0]; return { asset: CC.App.state.assets.has(l.assetId), src: CC.App.state.assets.has(l.cutout?.src) }; });
  check('cutout and its original load back from the cloud', again.asset && again.src, JSON.stringify(again));
  check('no console errors or warnings', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(results.join('\n'));
  console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((error) => { console.log(results.join('\n')); console.error(error); process.exit(1); });
