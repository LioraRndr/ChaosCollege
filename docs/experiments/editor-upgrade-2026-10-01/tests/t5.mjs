import { launch } from './lib.mjs';
import fs from 'fs';
let { page, logs, close, context } = await launch({ userDataDir: '/tmp/cc-tools/profile' });
await page.click('[data-quick="0"]');
await page.waitForFunction(() => CC.App.state.doc);
const docId = await page.evaluate(async () => {
  const App = CC.App, M = CC.model, doc = App.state.doc;
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  const g = c.getContext('2d'); g.fillStyle = '#3265ff'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#d7ff2f'; g.fillRect(40, 40, 120, 120);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await App.addImageFiles([new File([blob], 'blue.png', { type: 'image/png' })], { x: 540, y: 500 });
  const img = App.primaryLayer();
  img.effects.push(CC.effects.create('frameMosh'));
  img.warp = { quad: CC.warp.presetQuad('perspective-left', 0.2), mesh: CC.warp.identityMesh() };
  App.addLayer(M.createText(doc, 'SAVED', { fillMode: 'chrome', fill: '#ffffff', fill2: '#222' }), { at: { x: 540, y: 1000 } });
  App.addLayer(M.createGenerator(doc, 'badge'), { at: { x: 800, y: 300 } });
  App.state.doc.name = '持久化测试';
  App.markDirty();
  return doc.id;
});
await page.waitForTimeout(2500);
const status = await page.evaluate(() => CC.App.state.saveStatus);
console.log('save status', status);
await page.screenshot({ path: '/tmp/cc-tools/out/06-before-reload.png' });
await page.reload();
await page.waitForFunction(() => document.querySelector('.project-card'));
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/cc-tools/out/07-home-list.png' });
await page.click(`[data-project-id="${docId}"]`);
await page.waitForFunction(() => CC.App.state.doc);
await page.waitForTimeout(800);
const restored = await page.evaluate(() => ({ name: CC.App.state.doc.name, layers: CC.App.state.doc.layers.map(l => l.type + (l.effects.length ? '+fx' : '') + (l.warp ? '+warp' : '')), assets: [...CC.App.state.assets.values()].map(a => a.ready + ':' + a.width) }));
console.log('restored', JSON.stringify(restored));
await page.screenshot({ path: '/tmp/cc-tools/out/08-restored.png' });
// .chaos roundtrip
const fileText = await page.evaluate(async () => {
  const doc = CC.App.state.doc;
  const used = new Set(doc.layers.map(l => l.assetId).filter(Boolean));
  const blob = await CC.storage.buildProjectFile(CC.util.deepCopy(doc), [...CC.App.state.assets.values()].filter(a => used.has(a.id)), []);
  return await blob.text();
});
fs.writeFileSync('/tmp/cc-tools/out/test.chaos', fileText);
console.log('chaos file bytes', fileText.length);
const reopened = await page.evaluate(async (text) => {
  // force "copy" choice by stubbing choiceDialog
  CC.ui.choiceDialog = async () => 'copy';
  await CC.App.openProjectFromFile(new File([text], 'test.chaos', { type: 'application/json' }));
  await new Promise(r => setTimeout(r, 500));
  return { id: CC.App.state.doc.id, name: CC.App.state.doc.name, layers: CC.App.state.doc.layers.length, assets: CC.App.state.assets.size, ready: [...CC.App.state.assets.values()].every(a => a.ready) };
}, fileText);
console.log('reopened copy', JSON.stringify(reopened));
// export via download fallback
await page.evaluate(() => { window.showSaveFilePicker = undefined; });
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.evaluate(() => CC.App.quickExport()),
]);
const path = '/tmp/cc-tools/out/export.png';
await download.saveAs(path);
const buf = fs.readFileSync(path);
console.log('export name', download.suggestedFilename(), 'png size', buf.readUInt32BE(16), 'x', buf.readUInt32BE(20), 'bytes', buf.length);
console.log(logs.join('\n') || 'no errors');
await close();
