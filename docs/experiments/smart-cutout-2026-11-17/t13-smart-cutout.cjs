/* Smart cutout, local edition (file://). Needs network on the first run to
   fetch the pinned runtime + model from the public CDNs.
   node t13-smart-cutout.cjs <photo.jpg> [profile dir] [screenshot dir] */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const photo = path.resolve(process.argv[2] || 'photo.jpg');
const profile = path.resolve(process.argv[3] || '/tmp/cc-t13-profile');
const shots = path.resolve(process.argv[4] || '.');
const url = process.env.CC_INDEX || 'file://' + path.resolve(__dirname, '../../../index.html');
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const errors = [];
  const open = async () => {
    const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1440, height: 900 } });
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()} ${m.text().slice(0, 200)}`); });
    await page.goto(url);
    await page.waitForFunction(() => window.CC?.App?.state && document.querySelector('#home .home-inner'));
    return { ctx, page };
  };
  let { ctx, page } = await open();
  await page.click('[data-quick="1"]');
  await page.waitForFunction(() => CC.App.state.doc);
  await page.setInputFiles('#imageInput', photo);
  await page.waitForFunction(() => CC.App.state.doc.layers.length === 1 && CC.App.canCutout());
  const layerInfo = () => page.evaluate(() => {
    const l = CC.App.primaryLayer(); const a = CC.App.state.assets.get(l.assetId);
    return { id: l.id, assetId: l.assetId, x: l.x, y: l.y, w: l.w, h: l.h, cutout: l.cutout, mime: a?.mime, aw: a?.width, ah: a?.height, bytes: a?.blob?.size, layers: CC.App.state.doc.layers.length };
  });
  const before = await layerInfo();
  /* a fresh profile exercises the first-use download; a reused one the cached path */
  const cold = !(await page.evaluate(() => CC.cutout.status())).cached;
  check(cold ? 'cold start: component cache empty' : 'warm start: components already cached', true);

  /* first run: consent, download, infer */
  await page.click('[data-insp-action="image-cutout"]');
  const t0 = Date.now();
  if (cold) {
    await page.waitForSelector('.cutout-dialog [data-cut-start]:not([hidden])');
    check('first use asks before downloading', /首次使用/.test(await page.textContent('.cutout-dialog [data-cut-msg]')));
    check('apply disabled until ready', await page.locator('.cutout-dialog .modal-foot [data-primary="1"]').isDisabled());
    await page.screenshot({ path: path.join(shots, 'cutout-first-use.png') });
    await page.click('.cutout-dialog [data-cut-start]');
  }
  await page.waitForFunction(() => document.querySelector('.cutout-dialog [data-cut-overlay]').hidden, null, { timeout: 600000 });
  const firstMs = Date.now() - t0;
  check('first run finished', true, `${(firstMs / 1000).toFixed(1)} s${cold ? ' incl. download' : ''} · ${await page.textContent('.cutout-dialog [data-cut-info]')}`);
  check('components cached after first run', (await page.evaluate(() => CC.cutout.status())).cached);
  check('cache note shown', /已保存在本机/.test(await page.textContent('.cutout-dialog [data-cut-cache]')));
  const alphaStats = () => page.evaluate(() => {
    const c = document.querySelector('.cutout-dialog [data-cut-canvas]');
    const copy = document.createElement('canvas'); copy.width = c.width; copy.height = c.height;
    const x = copy.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, solid = 0; for (let i = 3; i < d.length; i += 4) { if (d[i] < 8) clear += 1; else if (d[i] > 247) solid += 1; }
    return { clear: clear / (d.length / 4), solid: solid / (d.length / 4), corner: d[3] };
  });
  const base = await alphaStats();
  check('preview has transparent background and opaque subject', base.clear > 0.2 && base.solid > 0.1 && base.corner === 0, JSON.stringify(base));
  await page.screenshot({ path: path.join(shots, 'cutout-dialog.png') });

  /* edge controls change the matte */
  const setRange = (key, value) => page.evaluate(([k, v]) => { const el = document.querySelector(`.cutout-dialog [data-cut="${k}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, [key, value]);
  await setRange('shift', 80); await page.waitForTimeout(150);
  const grown = await alphaStats();
  await setRange('shift', -80); await page.waitForTimeout(150);
  const shrunk = await alphaStats();
  check('edge position expands and contracts', grown.solid > base.solid && shrunk.solid < base.solid, JSON.stringify({ base: base.solid, grown: grown.solid, shrunk: shrunk.solid }));
  await setRange('shift', 0); await setRange('feather', 60); await page.waitForTimeout(150);
  const soft = await alphaStats();
  check('feather softens the edge', 1 - soft.clear - soft.solid > 1 - base.clear - base.solid, '');
  await setRange('feather', 0);
  await page.locator('.cutout-dialog [data-cut-compare]').dispatchEvent('pointerdown');
  check('hold to compare shows the original', (await alphaStats()).clear === 0);
  await page.locator('.cutout-dialog [data-cut-compare]').dispatchEvent('pointerup');
  await page.click('.cutout-dialog [data-seg-value="pink"]');
  check('preview backdrop switches', (await page.getAttribute('.cutout-stage', 'data-backdrop')) === 'pink');
  await page.click('.cutout-dialog [data-seg-value="checker"]');

  /* apply: layer swaps to the trimmed cutout */
  await page.click('.cutout-dialog .modal-foot [data-primary="1"]');
  await page.waitForSelector('.cutout-dialog', { state: 'detached', timeout: 60000 });
  const after = await layerInfo();
  check('layer uses a new asset', after.assetId !== before.assetId && after.cutout?.src === before.assetId, JSON.stringify(after.cutout));
  check('box trimmed to the subject', after.w < before.w * 0.98 && after.h < before.h * 0.98 && Math.abs(after.w / before.w - after.cutout.rect.w) < 1e-6, `${Math.round(before.w)}×${Math.round(before.h)} → ${Math.round(after.w)}×${Math.round(after.h)}`);
  check('photo cutout stored as WebP with alpha', after.mime === 'image/webp', `${after.aw}×${after.ah} ${(after.bytes / 1024).toFixed(0)} KB (source ${(before.bytes / 1024).toFixed(0)} KB)`);
  /* the subject must not move: compare a rendered pixel inside the subject before / after */
  const centre = await page.evaluate(() => { const l = CC.App.primaryLayer(); return { x: l.x, y: l.y }; });
  const expected = { x: before.x + ((after.cutout.rect.x + after.cutout.rect.w / 2) - 0.5) * before.w, y: before.y + ((after.cutout.rect.y + after.cutout.rect.h / 2) - 0.5) * before.h };
  check('subject stays in place', Math.abs(centre.x - expected.x) < 0.01 && Math.abs(centre.y - expected.y) < 0.01);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shots, 'cutout-applied.png') });
  check('inspector offers restore', await page.locator('[data-insp-action="image-uncutout"]').count() === 1);

  /* undo / redo / restore */
  await page.evaluate(() => CC.App.undo());
  const undone = await layerInfo();
  check('undo restores the original layer', undone.assetId === before.assetId && !undone.cutout && Math.abs(undone.w - before.w) < 1e-6);
  await page.evaluate(() => CC.App.redo());
  await page.click('[data-insp-action="image-uncutout"]');
  const restored = await layerInfo();
  check('restore original brings back asset and box', restored.assetId === before.assetId && !restored.cutout && Math.abs(restored.w - before.w) < 1e-6 && Math.abs(restored.h - before.h) < 1e-6 && Math.abs(restored.x - before.x) < 1e-6 && Math.abs(restored.y - before.y) < 1e-6, JSON.stringify({ x: restored.x, y: restored.y, w: restored.w, h: restored.h }));
  await page.evaluate(() => CC.App.undo());

  /* rotated + flipped layer: restore must still land exactly */
  await page.evaluate(() => { CC.App.undo(); CC.App.change('t', () => { const l = CC.App.primaryLayer(); l.rotation = 33; l.flipX = true; l.w *= 0.7; }); });
  const rot = await layerInfo();
  await page.click('[data-insp-action="image-cutout"]');
  const t1 = Date.now();
  await page.waitForFunction(() => document.querySelector('.cutout-dialog [data-cut-overlay]').hidden, null, { timeout: 300000 });
  check('second run needs no download', !cold || Date.now() - t1 < firstMs, `${((Date.now() - t1) / 1000).toFixed(1)} s`);
  await page.click('.cutout-dialog .modal-foot [data-primary="1"]');
  await page.waitForSelector('.cutout-dialog', { state: 'detached', timeout: 60000 });
  await page.evaluate(() => CC.App.change('scale', () => { const l = CC.App.primaryLayer(); l.w *= 1.5; l.h *= 1.5; }));
  await page.click('[data-insp-action="image-uncutout"]');
  const rot2 = await layerInfo();
  check('restore on a rotated, flipped, rescaled layer keeps proportions', Math.abs(rot2.w / rot2.h - rot.w / rot.h) < 1e-6 && Math.abs(rot2.w - rot.w * 1.5) < 1e-6, '');
  await page.evaluate(() => CC.App.undo());

  /* keep the original layer */
  await page.locator('[data-menu-trigger]', { hasText: '图层' }).click();
  await page.locator('.menu .menu-item', { hasText: '智能抠图' }).click();
  await page.waitForFunction(() => document.querySelector('.cutout-dialog [data-cut-overlay]')?.hidden, null, { timeout: 300000 });
  await page.check('.cutout-dialog [data-cut="keep"]');
  await page.click('.cutout-dialog .modal-foot [data-primary="1"]');
  await page.waitForSelector('.cutout-dialog', { state: 'detached', timeout: 60000 });
  const kept = await layerInfo();
  check('keep original: result goes to a new layer', kept.layers === 2 && kept.id !== before.id, '');

  /* originals survive save + reopen (unused assets are pruned on open) */
  await page.evaluate(() => CC.App.saveProject({ force: true }));
  await page.waitForFunction(() => !CC.App.state.dirty);
  const docId = await page.evaluate(() => CC.App.state.doc.id);
  await ctx.close();
  ({ ctx, page } = await open());
  await page.evaluate((id) => CC.App.openProject(id).then(() => CC.App.hideHome?.()), docId);
  await page.waitForFunction(() => CC.App.state.doc);
  const reopened = await page.evaluate(() => ({ assets: CC.App.state.assets.size, ok: CC.App.state.doc.layers.every((l) => CC.App.state.assets.has(l.assetId) && (!l.cutout || CC.App.state.assets.has(l.cutout.src))), restorable: CC.App.state.doc.layers.filter((l) => CC.App.canRestoreCutout(l)).length }));
  check('cutout originals kept after reopen', reopened.ok && reopened.restorable === 2, JSON.stringify(reopened));
  /* .chaos export keeps the originals too */
  const packed = await page.evaluate(async () => {
    const doc = CC.App.state.doc;
    const data = JSON.parse(await (await CC.App.buildCurrentFile()).text());
    const ids = new Set((data.assets || []).map((a) => a.id));
    return { assets: ids.size, srcs: doc.layers.every((l) => ids.has(l.assetId) && (!l.cutout || ids.has(l.cutout.src))) };
  });
  check('.chaos file includes cutout originals', packed.srcs && packed.assets === 3, JSON.stringify(packed));

  /* CPU / GPU switch: forcing the CPU restarts the engine and offers the way back */
  await page.evaluate(() => CC.App.select(CC.App.state.doc.layers[0].id));
  await page.evaluate(() => CC.cutout.setPrefersCpu(true));
  await page.click('[data-insp-action="image-cutout"]');
  await page.waitForFunction(() => document.querySelector('.cutout-dialog [data-cut-overlay]')?.hidden, null, { timeout: 300000 });
  const hasGpu = await page.evaluate(() => !!navigator.gpu);
  check('forced CPU run works and offers GPU again', (await page.evaluate(() => CC.cutout.backend())) === 'wasm' && (await page.locator('.cutout-dialog [data-cut-engine="gpu"]').count()) === (hasGpu ? 1 : 0), `navigator.gpu=${hasGpu}`);
  if (hasGpu) {
    await page.click('.cutout-dialog [data-cut-engine="gpu"]');
    await page.waitForFunction(() => document.querySelector('.cutout-dialog [data-cut-overlay]')?.hidden, null, { timeout: 300000 });
    check('GPU preference restored', !(await page.evaluate(() => CC.cutout.prefersCpu())) && (await page.locator('.cutout-dialog [data-cut-engine="gpu"]').count()) === 0);
  }
  await page.click('.cutout-dialog .modal-foot .ui-button:not(.primary)');
  await page.waitForSelector('.cutout-dialog', { state: 'detached' });

  /* non-image layers */
  await page.evaluate(() => CC.App.addLayer(CC.model.createShape(CC.App.state.doc, 'rect')));
  check('shape layer cannot be cut out', !(await page.evaluate(() => CC.App.canCutout())));

  const real = errors.filter((e) => !/favicon/.test(e));
  check('no console errors or warnings', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
  console.log(results.join('\n'));
  console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((error) => { console.log(results.join('\n')); console.error(error); process.exit(1); });
