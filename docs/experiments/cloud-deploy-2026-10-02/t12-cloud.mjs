import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = process.env.CC_BASE || 'http://127.0.0.1:8090/';
const executablePath = process.env.CC_CHROME || '/usr/bin/google-chrome';
const FONT = process.env.CC_FONT || 'testfont.woff2';
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|409|413|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page };
}
const ready = (page) => page.waitForFunction(() => window.CC?.App?.state && (document.querySelector('#home .home-inner') || document.querySelector('#authGate')));
const savedToCloud = (page) => page.waitForFunction(() => CC.App.state.saveStatus === 'saved' && !CC.App.state.dirty, null, { timeout: 15000 });
const user = `测试${Date.now() % 100000}`;

/* ---- A: register ---- */
const A = await newPage();
await A.page.goto(BASE);
await ready(A.page);
check('auth gate shown on first visit', await A.page.locator('#authGate').isVisible());
await A.page.fill('#authGate input[name=username]', user);
await A.page.fill('#authGate input[name=password]', 'password123');
await A.page.fill('#authGate input[name=confirm]', 'password123');
await A.page.click('#authGate .auth-submit');
await A.page.waitForSelector('#home .home-inner');
check('registered and on home', await A.page.evaluate(() => CC.cloud.isEnabled() && CC.cloud.user()?.username), '');
check('home shows cloud account', (await A.page.textContent('.home-foot')).includes('云端'));

/* project + image + shape */
await A.page.click('[data-quick="1"]');
await A.page.waitForFunction(() => CC.App.state.doc);
await A.page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const x = c.getContext('2d'); x.fillStyle = '#ff4ca7'; x.fillRect(0, 0, 320, 200); x.fillStyle = '#d7ff2f'; x.fillRect(40, 40, 120, 80);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await CC.App.addImageFiles([new File([blob], 'pink.png', { type: 'image/png' })]);
  CC.App.addLayer(CC.model.createShape(CC.App.state.doc, 'star'));
});
await savedToCloud(A.page);
await A.page.waitForTimeout(1200); // thumbnail upload
const pid = await A.page.evaluate(() => CC.App.state.doc.id);
check('status label says cloud', (await A.page.textContent('#saveState')).includes('云端'));

/* font import goes to the account */
await A.page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  await CC.App.importFontFiles([new File([bytes], 'testfont.woff2', { type: 'font/woff2' })]);
}, fs.readFileSync(FONT).toString('base64'));

/* reload: session kept, project and thumb listed, image restored */
await A.page.reload();
await ready(A.page);
check('session survives reload', await A.page.evaluate(() => !document.querySelector('#authGate') && CC.cloud.isEnabled()));
await A.page.waitForFunction(() => document.querySelector('.project-card img')?.naturalWidth > 0, null, { timeout: 8000 }).catch(() => {});
check('cloud thumbnail renders', await A.page.evaluate(() => (document.querySelector('.project-card img')?.naturalWidth || 0) > 0));
check('imported font restored from cloud', await A.page.evaluate(() => CC.fonts.importedRecords().length === 1));
await A.page.click(`.project-card[data-project-id="${pid}"]`);
await A.page.waitForFunction(() => CC.App.state.doc && [...CC.App.state.assets.values()].every((a) => a.ready));
const restored = await A.page.evaluate(() => ({ layers: CC.App.state.doc.layers.map((l) => l.type), assets: [...CC.App.state.assets.values()].map((a) => `${a.img?.naturalWidth}x${a.img?.naturalHeight}`) }));
check('project restored with image', restored.layers.join() === 'image,shape' && restored.assets[0] === '320x200', JSON.stringify(restored));

/* SVG image round-trip (stored as image/svg+xml, served as an opaque download) */
await A.page.evaluate(async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#20e3d1"/></svg>';
  await CC.App.addImageFiles([new File([svg], 'cyan.svg', { type: 'image/svg+xml' })]);
});
await savedToCloud(A.page);
const svgInfo = await A.page.evaluate(async (id) => {
  const list = (await (await fetch(`/api/projects/${id}/assets`)).json()).assets;
  const svgMeta = list.find((a) => a.mime === 'image/svg+xml');
  if (!svgMeta) return 'svg not stored: ' + JSON.stringify(list.map((a) => a.mime));
  const res = await fetch(`/api/projects/${id}/assets/${svgMeta.id}`);
  const back = await CC.storage.getAssets(id);
  const blob = back.find((a) => a.id === svgMeta.id).blob;
  const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
  return `${res.headers.get('content-type')}|${res.headers.get('content-disposition')}|${img.naturalWidth}x${img.naturalHeight}`;
}, pid);
check('svg stored and restored safely', svgInfo === 'application/octet-stream|attachment|120x80', svgInfo);
await A.page.evaluate(() => CC.App.deleteSelection());
await savedToCloud(A.page);

