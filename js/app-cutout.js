/* CHAOS.COLLAGE — smart cutout dialog (extends CC.App)
   Runs CC.cutout on an image layer, previews the result with edge controls and
   swaps the layer to the cut-out image. The original stays in the project
   (layer.cutout.src), so the layer can be restored later. */
(() => {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const ui = CC.ui;
  const App = CC.App;
  const { state } = App;
  const { escapeHtml } = U;

  const BACKDROPS = [['checker', '棋盘'], ['dark', '黑'], ['light', '白'], ['pink', '品红']];
  const prefs = { backdrop: 'checker', trim: true, keep: false };

  const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;

  function cutoutTarget(layer = App.primaryLayer()) {
    if (!layer || layer.type !== 'image') return null;
    const asset = state.assets.get(layer.assetId);
    return asset?.ready ? { layer, asset } : null;
  }

  /* the transparent margin can only be cropped when the image fills the box 1:1 */
  function canTrim(layer) {
    return (layer.fit || 'stretch') === 'stretch' && !CC.warp.isActive(layer.warp);
  }

  /* shrink / move the layer box so the kept part stays where it was;
     rect is the kept area as fractions of the image */
  function fitBoxToRect(layer, rect) {
    const center = App.localToDoc(layer, (rect.x + rect.w / 2 - 0.5) * layer.w, (rect.y + rect.h / 2 - 0.5) * layer.h);
    layer.x = center.x;
    layer.y = center.y;
    layer.w *= rect.w;
    layer.h *= rect.h;
  }

  function restoreBox(layer, rect) {
    const w = layer.w / rect.w;
    const h = layer.h / rect.h;
    const center = App.localToDoc(layer, -(rect.x + rect.w / 2 - 0.5) * w, -(rect.y + rect.h / 2 - 0.5) * h);
    layer.x = center.x;
    layer.y = center.y;
    layer.w = w;
    layer.h = h;
  }

  function canRestoreCutout(layer = App.primaryLayer()) {
    return layer?.type === 'image' && !!layer.cutout?.src && state.assets.has(layer.cutout.src);
  }

  function restoreCutout(layer = App.primaryLayer()) {
    if (!canRestoreCutout(layer)) return;
    App.change('恢复原图', () => {
      const rect = layer.cutout.rect;
      if (rect && canTrim(layer)) restoreBox(layer, rect);
      layer.assetId = layer.cutout.src;
      layer.cutout = null;
    });
    ui.toast('已恢复抠图前的原图');
  }

  function progressText(progress) {
    if (progress.stage === 'download') return `正在下载抠图组件 ${mb(progress.loaded)} / ${mb(progress.total)}`;
    if (progress.stage === 'init') return '正在启动抠图引擎…';
    if (progress.stage === 'infer') return progress.backend === 'webgpu' ? '正在识别主体（显卡加速）…' : '正在识别主体（处理器运算，约需十几秒）…';
    return '请稍候…';
  }

  function smartCutout(layerArg) {
    const target = cutoutTarget(layerArg);
    if (!target) {
      ui.toast(App.primaryLayer()?.type === 'image' ? '图片还没有载入完成' : '请先选中一个图片图层（其他图层可先栅格化）');
      return;
    }
    if (!CC.cutout.isSupported()) {
      ui.toast('当前浏览器不支持智能抠图，请使用新版 Chrome 或 Edge', 'error');
      return;
    }
    const { layer, asset } = target;
    const trimOk = canTrim(layer);
    const opts = { shift: 0, feather: 0 };
    const abort = new AbortController();
    let seg = null;
    let busy = false;
    let showOriginal = false;
    let frameRequest = 0;

    /* preview at screen size; the full image is only composed on apply */
    const previewScale = Math.min(1, 1120 / Math.max(asset.width, asset.height));
    const pw = Math.max(1, Math.round(asset.width * previewScale));
    const ph = Math.max(1, Math.round(asset.height * previewScale));

    const body = document.createElement('div');
    body.className = 'cutout';
    body.innerHTML = `
      <div class="cutout-stage" data-backdrop="${prefs.backdrop}">
        <canvas data-cut-canvas width="${pw}" height="${ph}"></canvas>
        <div class="cutout-overlay" data-cut-overlay>
          <p data-cut-msg>正在检查抠图组件…</p>
          <div class="cutout-bar" data-cut-bar hidden><i></i></div>
          <button type="button" class="ui-button primary" data-cut-start hidden></button>
        </div>
      </div>
      <div class="cutout-side">
        <label class="field"><span data-cut-label="shift">边缘位置 0</span><input type="range" min="-100" max="100" step="1" value="0" data-cut="shift" title="向左收缩（去掉残留的背景边），向右扩展"></label>
        <label class="field"><span data-cut-label="feather">边缘羽化 0</span><input type="range" min="0" max="100" step="1" value="0" data-cut="feather"></label>
        <label class="checkbox-row" title="${trimOk ? '让图层的边框贴合主体' : '「铺满裁切 / 完整显示」或已变形的图层保持原来的边框'}"><span>裁掉四周的透明区域</span><input type="checkbox" data-cut="trim" ${trimOk && prefs.trim ? 'checked' : ''} ${trimOk ? '' : 'disabled'}></label>
        <label class="checkbox-row"><span>保留原图层（结果放到新图层）</span><input type="checkbox" data-cut="keep" ${prefs.keep ? 'checked' : ''}></label>
        <div class="field"><span>预览背景</span>${ui.segmented('backdrop', prefs.backdrop, BACKDROPS, { scope: 'cutout' })}</div>
        <button type="button" class="mini-button wide" data-cut-compare>${ui.icon('eye')}<span>按住查看原图</span></button>
        <p class="muted-note" data-cut-info>图片只在这台电脑上处理，不会上传。</p>
        <p class="muted-note" data-cut-cache></p>
      </div>`;

    const canvas = body.querySelector('[data-cut-canvas]');
    const ctx = canvas.getContext('2d');
    const overlay = body.querySelector('[data-cut-overlay]');
    const msg = body.querySelector('[data-cut-msg]');
    const bar = body.querySelector('[data-cut-bar]');
    const startButton = body.querySelector('[data-cut-start]');
    const info = body.querySelector('[data-cut-info]');
    const cacheNote = body.querySelector('[data-cut-cache]');
    const controls = [...body.querySelectorAll('[data-cut="shift"], [data-cut="feather"], [data-cut-compare]')];
    let applyButton = null;

    const drawOriginal = () => {
      ctx.clearRect(0, 0, pw, ph);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(asset.img, 0, 0, pw, ph);
    };

    const drawPreview = () => {
      frameRequest = 0;
      if (!seg || showOriginal) {
        drawOriginal();
        return;
      }
      const result = CC.cutout.compose(asset.img, pw, ph, seg, opts);
      ctx.clearRect(0, 0, pw, ph);
      ctx.drawImage(result.canvas, 0, 0);
      U.releaseCanvas(result.canvas);
      if (applyButton) applyButton.disabled = busy || !result.bbox;
      if (!result.bbox) info.textContent = '没有识别到主体，可以调整「边缘位置」或换一张图片。';
    };

    const schedulePreview = () => {
      if (!frameRequest) frameRequest = requestAnimationFrame(drawPreview);
    };

    const setOverlay = (text, { progress = null, action = '' } = {}) => {
      overlay.hidden = false;
      msg.textContent = text;
      bar.hidden = progress == null;
      if (progress != null) bar.firstElementChild.style.width = `${Math.round(U.clamp(progress, 0, 1) * 100)}%`;
      startButton.hidden = !action;
      startButton.textContent = action;
    };

    const setReady = (ready) => {
      controls.forEach((el) => {
        el.disabled = !ready;
      });
      if (applyButton) applyButton.disabled = !ready;
    };

    const refreshCacheNote = async () => {
      const status = await CC.cutout.status().catch(() => null);
      if (!status || !body.isConnected) return;
      const have = status.total - status.missing;
      cacheNote.innerHTML = have > 0
        ? `模型 ${escapeHtml(status.model.name)}（${escapeHtml(status.model.license)}）已保存在本机，占用 ${mb(have)}。<button type="button" class="link-button" data-cut-clear>清除</button>`
        : '';
    };

    const run = async () => {
      setReady(false);
      setOverlay('正在准备…');
      try {
        seg = await CC.cutout.segment(asset.img, {
          signal: abort.signal,
          onProgress: (progress) => setOverlay(progressText(progress), { progress: progress.stage === 'download' ? progress.loaded / progress.total : null }),
        });
      } catch (error) {
        if (error.name === 'AbortError' || abort.signal.aborted) return;
        console.warn('smart cutout failed', error);
        setOverlay(error.message || '抠图失败', { action: '重试' });
        return;
      }
      if (abort.signal.aborted) return;
      overlay.hidden = true;
      const speed = `${seg.backend === 'webgpu' ? '显卡加速' : '处理器运算'} · 用时 ${(seg.ms / 1000).toFixed(1)} 秒 · 图片只在这台电脑上处理，不会上传。`;
      if (seg.backend === 'webgpu') info.innerHTML = `${escapeHtml(speed)}结果不对？<button type="button" class="link-button" data-cut-engine="cpu">改用处理器重算</button>`;
      else if (CC.cutout.prefersCpu() && navigator.gpu) info.innerHTML = `${escapeHtml(speed)}<button type="button" class="link-button" data-cut-engine="gpu">恢复显卡加速</button>`;
      else info.textContent = speed;
      setReady(true);
      drawPreview();
      refreshCacheNote();
    };

    const begin = async () => {
      let status;
      try {
        status = await CC.cutout.status();
      } catch (error) {
        status = null;
      }
      if (abort.signal.aborted) return;
      if (status?.source === 'off') {
        setOverlay('这台服务器没有开启智能抠图。');
        return;
      }
      if (status && !status.cached) {
        const where = status.source === 'server' ? '从本站服务器' : '从公共 CDN ';
        setOverlay(`首次使用需要${where}下载抠图组件（约 ${mb(status.missing)}，只需一次）。之后离线也能使用，图片始终只在这台电脑上处理。`, { action: '下载并开始' });
        return;
      }
      run();
    };

    const apply = async () => {
      if (!seg || busy) return false;
      const current = App.layerById(layer.id);
      if (!current || current.type !== 'image' || current.assetId !== asset.id) {
        ui.toast('图层已被修改，请重新打开智能抠图', 'error');
        return true;
      }
      busy = true;
      setReady(false);
      setOverlay('正在生成抠图…');
      await new Promise((resolve) => setTimeout(resolve, 30));
      try {
        const trim = trimOk && body.querySelector('[data-cut="trim"]').checked;
        const keep = body.querySelector('[data-cut="keep"]').checked;
        prefs.keep = keep;
        if (trimOk) prefs.trim = trim;
        const result = CC.cutout.compose(asset.img, asset.width, asset.height, seg, opts);
        if (!result.bbox) throw new Error('没有识别到主体');
        let output = result.canvas;
        let rect = null;
        if (trim) {
          const box = result.bbox;
          output = U.makeCanvas(box.w, box.h);
          output.getContext('2d').drawImage(result.canvas, -box.x, -box.y);
          U.releaseCanvas(result.canvas);
          rect = { x: box.x / asset.width, y: box.y / asset.height, w: box.w / asset.width, h: box.h / asset.height };
        }
        /* photos stay compact as WebP (lossless alpha); graphics stay PNG */
        const lossy = /jpe?g|webp/i.test(asset.mime || '');
        const blob = await U.canvasToBlob(output, lossy ? 'image/webp' : 'image/png', lossy ? 0.95 : undefined);
        U.releaseCanvas(output);
        const cut = await App.importImageBlob(blob, `${asset.name || '图片'} 抠图`);
        App.change('智能抠图', () => {
          let targetLayer = App.layerById(layer.id);
          if (keep) {
            const copy = App.cloneLayer(targetLayer, 0);
            copy.name = `${targetLayer.name} 抠图`;
            state.doc.layers.splice(state.doc.layers.indexOf(targetLayer) + 1, 0, copy);
            targetLayer = copy;
            state.selection = [copy.id];
          }
          const previous = targetLayer.cutout;
          const base = previous?.rect || { x: 0, y: 0, w: 1, h: 1 };
          const area = rect || { x: 0, y: 0, w: 1, h: 1 };
          if (rect) fitBoxToRect(targetLayer, rect);
          targetLayer.assetId = cut.id;
          targetLayer.cutout = {
            src: previous?.src || asset.id,
            rect: { x: base.x + area.x * base.w, y: base.y + area.y * base.h, w: area.w * base.w, h: area.h * base.h },
          };
        });
        ui.toast(keep ? '已抠图到新图层' : '已抠图，可在属性面板「恢复原图」');
        return true;
      } catch (error) {
        console.warn('smart cutout apply failed', error);
        busy = false;
        overlay.hidden = true;
        setReady(true);
        ui.toast(error.message || '抠图失败', 'error');
        return false;
      }
    };

    body.addEventListener('input', (event) => {
      const key = event.target.dataset.cut;
      if (key !== 'shift' && key !== 'feather') return;
      const value = Number(event.target.value);
      opts[key] = value / 100;
      body.querySelector(`[data-cut-label="${key}"]`).textContent = key === 'shift' ? `边缘位置 ${value > 0 ? '+' : ''}${value}` : `边缘羽化 ${value}`;
      ui.syncRangeFill(event.target);
      schedulePreview();
    });
    body.addEventListener('click', async (event) => {
      const seg2 = event.target.closest('[data-seg-path="backdrop"]');
      if (seg2) {
        prefs.backdrop = seg2.dataset.segValue;
        body.querySelector('.cutout-stage').dataset.backdrop = prefs.backdrop;
        body.querySelectorAll('[data-seg-path="backdrop"]').forEach((el) => el.classList.toggle('active', el === seg2));
        return;
      }
      if (event.target.closest('[data-cut-start]')) {
        run();
        return;
      }
      const engineChoice = event.target.closest('[data-cut-engine]');
      if (engineChoice && !busy) {
        CC.cutout.setPrefersCpu(engineChoice.dataset.cutEngine === 'cpu');
        run();
        return;
      }
      if (event.target.closest('[data-cut-clear]')) {
        const ok = await ui.confirmDialog('清除已下载的抠图组件？下次使用智能抠图时需要重新下载。', { okLabel: '清除', danger: true });
        if (!ok) return;
        await CC.cutout.clearCache().catch(() => {});
        cacheNote.textContent = '已清除下载的抠图组件。';
      }
    });
    const compare = body.querySelector('[data-cut-compare]');
    const setCompare = (on) => {
      if (showOriginal === on) return;
      showOriginal = on;
      drawPreview();
    };
    compare.addEventListener('pointerdown', () => setCompare(true));
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((type) => compare.addEventListener(type, () => setCompare(false)));

    const dialog = ui.openDialog({
      title: '智能抠图',
      body,
      width: 860,
      className: 'cutout-dialog',
      buttons: [
        { label: '取消', value: null },
        { label: '应用', kind: 'primary', onClick: apply },
      ],
    });
    applyButton = dialog.el.querySelector('.modal-foot [data-primary="1"]');
    body.querySelectorAll('input[type="range"]').forEach(ui.syncRangeFill);
    setReady(false);
    drawOriginal();
    dialog.done.then(() => {
      abort.abort();
      cancelAnimationFrame(frameRequest);
    });
    begin();
  }

  Object.assign(App, {
    smartCutout,
    restoreCutout,
    canRestoreCutout,
    canCutout: (layer) => !!cutoutTarget(layer),
  });
})();
