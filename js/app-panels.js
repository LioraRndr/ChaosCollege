/* CHAOS.COLLAGE — panels (extends CC.App): tool rail, tool options bar,
   layers / resources / history tabs, generator & sticker flyouts, inspector. */
(() => {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const M = CC.model;
  const ui = CC.ui;
  const App = CC.App;
  const { state, dom } = App;
  const { escapeHtml } = U;

  const BLEND_MODES = [
    ['source-over', '正常'],
    ['multiply', '正片叠底'],
    ['screen', '滤色'],
    ['overlay', '叠加'],
    ['darken', '变暗'],
    ['lighten', '变亮'],
    ['color-dodge', '颜色减淡'],
    ['color-burn', '颜色加深'],
    ['hard-light', '强光'],
    ['soft-light', '柔光'],
    ['difference', '差值'],
    ['exclusion', '排除'],
    ['hue', '色相'],
    ['saturation', '饱和度'],
    ['color', '颜色'],
    ['luminosity', '明度'],
    ['lighter', '线性减淡（添加）'],
  ];

  const SHAPE_TYPES = [
    ['rect', '矩形', 'rect'],
    ['roundrect', '圆角矩形', 'roundrect'],
    ['ellipse', '椭圆', 'ellipse'],
    ['triangle', '三角形', 'triangle'],
    ['polygon', '多边形', 'polygon'],
    ['star', '星形', 'star'],
    ['sparkle', '闪光星', 'sparkle'],
    ['burst', '爆裂形', 'burst'],
    ['arrow', '箭头', 'arrow'],
    ['line', '直线', 'line'],
    ['ring', '圆环', 'ring'],
    ['cross', '十字', 'cross'],
  ];

  const LAYER_ICONS = { image: 'image', text: 'text', shape: 'shape', window: 'window', vector: 'vector', gen: 'gen', shatter: 'shatter', path: 'path' };

  /* ---------------- top bar / status ---------------- */

  function renderSaveStatus() {
    const el = dom.saveState;
    if (!el) return;
    const labels = { idle: '', saved: '已保存到工程库', saving: '保存中…', unsaved: '有改动', error: '保存失败' };
    el.textContent = labels[state.saveStatus] || '';
    el.dataset.status = state.saveStatus;
    el.title = state.fileHandle ? `已关联文件：${state.fileHandle.name}（Ctrl+S 同时写入文件）` : '自动保存到本机浏览器工程库';
  }

  function updateUndoButtons() {
    if (!dom.undoButton) return;
    dom.undoButton.disabled = !state.history.length;
    dom.redoButton.disabled = !state.future.length;
    dom.undoButton.title = state.history.length ? `撤销：${state.history[state.history.length - 1].label} (Ctrl+Z)` : '撤销 (Ctrl+Z)';
    dom.redoButton.title = state.future.length ? `重做：${state.future[state.future.length - 1].label} (Ctrl+Shift+Z)` : '重做 (Ctrl+Shift+Z)';
  }

  function renderTopbar() {
    const doc = state.doc;
    if (dom.docName && document.activeElement !== dom.docName) dom.docName.value = doc ? doc.name : '';
    if (dom.docName) dom.docName.disabled = !doc;
    renderSaveStatus();
    updateUndoButtons();
  }

  function renderZoom() {
    if (dom.zoomValue) dom.zoomValue.textContent = `${Math.round(state.view.zoom * 100)}%`;
  }

  function renderStatus() {
    const doc = state.doc;
    if (!dom.statusDoc) return;
    dom.statusDoc.textContent = doc ? `${doc.width} × ${doc.height} px · ${M.ratioLabel(doc.width, doc.height)}` : '';
    dom.seedButton.textContent = doc ? String(doc.seed) : '—';
    const tool = App.TOOLS.find((item) => item.id === state.tool);
    const hints = {
      select: '拖动移动 · 边角柄非等比拉伸（Shift 等比，Alt 中心）· 顶柄旋转 · Alt 拖动复制 · Ctrl 拖动关闭吸附',
      transform: '拖动角点变形；网格模式拖动 16 个控制点；Esc 取消选择',
      hand: '拖动平移画布 · 任何工具下按住空格也可平移',
      zoom: '单击放大 · Alt+单击缩小 · Ctrl+滚轮缩放',
      text: '单击空白处新建文字 · 单击已有文字直接编辑 · Ctrl+Enter 完成',
      shape: '拖动绘制形状 · Shift 等比 · Alt 从中心绘制 · 单击放置默认尺寸',
      brush: '按住拖动绘制笔触，每一笔是一个可编辑的图层',
      eyedropper: '单击画布取色，自动应用到选中图层的主色',
    };
    dom.statusText.textContent = hints[state.tool] || tool?.name || '';
  }

  function renderCursorPos(point) {
    if (!dom.statusPos) return;
    dom.statusPos.textContent = point ? `X ${Math.round(point.x)}  Y ${Math.round(point.y)}` : '';
  }

  /* ---------------- tool rail ---------------- */

  function renderToolrail() {
    const rail = dom.toolrail;
    if (!rail) return;
    if (!rail.dataset.ready) {
      rail.dataset.ready = '1';
      rail.innerHTML = `
        ${App.TOOLS.map((tool) => `<button class="tool-button" data-tool="${tool.id}" title="${escapeHtml(tool.name)} (${tool.key})">${ui.icon(tool.icon)}</button>`).join('')}
        <span class="tool-sep"></span>
        <button class="tool-button" data-rail-action="import" title="导入图片 (拖放 / 粘贴也可以)">${ui.icon('image')}</button>
        <button class="tool-button flyout-trigger" data-rail-action="generators" title="生成器 (G)">${ui.icon('gen')}</button>
        <button class="tool-button flyout-trigger" data-rail-action="elements" title="素材贴纸 (E)">${ui.icon('sticker')}</button>
        <span class="tool-spacer"></span>
        <div class="color-chips" title="前景色 / 备用色（X 交换）">
          <label class="color-chip fg"><input type="color" data-opt-color="fg"></label>
          <label class="color-chip bg"><input type="color" data-opt-color="bg2"></label>
          <button class="swap-colors" data-rail-action="swap" title="交换 (X)">⇄</button>
        </div>`;
      rail.addEventListener('click', (event) => {
        const tool = event.target.closest('[data-tool]');
        if (tool) {
          App.setTool(tool.dataset.tool);
          return;
        }
        const action = event.target.closest('[data-rail-action]')?.dataset.railAction;
        if (action === 'import') App.chooseImages();
        if (action === 'generators' || action === 'elements') toggleFlyout(action);
        if (action === 'swap') {
          [state.opts.fg, state.opts.bg2] = [state.opts.bg2, state.opts.fg];
          renderToolrail();
        }
      });
      rail.addEventListener('input', (event) => {
        const key = event.target.dataset.optColor;
        if (!key) return;
        state.opts[key] = event.target.value;
        rail.querySelector(`.color-chip.${key === 'fg' ? 'fg' : 'bg'}`).style.background = event.target.value;
      });
    }
    rail.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === state.tool));
    rail.querySelectorAll('[data-rail-action="generators"], [data-rail-action="elements"]').forEach((button) => button.classList.toggle('active', flyoutKind === button.dataset.railAction));
    const fg = rail.querySelector('[data-opt-color="fg"]');
    const bg = rail.querySelector('[data-opt-color="bg2"]');
    fg.value = state.opts.fg;
    bg.value = state.opts.bg2;
    rail.querySelector('.color-chip.fg').style.background = state.opts.fg;
    rail.querySelector('.color-chip.bg').style.background = state.opts.bg2;
    rail.classList.toggle('disabled', !state.doc);
  }

  /* ---------------- tool options bar ---------------- */

  function renderOptionsBar() {
    const bar = dom.optionsBar;
    if (!bar) return;
    const opts = state.opts;
    let html = '';
    const tool = App.TOOLS.find((item) => item.id === state.tool);
    html += `<span class="opt-title">${ui.icon(tool?.icon || 'select')}<span>${escapeHtml(tool?.name.split('（')[0] || '')}</span></span><span class="opt-sep"></span>`;
    if (state.tool === 'select') {
      html += `
        <button class="opt-button${opts.snap ? ' on' : ''}" data-opt-toggle="snap" title="智能吸附（拖动时按住 Ctrl 临时关闭）">${ui.icon('magnet')}<span>吸附</span></button>
        <button class="opt-button${opts.grid ? ' on' : ''}" data-opt-toggle="grid" title="显示网格">${ui.icon('grid')}<span>网格</span></button>
        <span class="opt-sep"></span>
        ${['alignLeft:left', 'alignCenter:hcenter', 'alignRight:right', 'alignTop:top', 'alignMiddle:vcenter', 'alignBottom:bottom'].map((pair) => {
          const [iconName, mode] = pair.split(':');
          return `<button class="opt-icon" data-opt-align="${mode}" title="${{ left: '左对齐', hcenter: '水平居中', right: '右对齐', top: '顶对齐', vcenter: '垂直居中', bottom: '底对齐' }[mode]}（单选对齐画布，多选对齐选区）">${ui.icon(iconName)}</button>`;
        }).join('')}
        <button class="opt-icon" data-opt-action="distribute-x" title="水平分布">${ui.icon('distH')}</button>
        <button class="opt-icon" data-opt-action="distribute-y" title="垂直分布">${ui.icon('distV')}</button>
        <span class="opt-sep"></span>
        <button class="opt-icon" data-opt-action="flip-x" title="水平翻转">${ui.icon('flipH')}</button>
        <button class="opt-icon" data-opt-action="flip-y" title="垂直翻转">${ui.icon('flipV')}</button>`;
    } else if (state.tool === 'transform') {
      html += `
        ${ui.segmented('warpMode', opts.warpMode, [['distort', '扭曲'], ['perspective', '透视'], ['skew', '斜切'], ['mesh', '网格变形']], { scope: 'opts' })}
        <span class="opt-sep"></span>
        <button class="opt-button" data-opt-action="warp-presets">${ui.icon('warp')}<span>预设</span>${ui.icon('chevron')}</button>
        <button class="opt-button" data-opt-action="warp-reset" title="清除选中图层的全部变形">${ui.icon('reset')}<span>重置</span></button>
        <span class="opt-hint">${App.primaryLayer() ? '图层、文字、贴纸、生成器都可以变形；变形不破坏原内容' : '先选中一个图层'}</span>`;
    } else if (state.tool === 'shape') {
      html += `<div class="opt-shapes">${SHAPE_TYPES.map(([type, label, iconName]) => `<button class="opt-icon${opts.shapeType === type ? ' on' : ''}" data-opt-shape="${type}" title="${label}">${ui.icon(iconName)}</button>`).join('')}</div>
        <span class="opt-hint">填充使用前景色 · Shift 等比 · Alt 从中心</span>`;
    } else if (state.tool === 'brush') {
      html += `
        ${ui.segmented('brush.style', opts.brush.style, [['round', '圆头'], ['marker', '马克笔'], ['neon', '霓虹'], ['dashed', '虚线'], ['spray', '喷漆']], { scope: 'opts' })}
        <label class="opt-field">粗细<input type="range" min="1" max="160" step="1" value="${opts.brush.size}" data-opt-path="brush.size"><em>${opts.brush.size}</em></label>
        <label class="opt-field">平滑<input type="range" min="0" max="100" step="1" value="${opts.brush.smooth}" data-opt-path="brush.smooth"><em>${opts.brush.smooth}</em></label>
        <span class="opt-hint">颜色使用前景色</span>`;
    } else if (state.tool === 'text') {
      html += `
        <button class="opt-button font-trigger" data-font-trigger="opts" title="新文字的字体"><span style="font-family:${escapeHtml(CC.fonts.stack(opts.textFamily))}">${escapeHtml(CC.fonts.label(opts.textFamily))}</span>${ui.icon('chevron')}</button>
        <span class="opt-hint">单击画布新建文字；单击已有文字直接编辑</span>`;
    } else if (state.tool === 'eyedropper') {
      html += `<span class="opt-swatch" style="background:${escapeHtml(opts.fg)}"></span><span class="opt-hint">当前取色 ${escapeHtml(opts.fg)}</span>`;
    } else {
      html += `<span class="opt-hint">${state.tool === 'hand' ? '拖动平移；滚轮也可以平移' : '单击放大，Alt 单击缩小'}</span>`;
    }
    bar.querySelector('.options-left').innerHTML = html;
    ui.syncRangeFill && bar.querySelectorAll('input[type="range"]').forEach(ui.syncRangeFill);
    renderZoom();
  }

  function setupOptionsBar() {
    const bar = dom.optionsBar;
    bar.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-opt-toggle]');
      if (toggle) {
        const key = toggle.dataset.optToggle;
        state.opts[key] = !state.opts[key];
        CC.storage.setSetting('opts', { snap: state.opts.snap, grid: state.opts.grid }).catch(() => {});
        renderOptionsBar();
        App.requestRender('overlay');
        return;
      }
      const align = event.target.closest('[data-opt-align]');
      if (align) {
        App.alignSelection(align.dataset.optAlign);
        return;
      }
      const shape = event.target.closest('[data-opt-shape]');
      if (shape) {
        state.opts.shapeType = shape.dataset.optShape;
        renderOptionsBar();
        return;
      }
      const seg = event.target.closest('[data-seg-path]');
      if (seg && seg.dataset.scope === 'opts') {
        U.setByPath(state.opts, seg.dataset.segPath, seg.dataset.segValue);
        renderOptionsBar();
        App.requestRender('overlay');
        return;
      }
      const font = event.target.closest('[data-font-trigger="opts"]');
      if (font) {
        openFontPickerFor(font, state.opts.textFamily, (family) => {
          state.opts.textFamily = family;
          renderOptionsBar();
        });
        return;
      }
      const action = event.target.closest('[data-opt-action]')?.dataset.optAction;
      if (!action) return;
      if (action === 'distribute-x') App.distributeSelection('x');
      if (action === 'distribute-y') App.distributeSelection('y');
      if (action === 'flip-x') App.flipSelection('x');
      if (action === 'flip-y') App.flipSelection('y');
      if (action === 'warp-reset') App.resetWarp();
      if (action === 'warp-presets') {
        const rect = event.target.closest('button').getBoundingClientRect();
        ui.openMenuAt({ left: rect.left, top: rect.bottom + 4, bottom: rect.top }, warpPresetItems());
      }
    });
    bar.addEventListener('input', (event) => {
      const path = event.target.dataset.optPath;
      if (!path) return;
      U.setByPath(state.opts, path, Number(event.target.value));
      const em = event.target.parentElement.querySelector('em');
      if (em) em.textContent = event.target.value;
      ui.syncRangeFill(event.target);
    });
    dom.zoomOut.addEventListener('click', () => App.zoomStep(-1));
    dom.zoomIn.addEventListener('click', () => App.zoomStep(1));
    dom.zoomFit.addEventListener('click', () => App.fitView());
    dom.zoomValue.addEventListener('click', (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      ui.openMenuAt({ left: rect.left, top: rect.bottom + 4, bottom: rect.top }, [
        { label: '适应窗口', shortcut: 'Ctrl+0', action: () => App.fitView() },
        { label: '100% 实际像素', shortcut: 'Ctrl+1', action: () => App.zoomTo(1) },
        { separator: true },
        ...[0.25, 0.5, 2, 4].map((zoom) => ({ label: `${zoom * 100}%`, action: () => App.zoomTo(zoom) })),
      ]);
    });
  }

  function warpPresetItems() {
    const amount = 0.22;
    const apply = (kind, value = amount) => () => {
      if (!App.primaryLayer()) {
        ui.toast('先选中一个图层');
        return;
      }
      App.applyWarpPreset(kind, value);
    };
    return [
      { heading: '透视 / 斜切' },
      { label: '透视 · 左侧收缩', action: apply('perspective-left') },
      { label: '透视 · 右侧收缩', action: apply('perspective-right') },
      { label: '透视 · 顶部收缩', action: apply('perspective-top') },
      { label: '透视 · 底部收缩', action: apply('perspective-bottom') },
      { label: '水平斜切', action: apply('skew-x', 0.15) },
      { label: '垂直斜切', action: apply('skew-y', 0.12) },
      { separator: true },
      { heading: '网格变形' },
      { label: '拱形', action: apply('arc', 0.5) },
      { label: '下拱', action: apply('arc', -0.5) },
      { label: '凸起', action: apply('arch', 0.6) },
      { label: '膨胀', action: apply('bulge', 0.7) },
      { label: '挤压', action: apply('pinch', 0.7) },
      { label: '波浪', action: apply('wave', 0.6) },
      { label: '旗帜', action: apply('flag', 0.8) },
      { label: '扭转', action: apply('twist', 0.45) },
      { label: '上升', action: apply('rise', 0.4) },
      { separator: true },
      { label: '重置全部变形', icon: 'reset', action: () => App.resetWarp() },
    ];
  }

  /* ---------------- left panel: layers ---------------- */

  function renderLayers() {
    const list = dom.layersList;
    if (!list) return;
    const doc = state.doc;
    if (!doc || !doc.layers.length) {
      list.innerHTML = `<div class="empty-panel"><strong>${doc ? '空白画布' : '没有打开工程'}</strong><p>${doc ? '用左侧工具栏添加文字、形状、生成器或贴纸，也可以直接把图片拖进画布。' : '从工程主页新建或打开一个工程。'}</p></div>`;
      return;
    }
    const selected = new Set(state.selection);
    const layers = [...doc.layers].reverse();
    list.innerHTML = layers.map((layer) => {
      const fxCount = (layer.effects || []).filter((effect) => effect.on).length;
      const repeat = Math.round(layer.repeater?.count || 1);
      const warped = CC.warp.isActive(layer.warp);
      const styled = layer.style && (layer.style.shadow?.on || layer.style.glow?.on || layer.style.outline?.on);
      return `
        <div class="layer-row${selected.has(layer.id) ? ' active' : ''}${layer.visible ? '' : ' hidden-layer'}${layer.clip ? ' clipped' : ''}${layer.locked ? ' locked' : ''}" data-layer-id="${layer.id}" draggable="true">
          <button class="row-toggle" data-visibility-id="${layer.id}" title="${layer.visible ? '隐藏' : '显示'}">${ui.icon(layer.visible ? 'eye' : 'eyeOff')}</button>
          ${layer.clip ? `<span class="clip-mark" title="剪切蒙版：裁切到下方图层">${ui.icon('clip')}</span>` : ''}
          <span class="layer-icon type-${layer.type}">${ui.icon(LAYER_ICONS[layer.type] || 'shape')}</span>
          <span class="layer-copy">
            <strong data-rename-id="${layer.id}">${escapeHtml(layer.name)}</strong>
            <small>${escapeHtml(M.TYPE_NAMES[layer.type] || '图层')} · ${Math.round(layer.w)} × ${Math.round(layer.h)}</small>
          </span>
          <span class="layer-badges">
            ${fxCount ? `<span class="badge" title="${fxCount} 个效果">fx${fxCount > 1 ? fxCount : ''}</span>` : ''}
            ${warped ? `<span class="badge" title="已变形">${ui.icon('warp')}</span>` : ''}
            ${styled ? '<span class="badge" title="图层样式">◐</span>' : ''}
            ${repeat > 1 ? `<span class="badge">×${repeat}</span>` : ''}
          </span>
          <button class="row-toggle lock${layer.locked ? ' on' : ''}" data-lock-id="${layer.id}" title="${layer.locked ? '解锁' : '锁定'}">${ui.icon(layer.locked ? 'lock' : 'unlock')}</button>
        </div>`;
    }).join('');
  }

  function setupLayersPanel() {
    const list = dom.layersList;
    list.addEventListener('click', (event) => {
      const visibility = event.target.closest('[data-visibility-id]');
      if (visibility) {
        event.stopPropagation();
        const layer = App.layerById(visibility.dataset.visibilityId);
        App.toggleLayerFlag(layer.id, 'visible', layer.visible ? '隐藏图层' : '显示图层');
        return;
      }
      const lock = event.target.closest('[data-lock-id]');
      if (lock) {
        event.stopPropagation();
        const layer = App.layerById(lock.dataset.lockId);
        App.toggleLayerFlag(layer.id, 'locked', layer.locked ? '解锁图层' : '锁定图层');
        return;
      }
      const row = event.target.closest('[data-layer-id]');
      if (!row) {
        if (event.target === list) App.select([]);
        return;
      }
      const id = row.dataset.layerId;
      if (event.shiftKey && state.selection.length) {
        const order = [...state.doc.layers].reverse().map((layer) => layer.id);
        const anchor = order.indexOf(state.selection[state.selection.length - 1]);
        const target = order.indexOf(id);
        const [a, b] = anchor < target ? [anchor, target] : [target, anchor];
        App.select(order.slice(a, b + 1));
      } else if (event.ctrlKey || event.metaKey) App.select(id, { toggle: true });
      else App.select(id);
    });
    list.addEventListener('dblclick', (event) => {
      const name = event.target.closest('[data-rename-id]');
      if (!name) return;
      startRename(name);
    });
    list.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('[data-layer-id]');
      if (!row) return;
      event.preventDefault();
      if (!state.selection.includes(row.dataset.layerId)) App.select(row.dataset.layerId);
      App.openContextMenu?.(event.clientX, event.clientY, true);
    });
    let dragged = null;
    const clear = () => list.querySelectorAll('.drop-before, .drop-after, .dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
    list.addEventListener('dragstart', (event) => {
      const row = event.target.closest('[data-layer-id]');
      if (!row) return;
      dragged = row.dataset.layerId;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragged);
      requestAnimationFrame(() => row.classList.add('dragging'));
    });
    list.addEventListener('dragover', (event) => {
      if (!dragged) return;
      event.preventDefault();
      const row = event.target.closest('[data-layer-id]');
      clear();
      list.querySelector(`[data-layer-id="${dragged}"]`)?.classList.add('dragging');
      if (!row || row.dataset.layerId === dragged) return;
      const rect = row.getBoundingClientRect();
      row.classList.add(event.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
    });
    list.addEventListener('drop', (event) => {
      if (!dragged) return;
      event.preventDefault();
      const row = event.target.closest('[data-layer-id]');
      const target = row && row.dataset.layerId !== dragged ? row.dataset.layerId : null;
      const before = row ? row.classList.contains('drop-before') : false;
      clear();
      if (target) App.reorderLayer(dragged, target, before);
      dragged = null;
    });
    list.addEventListener('dragend', () => {
      dragged = null;
      clear();
    });
    dom.layerAddButton.addEventListener('click', (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      ui.openMenuAt({ left: rect.left, top: rect.bottom + 4, bottom: rect.top }, App.addMenuItems());
    });
    dom.layerDuplicateButton.addEventListener('click', () => App.duplicateSelection());
    dom.layerDeleteButton.addEventListener('click', () => App.deleteSelection());
  }

  function startRename(nameEl) {
    const layer = App.layerById(nameEl.dataset.renameId);
    if (!layer) return;
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.value = layer.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (save && value && value !== layer.name) App.change('重命名图层', () => {
        layer.name = value.slice(0, 80);
      });
      else renderLayers();
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* ---------------- left panel: resources ---------------- */

  function renderResources() {
    const el = dom.resourcesPanel;
    if (!el || !el.classList.contains('active')) return;
    const assets = [...state.assets.values()];
    const usage = new Map();
    (state.doc?.layers || []).forEach((layer) => {
      if (layer.assetId) usage.set(layer.assetId, (usage.get(layer.assetId) || 0) + 1);
    });
    const fonts = CC.fonts.importedRecords();
    el.querySelector('[data-res-images]').innerHTML = assets.length
      ? assets.map((asset) => `
        <button class="asset-card" data-asset-id="${asset.id}" title="${escapeHtml(asset.name)} · ${asset.width}×${asset.height}\n单击添加为新图层">
          <img src="${asset.url}" alt="" loading="lazy">
          <span>${escapeHtml(asset.name || '图片')}</span>
          <em>${usage.get(asset.id) ? `已用 ${usage.get(asset.id)}` : '未使用'}</em>
        </button>`).join('')
      : '<div class="empty-panel compact"><p>工程中还没有图片。导入、拖放或粘贴图片后会出现在这里。</p></div>';
    el.querySelector('[data-res-fonts]').innerHTML = fonts.length
      ? fonts.map((font) => `
        <div class="font-row">
          <span style="font-family:${escapeHtml(CC.fonts.stack(font.family))}">${escapeHtml(font.family)}</span>
          <button class="icon-button icon-only" data-remove-font="${escapeHtml(font.family)}" title="从字体库移除">${ui.icon('trash')}</button>
        </div>`).join('')
      : '<div class="empty-panel compact"><p>导入的 TTF / OTF / WOFF 字体会保存在本机字体库，并随工程文件一起打包。</p></div>';
    el.querySelector('[data-local-count]').textContent = CC.fonts.localFamilies.length ? `已读取 ${CC.fonts.localFamilies.length} 个本机字体` : (CC.fonts.hasLocalFontAccess() ? '未读取' : '当前浏览器不支持');
  }

  function setupResourcesPanel() {
    const el = dom.resourcesPanel;
    el.addEventListener('click', async (event) => {
      const card = event.target.closest('[data-asset-id]');
      if (card) {
        App.addImageAsset(card.dataset.assetId);
        return;
      }
      const remove = event.target.closest('[data-remove-font]');
      if (remove) {
        const family = remove.dataset.removeFont;
        const ok = await ui.confirmDialog(`从本机字体库移除「${family}」？已使用该字体的文字会回退到默认字体。`, { okLabel: '移除', danger: true });
        if (!ok) return;
        const record = CC.fonts.importedRecords().find((item) => item.family === family);
        CC.fonts.removeImported(family);
        if (record) await CC.storage.deleteFont(record.id);
        App.refreshFonts();
        renderResources();
        return;
      }
      const action = event.target.closest('[data-res-action]')?.dataset.resAction;
      if (action === 'import-image') App.chooseImages();
      if (action === 'import-font') App.chooseFonts();
      if (action === 'local-fonts') {
        try {
          const families = await CC.fonts.queryLocal();
          await CC.storage.setSetting('localFontFamilies', families);
          ui.toast(`已读取 ${families.length} 个本机字体`);
          renderResources();
        } catch (error) {
          ui.toast(error.message || '无法读取本机字体', 'error');
        }
      }
    });
  }

  /* ---------------- left panel: history ---------------- */

  function renderHistory() {
    const el = dom.historyList;
    if (!el || !dom.historyPanel.classList.contains('active')) return;
    if (!state.doc) {
      el.innerHTML = '';
      return;
    }
    const items = [{ label: '打开工程', index: 0 }];
    state.history.forEach((entry, index) => items.push({ label: entry.label, index: index + 1 }));
    const current = state.history.length;
    const future = [...state.future].reverse().map((entry, i) => ({ label: entry.label, index: current + i + 1, future: true }));
    el.innerHTML = [...items, ...future].map((item) => `
      <button class="history-row${item.index === current ? ' current' : ''}${item.future ? ' future' : ''}" data-history-index="${item.index}">
        <span class="history-dot"></span><span>${escapeHtml(item.label)}</span>
      </button>`).join('');
    el.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }

  function setupHistoryPanel() {
    dom.historyList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-history-index]');
      if (!row) return;
      App.jumpHistory(Number(row.dataset.historyIndex));
    });
  }

  function setupTabs() {
    document.querySelectorAll('.panel-tabs .tab-button').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.panel-tabs .tab-button').forEach((item) => item.classList.toggle('active', item === button));
        document.querySelectorAll('.left-panel .tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
        renderResources();
        renderHistory();
      });
    });
  }

  /* ---------------- flyouts: generators & stickers ---------------- */

  let flyoutKind = null;
  const thumbCache = new Map();
  const thumbDoc = M.newDoc({ width: 1000, height: 1000 });
  thumbDoc.seed = 20261001;

  function generatorCatalog() {
    const cats = CC.generators.CATEGORIES.map(([id, name]) => ({ id, name, items: [] }));
    const byId = Object.fromEntries(cats.map((cat) => [cat.id, cat]));
    byId.ui.items.push(
      { id: 'win-classic', name: '经典错误窗', make: (doc) => M.createWindow(doc) },
      { id: 'win-xp', name: 'XP 对话框', make: (doc) => M.createWindow(doc, { windowStyle: 'xp', accent: '#0a5ad8', icon: 'error', title: 'Error', buttons: 'OK|Cancel' }) },
      { id: 'win-mac', name: 'Mac 经典窗', make: (doc) => M.createWindow(doc, { windowStyle: 'mac', icon: 'info', title: 'Alert', body: 'The application\nhas unexpectedly quit.' }) },
      { id: 'win-dark', name: '暗色弹窗', make: (doc) => M.createWindow(doc, { windowStyle: 'dark', icon: 'question', title: 'system.log', body: 'Allow chaos to continue?', buttons: 'Deny|Allow' }) },
      { id: 'win-acid', name: '酸性警报', make: (doc) => M.createWindow(doc, { windowStyle: 'acid', title: 'ALERT', icon: 'warning' }) },
    );
    byId.code.items.push({ id: 'barcode', name: '条形码', make: (doc) => M.createShape(doc, 'barcode') });
    byId.pattern.items.push(
      { id: 'burst', name: '爆裂星', make: (doc) => M.createShape(doc, 'burst') },
      { id: 'tape', name: '胶带', make: (doc) => M.createShape(doc, 'tape') },
      { id: 'confetti', name: '纸屑云', make: (doc) => M.createConfetti(doc) },
    );
    byId.space.items.push(
      { id: 'shatter', name: '3D 爆裂', make: (doc) => M.createShatter(doc, 'burst') },
      { id: 'spike', name: '3D 尖刺', make: (doc) => M.createShatter(doc, 'spike') },
    );
    CC.generators.list().forEach((def) => {
      (byId[def.cat] || byId.pattern).items.push({ id: `gen-${def.type}`, name: def.name, make: (doc) => M.createGenerator(doc, def.type) });
    });
    return cats.filter((cat) => cat.items.length);
  }

  function elementsCatalog() {
    const cats = CC.vectorAssets.CATS.map(([id, name]) => ({
      id,
      name,
      items: CC.vectorAssets.ASSETS.filter((asset) => asset.cat === id).map((asset) => ({
        id: `vec-${asset.id}`,
        name: asset.name,
        assetId: asset.id,
        make: (doc) => M.createVector(doc, asset.id, defaultVectorColors(asset.id)),
      })),
    }));
    return cats;
  }

  function defaultVectorColors(assetId) {
    const map = {
      heart: { fill: '#ff4ca7' },
      'heart-wings': { fill: '#ff4ca7', color2: '#f4f1e7' },
      bolt: { fill: '#d7ff2f' },
      flame: { fill: '#ff7a18', color2: '#ffd400' },
      bow: { fill: '#ff8ad8', color2: '#ff4ca7' },
      butterfly: { fill: '#20e3d1' },
      cherry: { fill: '#e62e1b' },
      daisy: { fill: '#ffffff', color2: '#ffd400' },
      blossom: { fill: '#ffc2df', color2: '#ff4ca7' },
      smiley: { fill: '#ffd400' },
      peace: { fill: '#111111' },
      yinyang: { fill: '#ffffff' },
      eye: { fill: '#ffffff', color2: '#20e3d1' },
      moon: { fill: '#ffd400' },
      sun: { fill: '#ffd400', color2: '#ff7a18' },
      planet: { fill: '#3265ff', color2: '#d7ff2f' },
      globe: { fill: '#111111' },
      infinity: { fill: '#111111' },
      drop: { fill: '#20e3d1' },
      alien: { fill: '#9bff3a' },
      ghost: { fill: '#ffffff' },
      skull: { fill: '#f4f1e7' },
      kiss: { fill: '#e62e1b' },
      eightball: { fill: '#111111' },
      cursor: { fill: '#ffffff' },
      hourglass: { fill: '#111111', color2: '#ffd400' },
      spinner: { fill: '#111111' },
      warning: { fill: '#ffd400' },
      ban: { fill: '#e62e1b' },
      check: { fill: '#20e3d1' },
      cross: { fill: '#e62e1b' },
      asterisk: { fill: '#111111' },
      play: { fill: '#111111', color2: '#d7ff2f' },
      cd: { fill: '#c9ccd4', color2: '#8a93a6', fillMode: 'holo' },
      floppy: { fill: '#3265ff', color2: '#c9ccd4' },
      flipphone: { fill: '#c9ccd4', color2: '#20e3d1', fillMode: 'chrome', fill2: '#4a5160' },
      lock: { fill: '#ffd400' },
      bubble: { fill: '#ffffff', strokeWidth: 3 },
      thought: { fill: '#ffffff', strokeWidth: 3 },
      'arrow-curve': { fill: '#111111' },
      music: { fill: '#111111' },
      barbed: { fill: '#111111' },
      chain: { fill: '#8a93a6' },
      'px-heart': { fill: '#e62e1b' },
      'px-cursor': { fill: '#ffffff' },
      'px-invader': { fill: '#9bff3a' },
      'px-star': { fill: '#ffd400' },
      'px-smile': { fill: '#ffd400' },
      crown: { fill: '#ffd400', color2: '#e62e1b' },
      star5: { fill: '#ffd400' },
      'star-badge': { fill: '#e62e1b', color2: '#ffd400' },
      sparkle4: { fill: '#d7ff2f' },
      sparkle8: { fill: '#ffffff', fillMode: 'chrome', fill2: '#4a5160' },
      'sparkle-cluster': { fill: '#20e3d1' },
      wing: { fill: '#ffffff', strokeWidth: 1.5 },
    };
    return map[assetId] || {};
  }

  function itemThumb(item) {
    if (thumbCache.has(item.id)) return thumbCache.get(item.id);
    let url = '';
    try {
      const layer = item.make(thumbDoc);
      const size = 76;
      const canvas = U.makeCanvas(size * 2, size * 2);
      const ctx = canvas.getContext('2d');
      const scale = (size * 2 * 0.8) / Math.max(layer.w, layer.h);
      ctx.translate(size, size);
      ctx.scale(scale, scale);
      if (layer.type === 'shatter' || layer.type === 'gen') {
        const q = Math.min(1, scale * 1.2);
        App.renderer.drawContent(ctx, layer, thumbDoc, { q, instanceIndex: 0 });
      } else App.renderer.drawContent(ctx, layer, thumbDoc, { q: scale, instanceIndex: 0 });
      url = canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('thumb failed', item.id, error);
    }
    thumbCache.set(item.id, url);
    return url;
  }

  function renderFlyout() {
    const el = dom.flyout;
    if (!flyoutKind) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const catalog = flyoutKind === 'generators' ? generatorCatalog() : elementsCatalog();
    const title = flyoutKind === 'generators' ? '生成器' : '素材贴纸';
    const query = (el.dataset.query || '').trim().toLowerCase();
    el.innerHTML = `
      <div class="flyout-head">
        <strong>${title}</strong>
        <span class="flyout-sub">${flyoutKind === 'generators' ? '参数化图形，全部可编辑 / 变形 / 加效果' : '矢量贴纸，可换色、非等比拉伸'}</span>
        <button class="icon-button icon-only" data-flyout-close title="关闭">${ui.icon('close')}</button>
      </div>
      <div class="flyout-search search-field">${ui.icon('search')}<input type="text" placeholder="搜索…" value="${escapeHtml(el.dataset.query || '')}" data-flyout-search></div>
      <div class="flyout-body">
        ${catalog.map((cat) => {
          const items = cat.items.filter((item) => !query || item.name.toLowerCase().includes(query));
          if (!items.length) return '';
          return `<div class="fly-cat">${escapeHtml(cat.name)}</div><div class="fly-grid">${items.map((item) => `
            <button class="fly-item" data-fly-item="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}" draggable="false">
              <span class="fly-thumb" data-thumb-for="${escapeHtml(item.id)}"></span>
              <span class="fly-name">${escapeHtml(item.name)}</span>
            </button>`).join('')}</div>`;
        }).join('')}
        ${flyoutKind === 'elements' ? '<div class="fly-note">提示：选中贴纸后在右侧属性里可改填充模式（渐变 / 镀铬 / 全息）、副色、描边和效果。</div>' : ''}
      </div>`;
    const items = catalog.flatMap((cat) => cat.items);
    const pending = [...el.querySelectorAll('[data-thumb-for]')];
    const fill = () => {
      const started = performance.now();
      while (pending.length && performance.now() - started < 24) {
        const slot = pending.shift();
        const item = items.find((candidate) => candidate.id === slot.dataset.thumbFor);
        const url = item ? itemThumb(item) : '';
        if (url) slot.style.backgroundImage = `url(${url})`;
      }
      if (pending.length && flyoutKind) requestAnimationFrame(fill);
    };
    requestAnimationFrame(fill);
    renderToolrail();
  }

  function toggleFlyout(kind) {
    flyoutKind = flyoutKind === kind ? null : kind;
    if (dom.flyout) dom.flyout.dataset.query = '';
    renderFlyout();
    renderToolrail();
    if (flyoutKind) dom.flyout.querySelector('[data-flyout-search]')?.focus({ preventScroll: true });
  }

  function closeFlyout() {
    if (!flyoutKind) return;
    flyoutKind = null;
    renderFlyout();
    renderToolrail();
  }

  function setupFlyout() {
    const el = dom.flyout;
    el.addEventListener('click', (event) => {
      if (event.target.closest('[data-flyout-close]')) {
        closeFlyout();
        return;
      }
      const button = event.target.closest('[data-fly-item]');
      if (!button || !state.doc) {
        if (button) ui.toast('请先新建或打开一个工程');
        return;
      }
      const catalog = (flyoutKind === 'generators' ? generatorCatalog() : elementsCatalog()).flatMap((cat) => cat.items);
      const item = catalog.find((candidate) => candidate.id === button.dataset.flyItem);
      if (!item) return;
      const replaceTarget = App.primaryLayer();
      if (event.altKey && replaceTarget?.type === 'vector' && item.assetId) {
        App.change('替换贴纸', () => {
          replaceTarget.asset = item.assetId;
          replaceTarget.name = item.name;
        });
        return;
      }
      App.addLayer(item.make(state.doc), { label: `添加${item.name}` });
    });
    el.addEventListener('input', (event) => {
      if (!event.target.matches('[data-flyout-search]')) return;
      el.dataset.query = event.target.value;
      const caret = event.target.selectionStart;
      renderFlyout();
      const input = el.querySelector('[data-flyout-search]');
      input.focus();
      input.setSelectionRange(caret, caret);
    });
    el.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') closeFlyout();
    });
  }

  /* ---------------- inspector ---------------- */

  const openSections = new Map();
  const expandedFx = new Set();

  function sectionOpen(id, fallback = true) {
    return openSections.has(id) ? openSections.get(id) : fallback;
  }

  function sec(id, title, content, opts = {}) {
    return ui.section(id, title, content, { ...opts, open: sectionOpen(id, opts.open ?? true) });
  }

  function paintControls(layer, labels = {}) {
    const mode = layer.fillMode || 'solid';
    const gradient = ['linear', 'radial', 'chrome'].includes(mode);
    return [
      ui.select(labels.mode || '填充', 'fillMode', mode, CC.paint.MODES),
      mode !== 'none' && mode !== 'holo' ? ui.color(mode === 'chrome' ? '高光色' : gradient ? '起始色' : '颜色', 'fill', layer.fill) : '',
      gradient ? ui.color(mode === 'chrome' ? '暗部色' : '结束色', 'fill2', layer.fill2) : '',
      ['linear', 'chrome', 'holo'].includes(mode) ? ui.range('方向', 'fillAngle', layer.fillAngle ?? 90, 0, 360, 1, { unit: '°' }) : '',
    ].join('');
  }

  function fontTrigger(path, family) {
    return `
      <div class="control-row compact">
        <label>字体</label>
        <button type="button" class="font-trigger-field" data-font-trigger="${escapeHtml(path)}">
          <span style="font-family:${escapeHtml(CC.fonts.stack(family))}">${escapeHtml(CC.fonts.label(family))}</span>${ui.icon('chevron')}
        </button>
      </div>`;
  }

  function paramControls(params, values, prefix, layer) {
    return params.map((param) => {
      if (param.when && !param.when(values)) return '';
      const path = `${prefix}${param.key}`;
      const value = values[param.key];
      switch (param.type) {
        case 'range':
          return ui.range(param.label, path, value, param.min, param.max, param.step ?? 1, { unit: param.unit });
        case 'color':
          return ui.color(param.label, path, value);
        case 'select':
          return ui.select(param.label, path, value, param.options);
        case 'bool':
          return ui.checkbox(param.label, path, value);
        case 'text':
          return ui.text(param.label, path, value);
        case 'font':
          return fontTrigger(path, value);
        case 'layer': {
          const choices = [['', param.emptyLabel || '无'], ...state.doc.layers.filter((candidate) => candidate.type === 'image' && candidate.id !== layer.id).map((candidate) => [candidate.id, `图层：${candidate.name}`])];
          return ui.select(param.label, path, value, choices);
        }
        default:
          return '';
      }
    }).join('');
  }

  function effectStack(layer) {
    const effects = layer.effects || [];
    const cards = effects.map((effect, index) => {
      const def = CC.effects.get(effect.type);
      if (!def) return '';
      const expanded = expandedFx.has(effect.id);
      return `
        <div class="fx-card${effect.on ? '' : ' off'}${expanded ? ' expanded' : ''}" data-fx-id="${effect.id}">
          <div class="fx-head">
            <input type="checkbox" class="fx-toggle" ${effect.on ? 'checked' : ''} data-path="effects.${index}.on" data-scope="layer" data-kind="boolean" title="启用 / 停用">
            <button type="button" class="fx-title" data-fx-action="expand" data-fx-index="${index}">${ui.icon(expanded ? 'chevron' : 'chevronRight')}<span>${escapeHtml(def.name)}</span></button>
            <span class="fx-actions">
              <button type="button" class="icon-button icon-only" data-fx-action="up" data-fx-index="${index}" title="上移（先执行）" ${index === 0 ? 'disabled' : ''}>${ui.icon('up')}</button>
              <button type="button" class="icon-button icon-only" data-fx-action="down" data-fx-index="${index}" title="下移（后执行）" ${index === effects.length - 1 ? 'disabled' : ''}>${ui.icon('chevron')}</button>
              <button type="button" class="icon-button icon-only" data-fx-action="duplicate" data-fx-index="${index}" title="复制效果">${ui.icon('duplicate')}</button>
              <button type="button" class="icon-button icon-only" data-fx-action="remove" data-fx-index="${index}" title="删除效果">${ui.icon('trash')}</button>
            </span>
          </div>
          ${expanded ? `<div class="fx-body">
            ${def.desc ? `<p class="fx-desc">${escapeHtml(def.desc)}</p>` : ''}
            ${(def.presets || []).map((preset, presetIndex) => `<button type="button" class="mini-button wide" data-fx-action="preset" data-fx-index="${index}" data-preset="${presetIndex}">${escapeHtml(preset.label)}</button>`).join('')}
            ${paramControls(def.params, { ...CC.effects.defaults(effect.type), ...effect.p }, `effects.${index}.p.`, layer)}
            <button type="button" class="mini-button ghost" data-fx-action="reset" data-fx-index="${index}">${ui.icon('reset')}<span>恢复默认参数</span></button>
          </div>` : ''}
        </div>`;
    }).join('');
    return `
      <div class="fx-stack">
        ${cards || '<p class="muted-note">任何图层都可以叠加效果，按从上到下的顺序执行。</p>'}
        <button type="button" class="mini-button add-fx" data-insp-action="add-effect">${ui.icon('plus')}<span>添加效果</span></button>
      </div>`;
  }

  function styleControls(layer) {
    const style = layer.style;
    const parts = [];
    parts.push(ui.checkbox('投影', 'style.shadow.on', style.shadow.on));
    if (style.shadow.on) {
      parts.push(`<div class="sub-controls">
        ${ui.color('颜色', 'style.shadow.color', style.shadow.color)}
        ${ui.range('不透明度', 'style.shadow.opacity', style.shadow.opacity, 0, 1, 0.01)}
        ${ui.range('模糊', 'style.shadow.blur', style.shadow.blur, 0, 120, 1, { unit: 'px' })}
        ${ui.range('距离', 'style.shadow.distance', style.shadow.distance, 0, 300, 1, { unit: 'px' })}
        ${ui.range('角度', 'style.shadow.angle', style.shadow.angle, 0, 360, 1, { unit: '°' })}
      </div>`);
    }
    parts.push(ui.checkbox('外发光', 'style.glow.on', style.glow.on));
    if (style.glow.on) {
      parts.push(`<div class="sub-controls">
        ${ui.color('颜色', 'style.glow.color', style.glow.color)}
        ${ui.range('不透明度', 'style.glow.opacity', style.glow.opacity, 0, 1, 0.01)}
        ${ui.range('范围', 'style.glow.blur', style.glow.blur, 1, 160, 1, { unit: 'px' })}
        ${ui.range('强度', 'style.glow.strength', style.glow.strength, 1, 4, 1)}
      </div>`);
    }
    parts.push(ui.checkbox('贴纸描边', 'style.outline.on', style.outline.on));
    if (style.outline.on) {
      parts.push(`<div class="sub-controls">
        ${ui.color('颜色', 'style.outline.color', style.outline.color)}
        ${ui.range('宽度', 'style.outline.width', style.outline.width, 1, 80, 0.5, { unit: 'px' })}
      </div>`);
    }
    return parts.join('');
  }

  function warpControls(layer) {
    const active = CC.warp.isActive(layer.warp);
    const quad = active && !CC.warp.quadIsIdentity(layer.warp.quad);
    const mesh = active && !CC.warp.meshIsIdentity(layer.warp.mesh);
    return `
      <p class="muted-note">${active ? `已应用：${[quad ? '透视 / 扭曲' : '', mesh ? '网格变形' : ''].filter(Boolean).join(' + ')}` : '未变形。变形是非破坏的，随时可重置。'}</p>
      <div class="button-row">
        <button type="button" class="mini-button" data-insp-action="warp-tool">${ui.icon('transform')}<span>手动变形</span></button>
        <button type="button" class="mini-button" data-insp-action="warp-presets">${ui.icon('warp')}<span>预设</span></button>
        <button type="button" class="mini-button" data-insp-action="warp-reset" ${active ? '' : 'disabled'}>${ui.icon('reset')}<span>重置</span></button>
      </div>`;
  }

  const WEIGHTS = [[100, '100 极细'], [200, '200 特细'], [300, '300 细'], [400, '400 常规'], [500, '500 中等'], [600, '600 半粗'], [700, '700 粗'], [800, '800 特粗'], [900, '900 黑']];

  function contentControls(layer) {
    switch (layer.type) {
      case 'image': {
        const asset = state.assets.get(layer.assetId);
        return [
          ui.select('适应方式', 'fit', layer.fit, [['stretch', '拉伸填满（可非等比）'], ['cover', '铺满裁切'], ['contain', '完整显示']]),
          layer.fit === 'cover' ? ui.range('裁切缩放', 'cropZoom', layer.cropZoom, 1, 4, 0.01) : '',
          layer.fit === 'cover' ? ui.range('裁切 X', 'cropX', layer.cropX, -1, 1, 0.01) : '',
          layer.fit === 'cover' ? ui.range('裁切 Y', 'cropY', layer.cropY, -1, 1, 0.01) : '',
          ui.checkbox('平滑缩放（关闭后像素清晰）', 'smoothing', layer.smoothing !== false),
          `<p class="muted-note">${asset ? `原图 ${asset.width} × ${asset.height} · ${U.formatBytes(asset.blob?.size)}` : '图片资源缺失'}</p>`,
          `<div class="button-row">
            <button type="button" class="mini-button" data-insp-action="image-ratio">${ui.icon('reset')}<span>恢复原比例</span></button>
            <button type="button" class="mini-button" data-insp-action="image-replace">${ui.icon('image')}<span>替换图片</span></button>
          </div>`,
        ].join('');
      }
      case 'text':
        return [
          ui.text('内容', 'text', layer.text, { multiline: true, rows: 3 }),
          `<div class="preset-row">${M.TEXT_PRESETS.map((preset) => `<button type="button" class="chip" data-insp-action="text-preset" data-preset="${preset.id}">${escapeHtml(preset.name)}</button>`).join('')}</div>`,
          fontTrigger('fontFamily', layer.fontFamily),
          ui.select('字重', 'fontWeight', layer.fontWeight, WEIGHTS, { numeric: true }),
          ui.checkbox('斜体', 'italic', layer.italic),
          ui.range('字号', 'fontSize', layer.fontSize, 4, 1200, 1, { unit: 'px' }),
          ui.range('行距', 'lineHeight', layer.lineHeight, 0.5, 3, 0.01),
          ui.range('字距', 'tracking', layer.tracking, -40, 200, 0.5, { unit: 'px' }),
          `<div class="control-row compact"><label>对齐</label>${ui.segmented('align', layer.align, [['left', '左', 'alignLeft'], ['center', '中', 'alignCenter'], ['right', '右', 'alignRight']], { iconOnly: true })}</div>`,
          ui.checkbox('竖排', 'vertical', layer.vertical),
          !layer.vertical ? ui.range('弧形弯曲', 'arc', layer.arc || 0, -360, 360, 1, { unit: '°' }) : '',
          '<div class="sub-head">填充</div>',
          paintControls(layer),
          '<div class="sub-head">描边</div>',
          ui.color('描边色', 'stroke', layer.stroke),
          ui.range('描边宽度', 'strokeWidth', layer.strokeWidth, 0, 60, 0.5, { unit: 'px' }),
          ui.color('外描边色', 'stroke2', layer.stroke2),
          ui.range('外描边宽度', 'stroke2Width', layer.stroke2Width, 0, 60, 0.5, { unit: 'px' }),
          '<div class="sub-head">拉伸</div>',
          ui.range('横向拉伸', 'stretchX', layer.stretchX, 0.1, 5, 0.01),
          ui.range('纵向拉伸', 'stretchY', layer.stretchY, 0.1, 5, 0.01),
          `<button type="button" class="mini-button" data-insp-action="text-unstretch" ${layer.stretchX === 1 && layer.stretchY === 1 ? 'disabled' : ''}>${ui.icon('reset')}<span>取消拉伸</span></button>`,
        ].join('');
      case 'shape': {
        const type = layer.shapeType;
        return [
          ui.select('形状', 'shapeType', type, SHAPE_TYPES.filter(([value]) => value !== 'roundrect').map(([value, label]) => [value, label]).concat([['barcode', '条形码'], ['tape', '胶带']])),
          paintControls(layer),
          ['rect', 'line'].includes(type) ? ui.range(type === 'line' ? '圆头' : '圆角', 'radius', layer.radius, 0, Math.round(Math.min(layer.w, layer.h) / 2), 1, { unit: 'px' }) : '',
          ['polygon', 'star', 'burst', 'sparkle'].includes(type) ? ui.range(type === 'polygon' ? '边数' : '角数', 'sides', layer.sides, 3, 40, 1) : '',
          ['star', 'burst', 'sparkle', 'ring', 'cross'].includes(type) ? ui.range(type === 'ring' ? '内径比例' : type === 'cross' ? '粗细' : '内凹比例', 'innerRatio', layer.innerRatio, 0.02, 0.98, 0.01) : '',
          type !== 'line' ? ui.color('描边色', 'stroke', layer.stroke) : '',
          type !== 'line' ? ui.range('描边宽度', 'strokeWidth', layer.strokeWidth, 0, 60, 0.5, { unit: 'px' }) : '',
          type !== 'line' && type !== 'barcode' && type !== 'tape' ? ui.range('虚线', 'dash', layer.dash || 0, 0, 80, 1, { unit: 'px' }) : '',
        ].join('');
      }
      case 'window':
        return [
          ui.text('标题', 'title', layer.title),
          ui.text('正文', 'body', layer.body, { multiline: true }),
          ui.text('按钮', 'buttons', layer.buttons, { placeholder: 'OK|Cancel' }),
          ui.select('样式', 'windowStyle', layer.windowStyle, [['classic', '经典 Win'], ['xp', 'XP Luna'], ['mac', 'Mac OS 经典'], ['dark', '暗色现代'], ['acid', '酸性警报']]),
          ui.select('图标', 'icon', layer.icon, [['none', '无'], ['error', '错误'], ['warning', '警告'], ['info', '信息'], ['question', '询问']]),
          ui.color('标题栏色', 'accent', layer.accent),
          fontTrigger('bodyFont', layer.bodyFont),
          ui.checkbox('窗口阴影', 'windowShadow', layer.windowShadow !== false),
        ].join('');
      case 'vector': {
        const choices = CC.vectorAssets.CATS.map(([cat, name]) => ({ group: name, options: CC.vectorAssets.ASSETS.filter((asset) => asset.cat === cat).map((asset) => [asset.id, asset.name]) }));
        return [
          ui.select('素材', 'asset', layer.asset, choices),
          paintControls(layer, { mode: '主色填充' }),
          ui.color('副色', 'color2', layer.color2),
          ui.color('线条色', 'ink', layer.ink),
          ui.color('高光色', 'highlight', layer.highlight),
          ui.range('线条粗细', 'lineScale', layer.lineScale ?? 1, 0.2, 4, 0.05),
          ui.color('外轮廓色', 'stroke', layer.stroke),
          ui.range('外轮廓', 'strokeWidth', layer.strokeWidth, 0, 30, 0.5, { unit: 'px' }),
        ].join('');
      }
      case 'gen': {
        const def = CC.generators.get(layer.gen);
        if (!def) return '<p class="muted-note">未知生成器</p>';
        const hasSalt = def.params.some((param) => param.key === 'salt');
        return [
          `<p class="muted-note">${escapeHtml(def.name)}</p>`,
          hasSalt ? `<button type="button" class="mini-button" data-insp-action="gen-reroll">${ui.icon('remix')}<span>换一个随机图案</span></button>` : '',
          paramControls(def.params, layer.p, 'p.', layer),
        ].join('');
      }
      case 'shatter': {
        const sh = layer.shatter;
        const modeControls = sh.mode === 'spike'
          ? [ui.range('粗糙度', 'shatter.jagged', sh.jagged, 0, 100, 1), ui.range('尖刺数量', 'shatter.spikeCount', sh.spikeCount, 0, 100, 1), ui.range('尖刺长度', 'shatter.spikeLen', sh.spikeLen, 0, 100, 1), ui.range('色阶分档', 'shatter.bands', sh.bands, 0, 8, 1)]
          : [ui.range('爆炸强度', 'shatter.explode', sh.explode, 0, 200, 1), ui.range('翻滚', 'shatter.tumble', sh.tumble, 0, 100, 1), ui.range('旋涡', 'shatter.twist', sh.twist, 0, 100, 1), ui.range('随机漂移', 'shatter.scatter', sh.scatter, 0, 100, 1)];
        return [
          ui.select('形态', 'shatter.mode', sh.mode, [['burst', '爆裂碎片'], ['spike', '尖刺实体']]),
          ui.range('细分密度', 'shatter.density', sh.density, 1, 4, 1),
          ...modeControls,
          ui.range('高光锐度', 'shatter.gloss', sh.gloss, 0, 100, 1),
          ui.range('点缀比例', 'shatter.accentRatio', sh.accentRatio, 0, 100, 1),
          ui.range('飞刺数量', 'shatter.spikes', sh.spikes, 0, 100, 1),
          ui.color('主体色', 'shatter.body', sh.body),
          ui.color('高光色', 'shatter.highlight', sh.highlight),
          ui.color('点缀色', 'shatter.accent', sh.accent),
          ui.checkbox('线框', 'shatter.wireframe', sh.wireframe),
          ui.color('线框色', 'shatter.wireColor', sh.wireColor),
        ].join('');
      }
      case 'path':
        return [
          ui.select('笔触', 'brush.style', layer.brush.style, [['round', '圆头'], ['marker', '马克笔'], ['neon', '霓虹'], ['dashed', '虚线'], ['spray', '喷漆']]),
          ui.range('粗细', 'brush.size', layer.brush.size, 0.5, 200, 0.5, { unit: 'px' }),
          ui.color('颜色', 'brush.color', layer.brush.color),
          layer.brush.style === 'neon' ? ui.color('霓虹芯色', 'brush.core', layer.brush.core || '#ffffff') : '',
        ].join('');
      default:
        return '';
    }
  }

  function renderInspector() {
    const el = dom.inspector;
    if (!el) return;
    el.querySelectorAll('details[data-section]').forEach((details) => openSections.set(details.dataset.section, details.open));
    const scrollTop = el.scrollTop;
    const doc = state.doc;
    const layers = App.selectedLayers();
    if (!doc) {
      dom.inspectorBadge.textContent = '—';
      el.innerHTML = '<div class="empty-panel"><strong>没有打开工程</strong><p>点击左上角标志回到工程主页。</p></div>';
      return;
    }
    if (!layers.length) {
      dom.inspectorBadge.textContent = '画布';
      el.innerHTML = [
        sec('doc', '画布', [
          ui.text('工程名', 'name', doc.name, { scope: 'doc' }),
          `<div class="control-row compact"><label>尺寸</label><div class="size-display"><span>${doc.width} × ${doc.height} px · ${M.ratioLabel(doc.width, doc.height)}</span><button type="button" class="mini-button" data-insp-action="canvas-size">修改…</button></div></div>`,
          ui.color('背景色', 'bg', doc.bg, { scope: 'doc' }),
          ui.checkbox('透明背景', 'transparent', doc.transparent, { scope: 'doc' }),
          `<div class="control-row compact"><label>随机种子</label><div class="size-display"><span>${doc.seed}</span><button type="button" class="mini-button" data-insp-action="reseed">${ui.icon('remix')}<span>换种子</span></button></div></div>`,
        ].join('')),
        sec('doc-export', '导出', `
          <p class="muted-note">PNG / JPG / WEBP，0.5×–4× 倍率；也可只导出选中图层。</p>
          <div class="button-row"><button type="button" class="mini-button" data-insp-action="export">${ui.icon('export')}<span>导出图片…</span></button><button type="button" class="mini-button" data-insp-action="save-file">${ui.icon('save')}<span>另存工程文件…</span></button></div>`),
        `<div class="empty-panel compact"><p>点击画布中的对象，或在左侧图层列表中选择。<br>Ctrl+A 全选，框选可多选。</p></div>`,
      ].join('');
    } else if (layers.length > 1) {
      dom.inspectorBadge.textContent = `${layers.length} 个图层`;
      const opacity = layers[layers.length - 1].opacity;
      el.innerHTML = [
        sec('multi', `已选 ${layers.length} 个图层`, `
          <div class="button-row icons">
            ${['alignLeft:left', 'alignCenter:hcenter', 'alignRight:right', 'alignTop:top', 'alignMiddle:vcenter', 'alignBottom:bottom'].map((pair) => {
              const [iconName, mode] = pair.split(':');
              return `<button type="button" class="mini-button icon-action" data-insp-action="align" data-mode="${mode}">${ui.icon(iconName)}</button>`;
            }).join('')}
          </div>
          <div class="button-row icons">
            <button type="button" class="mini-button icon-action" data-insp-action="distribute" data-mode="x" title="水平分布">${ui.icon('distH')}</button>
            <button type="button" class="mini-button icon-action" data-insp-action="distribute" data-mode="y" title="垂直分布">${ui.icon('distV')}</button>
            <button type="button" class="mini-button icon-action" data-insp-action="flip" data-mode="x" title="水平翻转">${ui.icon('flipH')}</button>
            <button type="button" class="mini-button icon-action" data-insp-action="flip" data-mode="y" title="垂直翻转">${ui.icon('flipV')}</button>
          </div>
          ${ui.range('不透明度', 'opacity', opacity, 0, 1, 0.01, { scope: 'multi' })}
          ${ui.select('混合模式', 'blend', layers[layers.length - 1].blend, BLEND_MODES, { scope: 'multi' })}`),
        actionBar(),
      ].join('');
    } else {
      const layer = layers[0];
      dom.inspectorBadge.textContent = M.TYPE_NAMES[layer.type] || layer.type;
      const fxCount = (layer.effects || []).length;
      el.innerHTML = [
        sec('layer', '图层', [
          ui.text('名称', 'name', layer.name),
          `<div class="toggle-row">${ui.checkbox('可见', 'visible', layer.visible)}${ui.checkbox('锁定', 'locked', layer.locked)}</div>`,
        ].join('')),
        sec('transform', '变换', transformControls(layer)),
        sec('appearance', '外观', [
          ui.range('不透明度', 'opacity', layer.opacity, 0, 1, 0.01),
          ui.select('混合模式', 'blend', layer.blend, BLEND_MODES),
          ui.checkbox('剪切蒙版（裁切到下方图层）', 'clip', layer.clip),
        ].join('')),
        sec('content', '内容', contentControls(layer)),
        sec('effects', '效果', effectStack(layer), { badge: fxCount ? String(fxCount) : '' }),
        sec('style', '图层样式', styleControls(layer), { open: false }),
        sec('warp', '变形', warpControls(layer), { open: false }),
        sec('repeat', '散乱重复', repeaterControls(layer), { open: false, badge: layer.repeater.count > 1 ? `×${layer.repeater.count}` : '' }),
        actionBar(layer),
      ].join('');
    }
    el.querySelectorAll('input[type="range"]').forEach(ui.syncRangeFill);
    ui.enhanceSelects(el);
    el.scrollTop = scrollTop;
  }

  function transformControls(layer) {
    return `
      <div class="num-grid">
        ${ui.numberField('X', 'x', layer.x, { precision: 1 })}
        ${ui.numberField('Y', 'y', layer.y, { precision: 1 })}
        ${ui.numberField('W', 'w', layer.w, { precision: 1, min: 1 })}
        ${ui.numberField('H', 'h', layer.h, { precision: 1, min: 1 })}
      </div>
      ${ui.range('旋转', 'rotation', Number((layer.rotation || 0).toFixed(1)), -180, 180, 0.5, { unit: '°' })}
      <div class="button-row icons">
        <button type="button" class="mini-button icon-action${layer.flipX ? ' on' : ''}" data-insp-action="flip" data-mode="x" title="水平翻转">${ui.icon('flipH')}</button>
        <button type="button" class="mini-button icon-action${layer.flipY ? ' on' : ''}" data-insp-action="flip" data-mode="y" title="垂直翻转">${ui.icon('flipV')}</button>
        <button type="button" class="mini-button icon-action" data-insp-action="align" data-mode="hcenter" title="水平居中到画布">${ui.icon('alignCenter')}</button>
        <button type="button" class="mini-button icon-action" data-insp-action="align" data-mode="vcenter" title="垂直居中到画布">${ui.icon('alignMiddle')}</button>
        <button type="button" class="mini-button icon-action" data-insp-action="fit-canvas" title="铺满画布">${ui.icon('rect')}</button>
      </div>`;
  }

  function renderTransformFields() {
    const layer = state.selection.length === 1 ? App.primaryLayer() : null;
    if (!layer || !dom.inspector) return;
    ['x', 'y', 'w', 'h', 'rotation'].forEach((key) => {
      dom.inspector.querySelectorAll(`[data-path="${key}"][data-scope="layer"]`).forEach((input) => {
        if (document.activeElement === input) return;
        input.value = key === 'rotation' ? Number(layer.rotation.toFixed(1)) : Number(layer[key].toFixed(1));
        if (input.type === 'range') ui.syncRangeFill(input);
      });
    });
  }

  function repeaterControls(layer) {
    const r = layer.repeater;
    return [
      '<p class="muted-note">把同一图层按步进 / 抖动复制成阵列，适合纸屑、回声文字、层叠窗口。</p>',
      ui.range('数量', 'repeater.count', r.count, 1, 120, 1),
      ui.range('X 步进', 'repeater.dx', r.dx, -400, 400, 1),
      ui.range('Y 步进', 'repeater.dy', r.dy, -400, 400, 1),
      ui.range('缩放步进', 'repeater.scaleStep', r.scaleStep, 0.7, 1.3, 0.005),
      ui.range('旋转步进', 'repeater.rotationStep', r.rotationStep, -45, 45, 0.5),
      ui.range('渐隐步进', 'repeater.opacityStep', r.opacityStep, 0.4, 1, 0.01),
      ui.range('抖动 X', 'repeater.jitterX', r.jitterX, 0, state.doc.width, 1),
      ui.range('抖动 Y', 'repeater.jitterY', r.jitterY, 0, state.doc.height, 1),
      ui.range('抖动旋转', 'repeater.jitterRotation', r.jitterRotation, 0, 180, 1),
    ].join('');
  }

  function actionBar(layer) {
    return `
      <div class="inspector-actions">
        <button type="button" class="mini-button icon-action" data-insp-action="duplicate" title="复制图层 (Ctrl+D)">${ui.icon('duplicate')}</button>
        <button type="button" class="mini-button icon-action" data-insp-action="front" title="置顶 (Ctrl+Shift+])">${ui.icon('front')}</button>
        <button type="button" class="mini-button icon-action" data-insp-action="back" title="置底 (Ctrl+Shift+[)">${ui.icon('back')}</button>
        ${layer ? `<button type="button" class="mini-button icon-action" data-insp-action="rasterize" title="栅格化（把效果 / 变形 / 样式合并为图像）">${ui.icon('bake')}</button>` : ''}
        <button type="button" class="mini-button icon-action danger" data-insp-action="delete" title="删除 (Delete)">${ui.icon('trash')}</button>
      </div>`;
  }

  const TEXT_LAYOUT_KEYS = new Set(['text', 'fontFamily', 'fontWeight', 'italic', 'fontSize', 'lineHeight', 'tracking', 'vertical', 'arc', 'strokeWidth', 'stroke2Width', 'stretchX', 'stretchY', 'align']);

  function readValue(el) {
    if (el.dataset.kind === 'boolean') return el.checked;
    if (el.dataset.kind === 'number') {
      const value = Number(el.value);
      return Number.isFinite(value) ? value : null;
    }
    if (el.dataset.kind === 'color') {
      const value = el.value.trim();
      return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : null;
    }
    return el.value;
  }

  function applyControl(el) {
    const path = el.dataset.path;
    const scope = el.dataset.scope || 'layer';
    const value = readValue(el);
    if (value === null || !state.doc) return;
    if (scope === 'doc') {
      if (path === 'name') {
        state.doc.name = String(value).slice(0, 120) || '未命名工程';
        renderTopbar();
      } else U.setByPath(state.doc, path, value);
      App.requestRender();
      App.markDirty();
      return;
    }
    if (scope === 'multi') {
      App.selectedLayers().forEach((layer) => U.setByPath(layer, path, value));
      App.requestRender();
      return;
    }
    const layer = App.primaryLayer();
    if (!layer) return;
    if (layer.type === 'text' && TEXT_LAYOUT_KEYS.has(path)) {
      U.setByPath(layer, path, value);
      App.syncTextBox(layer, { anchor: path !== 'stretchX' && path !== 'stretchY' });
      if (path === 'fontFamily') CC.fonts.ensureLoaded(value, layer.fontWeight, layer.italic).then(() => App.refreshFonts());
    } else if (layer.type === 'text' && (path === 'w' || path === 'h')) {
      U.setByPath(layer, path, Math.max(1, value));
      App.stretchFromBox(layer);
    } else if (path === 'w' || path === 'h') {
      U.setByPath(layer, path, Math.max(1, value));
    } else U.setByPath(layer, path, value);
    syncPeers(el, path, scope, value);
    if (['name', 'visible', 'locked', 'clip', 'repeater.count'].includes(path) || path.startsWith('effects.')) renderLayers();
    App.requestRender();
    renderTransformFields();
  }

  function syncPeers(el, path, scope, value) {
    dom.inspector.querySelectorAll('[data-path]').forEach((peer) => {
      if (peer === el || peer.dataset.path !== path || (peer.dataset.scope || 'layer') !== scope) return;
      if (peer.dataset.kind === 'boolean') peer.checked = !!value;
      else peer.value = value;
      if (peer.matches('input[type="range"]')) ui.syncRangeFill(peer);
    });
  }

  let controlBefore = null;
  let controlTimer = null;

  function beginControl() {
    if (!controlBefore && state.doc) controlBefore = App.snapshot();
  }

  function endControl(label = '修改属性') {
    if (!controlBefore) return;
    const before = controlBefore;
    controlBefore = null;
    state.interacting = null;
    App.commit(label, before);
  }

  function controlLabel(el) {
    const path = el.dataset.path || '';
    if (path.startsWith('effects.')) return '调整效果';
    if (path.startsWith('style.')) return '调整图层样式';
    if (path.startsWith('repeater.')) return '调整重复';
    if (el.dataset.scope === 'doc') return '修改画布';
    const label = el.closest('.control-row, .checkbox-row, .num-field, .control-group-tight')?.querySelector('label, span')?.textContent?.trim();
    return label ? `修改${label}` : '修改属性';
  }

  function setupInspector() {
    const el = dom.inspector;
    el.addEventListener('toggle', (event) => {
      const details = event.target;
      if (details.dataset?.section) openSections.set(details.dataset.section, details.open);
    }, true);
    el.addEventListener('pointerdown', (event) => {
      if (event.target.matches('input, select, textarea')) beginControl();
      if (event.target.matches('input[type="range"]')) state.interacting = 'slider';
    });
    el.addEventListener('focusin', (event) => {
      if (event.target.matches('input, select, textarea')) beginControl();
    });
    el.addEventListener('input', (event) => {
      if (!event.target.matches('[data-path]')) return;
      beginControl();
      if (event.target.matches('input[type="range"]')) ui.syncRangeFill(event.target);
      if (event.target.type === 'color') {
        const textPeer = event.target.parentElement.querySelector('.text-input');
        if (textPeer) textPeer.value = event.target.value;
      }
      applyControl(event.target);
      clearTimeout(controlTimer);
    });
    el.addEventListener('change', (event) => {
      if (event.target.matches('[data-path]')) {
        applyControl(event.target);
        endControl(controlLabel(event.target));
        const structural = event.target.tagName === 'SELECT' || event.target.type === 'checkbox' || /^(fillMode|shapeType|fit|windowStyle|asset)$/.test(event.target.dataset.path) || /\.p\.(mode|palette|ramp|shape|kind|style|source)$/.test(event.target.dataset.path) || event.target.dataset.path.startsWith('style.');
        if (structural) renderInspector();
        renderLayers();
        App.requestRender();
      }
    });
    el.addEventListener('focusout', (event) => {
      if (!event.relatedTarget || !el.contains(event.relatedTarget)) {
        controlTimer = setTimeout(() => endControl(controlLabel(event.target)), 0);
      }
    });
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.matches('input.text-input, input.value-input')) event.target.blur();
      if (event.key === 'Escape') event.target.blur?.();
      event.stopPropagation();
    });
    el.addEventListener('click', (event) => {
      const seg = event.target.closest('[data-seg-path]');
      if (seg) {
        const layer = App.primaryLayer();
        if (!layer) return;
        App.change('修改属性', () => {
          U.setByPath(layer, seg.dataset.segPath, seg.dataset.segValue);
          if (layer.type === 'text') App.syncTextBox(layer, { anchor: true });
        });
        return;
      }
      const font = event.target.closest('[data-font-trigger]');
      if (font && font.dataset.fontTrigger !== 'opts') {
        const layer = App.primaryLayer();
        if (!layer) return;
        const path = font.dataset.fontTrigger;
        openFontPickerFor(font, U.getByPath(layer, path), (family) => {
          App.change('更换字体', () => {
            U.setByPath(layer, path, family);
            if (layer.type === 'text') App.syncTextBox(layer, { anchor: true });
          });
          rememberFont(family);
          CC.fonts.ensureLoaded(family, layer.fontWeight || 400, layer.italic).then(() => App.refreshFonts());
        });
        return;
      }
      const fx = event.target.closest('[data-fx-action]');
      if (fx) {
        handleFxAction(fx);
        return;
      }
      const action = event.target.closest('[data-insp-action]');
      if (action) handleInspectorAction(action);
    });
  }

  function handleFxAction(button) {
    const layer = App.primaryLayer();
    if (!layer) return;
    const index = Number(button.dataset.fxIndex);
    const effect = layer.effects[index];
    if (!effect) return;
    const action = button.dataset.fxAction;
    if (action === 'expand') {
      if (expandedFx.has(effect.id)) expandedFx.delete(effect.id);
      else expandedFx.add(effect.id);
      renderInspector();
      return;
    }
    const def = CC.effects.get(effect.type);
    App.change({ up: '上移效果', down: '下移效果', remove: '删除效果', duplicate: '复制效果', preset: '套用效果预设', reset: '重置效果参数' }[action] || '修改效果', () => {
      if (action === 'up' && index > 0) [layer.effects[index - 1], layer.effects[index]] = [layer.effects[index], layer.effects[index - 1]];
      if (action === 'down' && index < layer.effects.length - 1) [layer.effects[index + 1], layer.effects[index]] = [layer.effects[index], layer.effects[index + 1]];
      if (action === 'remove') layer.effects.splice(index, 1);
      if (action === 'duplicate') {
        const copy = { ...U.deepCopy(effect), id: U.uid('FX') };
        layer.effects.splice(index + 1, 0, copy);
        expandedFx.add(copy.id);
      }
      if (action === 'preset') Object.assign(effect.p, def.presets[Number(button.dataset.preset)].values);
      if (action === 'reset') effect.p = CC.effects.defaults(effect.type);
    });
  }

  function effectMenuItems(onPick) {
    return CC.effects.CATEGORIES.map(([cat, name]) => {
      const defs = CC.effects.list().filter((def) => def.cat === cat);
      if (!defs.length) return null;
      return { label: name, submenu: defs.map((def) => ({ label: def.name, action: () => onPick(def.type) })) };
    }).filter(Boolean);
  }

  function addEffectToSelection(type) {
    const layers = App.selectedLayers();
    if (!layers.length) return;
    App.change(`添加效果：${CC.effects.get(type).name}`, () => {
      layers.forEach((layer) => {
        const effect = CC.effects.create(type);
        layer.effects.push(effect);
        expandedFx.add(effect.id);
      });
    });
    openSections.set('effects', true);
    renderInspector();
  }

  async function handleInspectorAction(button) {
    const action = button.dataset.inspAction;
    const layer = App.primaryLayer();
    switch (action) {
      case 'add-effect': {
        const rect = button.getBoundingClientRect();
        ui.openMenuAt({ left: rect.left, top: rect.bottom + 4, bottom: rect.top }, effectMenuItems(addEffectToSelection), { minWidth: rect.width });
        break;
      }
      case 'duplicate':
        App.duplicateSelection();
        break;
      case 'delete':
        App.deleteSelection();
        break;
      case 'front':
        App.moveLayers('front');
        break;
      case 'back':
        App.moveLayers('back');
        break;
      case 'rasterize':
        App.rasterizeSelection();
        break;
      case 'flip':
        App.flipSelection(button.dataset.mode);
        break;
      case 'align':
        App.alignSelection(button.dataset.mode);
        break;
      case 'distribute':
        App.distributeSelection(button.dataset.mode);
        break;
      case 'fit-canvas':
        if (!layer) return;
        App.change('铺满画布', () => {
          layer.x = state.doc.width / 2;
          layer.y = state.doc.height / 2;
          layer.rotation = 0;
          if (layer.type === 'text') {
            const nat = CC.text.naturalSize(layer);
            layer.stretchX = state.doc.width / nat.w;
            layer.stretchY = state.doc.height / nat.h;
            App.syncTextBox(layer);
          } else {
            layer.w = state.doc.width;
            layer.h = state.doc.height;
          }
        });
        break;
      case 'warp-tool':
        App.setTool('transform');
        break;
      case 'warp-presets': {
        const rect = button.getBoundingClientRect();
        ui.openMenuAt({ left: rect.left, top: rect.bottom + 4, bottom: rect.top }, warpPresetItems());
        break;
      }
      case 'warp-reset':
        App.resetWarp();
        break;
      case 'text-preset': {
        const preset = M.TEXT_PRESETS.find((item) => item.id === button.dataset.preset);
        if (!preset || !layer) return;
        App.change(`文字样式：${preset.name}`, () => {
          Object.assign(layer, preset.values);
          App.syncTextBox(layer, { anchor: true });
        });
        CC.fonts.ensureLoaded(layer.fontFamily, layer.fontWeight, layer.italic).then(() => App.refreshFonts());
        break;
      }
      case 'text-unstretch':
        App.change('取消拉伸', () => {
          layer.stretchX = 1;
          layer.stretchY = 1;
          App.syncTextBox(layer);
        });
        break;
      case 'image-ratio': {
        const asset = state.assets.get(layer?.assetId);
        if (!asset) return;
        App.change('恢复原比例', () => {
          layer.h = layer.w * (asset.height / asset.width);
        });
        break;
      }
      case 'image-replace':
        App.chooseImages({ replace: layer.id });
        break;
      case 'gen-reroll':
        App.change('换随机图案', () => {
          layer.p.salt = Math.floor(Math.random() * 1000);
        });
        break;
      case 'canvas-size':
        App.openCanvasSizeDialog?.();
        break;
      case 'reseed':
        App.reseed();
        break;
      case 'export':
        App.openExportDialog?.();
        break;
      case 'save-file':
        App.saveAsFile?.();
        break;
      default:
        break;
    }
  }

  function focusInspectorContent() {
    openSections.set('content', true);
    renderInspector();
    dom.inspector.querySelector('[data-section="content"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /* ---------------- fonts helpers ---------------- */

  function rememberFont(family) {
    state.recentFonts = [family, ...state.recentFonts.filter((item) => item !== family)].slice(0, 8);
    CC.storage.setSetting('recentFonts', state.recentFonts).catch(() => {});
  }

  function openFontPickerFor(anchor, current, onPick) {
    ui.openFontPicker(anchor, current, (family) => {
      rememberFont(family);
      onPick(family);
    }, {
      recent: state.recentFonts,
      onImport: () => App.chooseFonts(),
      onLocalFonts: (families) => CC.storage.setSetting('localFontFamilies', families).catch(() => {}),
    });
  }

  /* ---------------- orchestration ---------------- */

  function renderPanels() {
    renderTopbar();
    renderStatus();
    renderToolrail();
    renderOptionsBar();
    renderLayers();
    renderResources();
    renderHistory();
    renderInspector();
    document.body.classList.toggle('no-doc', !state.doc);
  }

  function setupPanels() {
    setupTabs();
    setupLayersPanel();
    setupResourcesPanel();
    setupHistoryPanel();
    setupOptionsBar();
    setupInspector();
    setupFlyout();
    dom.undoButton.addEventListener('click', () => App.undo());
    dom.redoButton.addEventListener('click', () => App.redo());
    dom.seedButton.addEventListener('click', () => App.reseed());
    dom.docName.addEventListener('change', () => {
      if (!state.doc) return;
      state.doc.name = dom.docName.value.trim().slice(0, 120) || '未命名工程';
      dom.docName.value = state.doc.name;
      App.markDirty();
      renderInspector();
    });
    dom.docName.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === 'Escape') dom.docName.blur();
    });
  }

  Object.assign(App, {
    BLEND_MODES,
    SHAPE_TYPES,
    renderSaveStatus,
    updateUndoButtons,
    renderTopbar,
    renderZoom,
    renderStatus,
    renderCursorPos,
    renderToolrail,
    renderOptionsBar,
    renderLayers,
    renderResources,
    renderHistory,
    renderInspector,
    renderTransformFields,
    renderPanels,
    renderFlyout,
    toggleFlyout,
    closeFlyout,
    setupPanels,
    effectMenuItems,
    addEffectToSelection,
    warpPresetItems,
    focusInspectorContent,
    openFontPickerFor,
    generatorCatalog,
    elementsCatalog,
  });
})();