/* ---- B: same account on another device edits the project ---- */
const B = await newPage();
await B.page.goto(BASE);
await ready(B.page);
await B.page.click('#authGate [data-auth-mode=login]');
await B.page.fill('#authGate input[name=username]', user);
await B.page.fill('#authGate input[name=password]', 'password123');
await B.page.click('#authGate .auth-submit');
await B.page.waitForSelector(`.project-card[data-project-id="${pid}"]`);
await B.page.click(`.project-card[data-project-id="${pid}"]`);
await B.page.waitForFunction(() => CC.App.state.doc);
await B.page.evaluate(() => CC.App.addLayer(CC.model.createShape(CC.App.state.doc, 'ellipse')));
await savedToCloud(B.page);

/* A edits the stale copy -> conflict dialog -> overwrite */
await A.page.evaluate(() => CC.App.addLayer(CC.model.createText(CC.App.state.doc, 'A wins')));
await A.page.waitForSelector('.modal .ui-button:has-text("用当前窗口覆盖")', { timeout: 10000 });
check('conflict dialog appears', true);
await A.page.click('.modal .ui-button:has-text("用当前窗口覆盖")');
await savedToCloud(A.page);
const server = await A.page.evaluate(async (id) => (await (await fetch(`/api/projects/${id}`)).json()).doc.layers.map((l) => l.type).join(), pid);
check('overwrite stored A version', server === 'image,shape,text', server);

/* B now stale: reload choice loads the cloud version */
await B.page.evaluate(() => CC.App.addLayer(CC.model.createShape(CC.App.state.doc, 'rect')));
await B.page.waitForSelector('.modal .ui-button:has-text("加载云端版本")', { timeout: 10000 });
await B.page.click('.modal .ui-button:has-text("加载云端版本")');
await B.page.waitForFunction(() => CC.App.state.doc?.layers.length === 3 && !CC.App.state.dirty);
check('reload picks cloud version', (await B.page.evaluate(() => CC.App.state.doc.layers.map((l) => l.type).join())) === 'image,shape,text');

/* save as local .chaos file (download fallback in headless) */
const dl = A.page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
await A.page.evaluate(() => { window.showSaveFilePicker = undefined; return CC.App.saveAsFile(); });
const download = await dl;
let chaosOk = false;
let chaosInfo = 'no download';
if (download) {
  const text = fs.readFileSync(await download.path(), 'utf8');
  const payload = JSON.parse(text);
  chaosOk = payload.format === 'chaos-collage-project' && payload.assets.length === 1 && payload.doc.layers.length === 3;
  chaosInfo = `${download.suggestedFilename()} assets=${payload.assets.length} layers=${payload.doc.layers.length}`;
}
check('save as .chaos downloads with image', chaosOk, chaosInfo);

/* quota: 2 MB account limit rejects a big image with a clear message */
const quota = await A.page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 1400; c.height = 1400;
  const x = c.getContext('2d'); const d = x.createImageData(1400, 1400);
  for (let i = 0; i < d.data.length; i += 1) d.data[i] = (Math.random() * 256) | 0;
  x.putImageData(d, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  try { await CC.storage.putAsset(CC.App.state.doc.id, { id: 'A_bigtest', blob, mime: 'image/png', width: 1400, height: 1400 }); return 'stored'; } catch (e) { return `${e.status} ${e.message}`; }
});
check('quota enforced', quota.startsWith('413'), quota);
const usage = await A.page.evaluate(() => CC.storage.estimate());
check('usage reported', usage.usage > 0 && usage.quota === 2 * 1048576, JSON.stringify(usage));

/* logout -> gate; local trial path */
await A.page.evaluate(() => CC.App.closeProject());
await A.page.click('[data-home-action=account]');
await A.page.click('.menu .menu-item:has-text("退出登录")');
await A.page.waitForSelector('#authGate');
check('logout shows sign-in', true);
await A.page.click('#authGate [data-auth-local]');
await A.page.waitForSelector('#home .home-inner');
check('local trial mode', (await A.page.textContent('.home-foot')).includes('本机试用') && !(await A.page.evaluate(() => CC.cloud.isEnabled())));
await A.page.screenshot({ path: 'cloud-home-trial.png' });

/* wrong password */
const C = await newPage();
await C.page.goto(BASE);
await ready(C.page);
await C.page.click('#authGate [data-auth-mode=login]');
await C.page.fill('#authGate input[name=username]', user);
await C.page.fill('#authGate input[name=password]', 'wrongpass1');
await C.page.click('#authGate .auth-submit');
await C.page.waitForFunction(() => document.querySelector('.auth-error')?.textContent.includes('不正确'));
check('wrong password rejected', true);
await C.page.screenshot({ path: 'cloud-login.png' });

check('no unexpected console errors (CSP etc.)', !errors.length, JSON.stringify(errors.slice(0, 5)));
await browser.close();
console.log(results.join('\n'));
