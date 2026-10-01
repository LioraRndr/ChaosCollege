import { launch } from './lib.mjs';
const { page, logs, close } = await launch();
const shot = (n) => page.screenshot({ path: `/tmp/cc-tools/out/${n}.png` });
await page.click('[data-home-action="new"]');
await page.waitForSelector('.newproj');
await page.click('[data-cat="print"]');
await page.click('[data-preset-index="1"]');
await shot('10-newproj');
await page.click('.modal-foot .ui-button.primary');
await page.waitForFunction(() => CC.App.state.doc && !CC.App.state.homeOpen && !CC.ui.dialogsOpen());
console.log('created', await page.evaluate(() => [CC.App.state.doc.name, CC.App.state.doc.width, CC.App.state.doc.height]));
// generators flyout
await page.keyboard.press('g');
await page.waitForTimeout(1500);
await shot('11-gen-flyout');
await page.click('[data-fly-item="gen-terrain"]');
await page.click('[data-fly-item="win-xp"]');
await page.keyboard.press('e');
await page.waitForTimeout(1200);
await shot('12-elements-flyout');
await page.click('[data-fly-item="vec-butterfly"]');
await page.keyboard.press('Escape');
// add effect via inspector button
await page.click('[data-insp-action="add-effect"]');
await page.waitForTimeout(200);
await page.hover('.menu .menu-item:has-text("故障")');
await page.waitForTimeout(200);
await shot('13-fx-menu');
await page.click('.menu .menu-item:has-text("RGB 分离")');
await page.waitForTimeout(400);
await shot('14-fx-added');
// menubar: image > canvas presets submenu
await page.click('[data-menu-trigger="image"]');
await page.hover('.menu .menu-item:has-text("画布预设")');
await page.waitForTimeout(150);
await page.hover('.menu >> nth=1 >> .menu-item:has-text("社交平台")');
await page.waitForTimeout(150);
await shot('15-menu-nested');
await page.click('.menu >> nth=2 >> .menu-item >> nth=0');
await page.waitForSelector('.canvas-size');
await shot('16-canvas-size');
await page.click('.radio-list input[value="anchor"]');
await page.click('.modal-foot .ui-button.primary');
await page.waitForTimeout(400);
console.log('resized', await page.evaluate(() => [CC.App.state.doc.width, CC.App.state.doc.height]));
// text + font picker
await page.evaluate(() => { const l = CC.model.createText(CC.App.state.doc, '字体 Font'); CC.App.addLayer(l); });
await page.waitForTimeout(300);
await page.click('.font-trigger-field');
await page.waitForTimeout(300);
await shot('17-font-picker');
await page.keyboard.press('Escape');
// export dialog
await page.keyboard.press('Control+e');
await page.waitForSelector('.export-form');
await shot('18-export');
await page.keyboard.press('Escape');
// layer context menu
const vp = await page.locator('#viewport').boundingBox();
const p = await page.evaluate(() => { const l = CC.App.primaryLayer(); return CC.App.docToScreen(l.x, l.y); });
await page.mouse.click(vp.x + p.x, vp.y + p.y, { button: 'right' });
await page.waitForTimeout(200);
await shot('19-context');
await page.keyboard.press('Escape');
// help
await page.click('[data-menu-trigger="help"]');
await page.click('.menu .menu-item:has-text("快捷键")');
await page.waitForTimeout(200);
await shot('20-shortcuts');
console.log(logs.join('\n') || 'no errors');
await close();
