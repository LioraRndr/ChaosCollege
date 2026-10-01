import { launch } from './lib.mjs';
for (const [w, h] of [[1280, 720], [1024, 700]]) {
  const { page, logs, close } = await launch({ width: w, height: h });
  await page.screenshot({ path: `/tmp/cc-tools/out/home-${w}.png` });
  await page.click('[data-quick="0"]');
  await page.waitForFunction(() => CC.App.state.doc && !CC.ui.dialogsOpen());
  await page.evaluate(() => { const l = CC.model.createText(CC.App.state.doc, 'SMALL'); CC.App.addLayer(l); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/cc-tools/out/editor-${w}.png` });
  console.log(w, logs.join('\n') || 'no errors');
  await close();
}
