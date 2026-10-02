/* CHAOS.COLLAGE — home / project manager, dialogs, menus and file I/O
   (extends CC.App). */
(() => {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const M = CC.model;
  const ui = CC.ui;
  const App = CC.App;
  const { state, dom } = App;
  const { escapeHtml } = U;

  const FILE_TYPES = [{ description: 'CHAOS.COLLAGE 工程', accept: { 'application/json': ['.chaos'] } }];
  const thumbUrls = new Map();

  /* ======================= home / project manager ======================= */

  const QUICK_PRESETS = [
    { name: '4:5 竖版', w: 1080, h: 1350 },
    { name: '1:1 方形', w: 1080, h: 1080 },
    { name: '9:16 竖屏', w: 1080, h: 1920 },
    { name: '16:9 横屏', w: 1920, h: 1080 },
    { name: '小红书 3:4', w: 1242, h: 1656 },
    { name: 'A4 印刷', w: 2480, h: 3508 },
    { name: '3:2 横幅', w: 1800, h: 1200 },
  ];

  let homeQuery = '';
  let homeSort = 'updated';

  function ratioBox(w, h, size = 46) {
    const scale = size / Math.max(w, h);
    return `<span class="ratio-box" style="width:${Math.max(6, w * scale)}px;height:${Math.max(6, h * scale)}px"></span>`;
  }

  function revokeThumbs() {
    thumbUrls.forEach((url) => URL.revokeObjectURL(url));
    thumbUrls.clear();
  }

  async function renderHome() {
    const el = dom.home;
    const projects = await CC.storage.listProjects();
    const estimate = await CC.storage.estimate();
    const persisted = await CC.storage.persisted();
    revokeThumbs();
    const query = homeQuery.trim().toLowerCase();
    let list = projects.filter((project) => !query || project.name.toLowerCase().includes(query));
    if (homeSort === 'name') list = list.sort((a, b) => a.name.localeCompare(b.name));
    if (homeSort === 'created') list = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const current = state.doc?.id;
    el.innerHTML = `
      <div class="home-inner">
        <header class="home-head">
          <div class="home-brand">
            <img class="brand-mark" src="assets/logo-mark.svg" alt="" width="36" height="36">
            <div><strong>CHAOS.COLLAGE</strong><small>工程主页</small></div>
          </div>
          <div class="home-actions">
            <button class="ui-button primary" data-home-action="new">${ui.icon('plus')}<span>新建工程…</span></button>
            <button class="ui-button" data-home-action="open">${ui.icon('folder')}<span>打开工程文件…</span></button>
            ${current ? `<button class="ui-button" data-home-action="back">${ui.icon('close')}<span>返回编辑</span></button>` : ''}
            ${accountButton()}
          </div>
        </header>
        <section class="home-section">
          <h3>快速新建</h3>
          <div class="quick-grid">
            ${QUICK_PRESETS.map((preset, index) => `
              <button class="quick-card" data-quick="${index}" title="${preset.w} × ${preset.h} px">
                <span class="quick-preview">${ratioBox(preset.w, preset.h)}</span>
                <strong>${escapeHtml(preset.name)}</strong>
                <small>${preset.w} × ${preset.h}</small>
              </button>`).join('')}
            <button class="quick-card more" data-home-action="new">
              <span class="quick-preview">${ui.icon('more')}</span>
              <strong>更多尺寸…</strong>
              <small>平台 / 印刷 / 自定义</small>
            </button>
          </div>
        </section>
        <section class="home-section grow">
          <div class="projects-head">
            <h3>我的工程 <em>${projects.length}</em></h3>
            <div class="projects-tools">
              <div class="search-field">${ui.icon('search')}<input type="text" placeholder="搜索工程名" value="${escapeHtml(homeQuery)}" data-home-search></div>
              <select class="select-input" data-home-sort>
                <option value="updated" ${homeSort === 'updated' ? 'selected' : ''}>最近修改</option>
                <option value="created" ${homeSort === 'created' ? 'selected' : ''}>创建时间</option>
                <option value="name" ${homeSort === 'name' ? 'selected' : ''}>名称</option>
              </select>
            </div>
          </div>
          <div class="projects-grid">
            ${list.length ? list.map((project) => projectCard(project, project.id === current)).join('') : `
              <div class="projects-empty">
                <strong>${projects.length ? '没有匹配的工程' : '还没有工程'}</strong>
                <p>${projects.length ? '换个关键词试试。' : '从上面的「快速新建」开始，或打开一个 .chaos 工程文件。工程会自动保存在本机浏览器中。'}</p>
              </div>`}
          </div>
        </section>
        <footer class="home-foot">
          <span>${storageSummary()}</span>
          <span title="换浏览器或换打开方式（直接打开 / 本地服务器）会看到另一个独立的工程库">工程库位置：${escapeHtml(storageLocation())}</span>
          <span>${estimate ? `已用 ${U.formatBytes(estimate.usage)} / ${cloudOn() ? '' : '可用约 '}${U.formatBytes(estimate.quota)}` : ''}${cloudOn() ? '' : persisted ? ' · 已启用持久存储' : ` · <button class="link-button" data-home-action="persist">申请持久存储</button>`}</span>
          <button class="link-button" data-home-action="about">数据存储说明</button>
        </footer>
      </div>`;
    el.querySelectorAll('[data-thumb-id]').forEach((img) => {
      const project = projects.find((item) => item.id === img.dataset.thumbId);
      if (typeof project?.thumb === 'string') img.src = project.thumb;
      else if (project?.thumb) {
        const url = URL.createObjectURL(project.thumb);
        thumbUrls.set(project.id, url);
        img.src = url;
      }
    });
    ui.enhanceSelects(el);
  }

  const cloudOn = () => !!CC.cloud?.isEnabled();

  function storageSummary() {
    if (cloudOn()) return `工程自动保存在云端账号「${escapeHtml(CC.cloud.user()?.username || '')}」，可在任何设备登录使用；「另存为工程文件」可下载到本地。`;
    if (CC.cloud?.config()) return '本机试用模式：工程只存在这个浏览器里。<button class="link-button" data-home-action="login">登录 / 注册</button>后保存到云端（试用中的工程可另存为文件再打开导入）。';
    return CC.storage.isPersistent() ? '工程自动保存在本机浏览器（IndexedDB），不会上传。' : '当前浏览器无法使用 IndexedDB，工程只保存在内存中，请及时另存工程文件。';
  }

  function accountButton() {
    if (!cloudOn()) return '';
    return `<button class="ui-button" data-home-action="account" data-menu-trigger>${ui.icon('user')}<span>${escapeHtml(CC.cloud.user()?.username || '账号')}</span></button>`;
  }

  /* The library belongs to one browser profile and one origin; showing both
     explains an "empty" library after opening the app another way. */
  function storageLocation() {
    const brands = navigator.userAgentData?.brands?.map((item) => item.brand) || [];
    const ua = navigator.userAgent;
    const browser = brands.find((name) => /Edge/.test(name)) ? 'Edge'
      : brands.find((name) => /Chrome/.test(name)) ? 'Chrome'
        : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '浏览器';
    if (cloudOn()) return `云端 · ${location.host}`;
    const origin = location.protocol === 'file:' ? '直接打开的本地文件 (file://)' : location.origin;
    return `${browser} · ${origin}`;
  }

  function projectCard(project, isCurrent) {
    return `
      <div class="project-card${isCurrent ? ' current' : ''}" data-project-id="${project.id}" tabindex="0">
        <div class="project-thumb">
          ${project.thumb ? `<img alt="" data-thumb-id="${project.id}">` : `<span class="thumb-empty">${ratioBox(project.width, project.height, 60)}</span>`}
          ${isCurrent ? '<span class="current-badge">当前</span>' : ''}
        </div>
        <div class="project-meta">
          <strong title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</strong>
          <small>${project.width} × ${project.height} · ${project.layerCount} 层</small>
          <small>${escapeHtml(U.formatTime(project.updatedAt))}</small>
        </div>
        <button class="icon-button icon-only project-more" data-project-menu="${project.id}" title="更多操作">${ui.icon('more')}</button>
      </div>`;
  }

  function showHome() {
    state.homeOpen = true;
    App.flushSave();
    dom.home.hidden = false;
    document.body.classList.add('home-open');
    App.closeFlyout?.();
    renderHome();
  }

  function hideHome() {
    state.homeOpen = false;
    dom.home.hidden = true;
    document.body.classList.remove('home-open');
    revokeThumbs();
    requestAnimationFrame(() => App.resizeViewport());
  }

  function setupHome() {
    const el = dom.home;
    el.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-home-action]')?.dataset.homeAction;
      if (action === 'new') {
        openNewProjectDialog();
        return;
      }
      if (action === 'open') {
        openProjectFile();
        return;
      }
      if (action === 'back') {
        hideHome();
        return;
      }
      if (action === 'about') {
        openAboutDialog();
        return;
      }
      if (action === 'account') {
        const rect = event.target.closest('[data-home-action]').getBoundingClientRect();
        ui.openMenuAt({ left: rect.left, top: rect.bottom + 4, bottom: rect.top }, CC.cloud.accountMenuItems(), { minWidth: 200 });
        return;
      }
      if (action === 'login') {
        location.reload();
        return;
      }
      if (action === 'persist') {
        const ok = await CC.storage.requestPersist();
        ui.toast(ok ? '已启用持久存储，浏览器不会自动清理工程数据' : '浏览器未批准持久存储（可稍后再试，或定期另存工程文件）');
        renderHome();
        return;
      }
      const quick = event.target.closest('[data-quick]');
      if (quick) {
        const preset = QUICK_PRESETS[Number(quick.dataset.quick)];
        await App.createProject({ name: `${preset.name} 海报`, width: preset.w, height: preset.h });
        return;
      }
      const menuButton = event.target.closest('[data-project-menu]');
      if (menuButton) {
        event.stopPropagation();
        const rect = menuButton.getBoundingClientRect();
        ui.openMenuAt({ left: rect.left, top: rect.bottom + 4, bottom: rect.top }, projectMenu(menuButton.dataset.projectMenu));
        return;
      }
      const card = event.target.closest('[data-project-id]');
      if (card) await App.openProject(card.dataset.projectId);
    });
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.matches('[data-project-id]')) App.openProject(event.target.dataset.projectId);
      if (event.key === 'Escape' && state.doc && !ui.dialogsOpen()) hideHome();
    });
    el.addEventListener('input', U.debounce((event) => {
      if (!event.target.matches('[data-home-search]')) return;
      homeQuery = event.target.value;
      const caret = event.target.selectionStart;
      renderHome().then(() => {
        const input = el.querySelector('[data-home-search]');
        input?.focus();
        input?.setSelectionRange(caret, caret);
      });
    }, 160));
    el.addEventListener('change', (event) => {
      if (!event.target.matches('[data-home-sort]')) return;
      homeSort = event.target.value;
      renderHome();
    });
    el.addEventListener('contextmenu', (event) => {
      const card = event.target.closest('[data-project-id]');
      if (!card) return;
      event.preventDefault();
      ui.openMenuAt({ left: event.clientX, top: event.clientY }, projectMenu(card.dataset.projectId));
    });
  }

  function projectMenu(id) {
    return [
      { label: '打开', action: () => App.openProject(id) },
      { label: '重命名…', action: () => renameProject(id) },
      { label: '创建副本', action: () => duplicateProject(id) },
      { label: '导出工程文件…', action: () => exportProjectFile(id) },
      { separator: true },
      { label: '删除…', danger: true, action: () => deleteProject(id) },
    ];
  }

  async function renameProject(id) {
    const record = await CC.storage.getProject(id);
    if (!record) return;
    const name = await ui.promptDialog('重命名工程', record.name, { label: '工程名' });
    if (!name || !name.trim()) return;
    await CC.storage.renameProject(id, name.trim().slice(0, 120));
    if (state.doc?.id === id) {
      state.doc.name = name.trim().slice(0, 120);
      App.renderTopbar();
    }
    renderHome();
  }

  async function duplicateProject(id) {
    if (state.doc?.id === id) await App.saveProject({ force: true });
    const record = await CC.storage.getProject(id);
    if (!record) return;
    const copy = U.deepCopy({ ...record, thumb: null });
    copy.id = U.uid('P');
    copy.name = `${record.name} 副本`;
    copy.doc.id = copy.id;
    copy.doc.name = copy.name;
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    copy.doc.createdAt = copy.createdAt;
    copy.doc.updatedAt = copy.updatedAt;
    copy.thumb = record.thumb || null;
    copy.fileName = '';
    await CC.storage.putProject(copy);
    await CC.storage.copyAssets(id, copy.id);
    ui.toast(`已创建副本「${copy.name}」`);
    renderHome();
  }

  async function deleteProject(id) {
    const record = await CC.storage.getProject(id);
    if (!record) return;
    const ok = await ui.confirmDialog(`删除工程「${record.name}」？工程和其中的图片会从本机工程库中永久移除（已导出的 .chaos 文件不受影响）。`, { title: '删除工程', okLabel: '删除', danger: true });
    if (!ok) return;
    await CC.storage.deleteProject(id);
    if (state.doc?.id === id) {
      App.stopTextEditing(false);
      App.releaseAssets();
      App.renderer.clear();
      state.doc = null;
      state.selection = [];
      state.history = [];
      state.future = [];
      state.dirty = false;
      App.renderAll();
    }
    ui.toast('已删除工程');
    renderHome();
  }

  /* ======================= new project ======================= */

  function openNewProjectDialog() {
    let category = M.PRESETS[0].id;
    let selected = M.PRESETS[0].items[0];
    const body = document.createElement('div');
    body.className = 'newproj';
    const renderBody = () => {
      const group = M.PRESETS.find((item) => item.id === category);
      body.innerHTML = `
        <nav class="newproj-cats">${M.PRESETS.map((item) => `<button type="button" class="cat-button${item.id === category ? ' active' : ''}" data-cat="${item.id}">${escapeHtml(item.name)}</button>`).join('')}</nav>
        <div class="newproj-main">
          <div class="preset-grid">
            ${group.items.map((preset, index) => `
              <button type="button" class="preset-card${preset === selected ? ' active' : ''}" data-preset-index="${index}">
                <span class="quick-preview">${ratioBox(preset.w, preset.h, 40)}</span>
                <strong>${escapeHtml(preset.name)}</strong>
                <small>${preset.w} × ${preset.h} · ${M.ratioLabel(preset.w, preset.h)}</small>
              </button>`).join('')}
          </div>
          <div class="newproj-form">
            <label class="field"><span>工程名</span><input class="text-input" type="text" data-field="name" value="${escapeHtml(selected ? `${selected.name}` : '未命名工程')}"></label>
            <div class="field-row">
              <label class="field"><span>宽</span><input class="text-input" type="number" min="0.1" step="any" data-field="w" value="${selected?.w || 1080}"></label>
              <button type="button" class="icon-button icon-only swap-dims" data-swap title="交换宽高">⇄</button>
              <label class="field"><span>高</span><input class="text-input" type="number" min="0.1" step="any" data-field="h" value="${selected?.h || 1350}"></label>
              <label class="field small"><span>单位</span><select class="select-input" data-field="unit">${Object.entries(M.UNITS).map(([key, unit]) => `<option value="${key}">${unit.label}</option>`).join('')}</select></label>
              <label class="field small" data-dpi-field hidden><span>DPI</span><input class="text-input" type="number" min="36" max="1200" step="1" data-field="dpi" value="300"></label>
            </div>
            <div class="field-row">
              <label class="field"><span>背景色</span><div class="color-pair"><input type="color" data-field="bg" value="#f1eddf"><input class="text-input" type="text" data-field="bgText" value="#f1eddf"></div></label>
              <label class="checkbox-row inline"><span>透明背景</span><input type="checkbox" data-field="transparent"></label>
            </div>
            <p class="newproj-summary" data-summary></p>
          </div>
        </div>`;
      ui.enhanceSelects(body);
      updateSummary();
    };
    const read = () => {
      const unit = body.querySelector('[data-field="unit"]')?.value || 'px';
      const dpi = Number(body.querySelector('[data-field="dpi"]')?.value) || 300;
      const w = Number(body.querySelector('[data-field="w"]')?.value) || 0;
      const h = Number(body.querySelector('[data-field="h"]')?.value) || 0;
      const toPx = M.UNITS[unit].toPx;
      return {
        name: body.querySelector('[data-field="name"]')?.value.trim() || '未命名工程',
        width: Math.round(toPx(w, dpi)),
        height: Math.round(toPx(h, dpi)),
        bg: body.querySelector('[data-field="bg"]')?.value || '#f1eddf',
        transparent: !!body.querySelector('[data-field="transparent"]')?.checked,
        unit,
      };
    };
    const updateSummary = () => {
      const values = read();
      const summary = body.querySelector('[data-summary]');
      const dpiField = body.querySelector('[data-dpi-field]');
      if (dpiField) dpiField.hidden = values.unit === 'px';
      const valid = values.width >= 16 && values.height >= 16 && values.width <= 16000 && values.height <= 16000;
      summary.textContent = valid
        ? `将创建 ${values.width} × ${values.height} px（${M.ratioLabel(values.width, values.height)}，${(values.width * values.height / 1e6).toFixed(1)} MP）`
        : '尺寸需在 16–16000 px 之间';
      summary.classList.toggle('invalid', !valid);
      const createButton = dialog?.el.querySelector('[data-primary="1"]');
      if (createButton) createButton.disabled = !valid;
    };
    body.addEventListener('click', (event) => {
      const cat = event.target.closest('[data-cat]');
      if (cat) {
        category = cat.dataset.cat;
        selected = null;
        renderBody();
        return;
      }
      const card = event.target.closest('[data-preset-index]');
      if (card) {
        const group = M.PRESETS.find((item) => item.id === category);
        selected = group.items[Number(card.dataset.presetIndex)];
        body.querySelectorAll('.preset-card').forEach((item) => item.classList.toggle('active', item === card));
        body.querySelector('[data-field="w"]').value = selected.w;
        body.querySelector('[data-field="h"]').value = selected.h;
        const unitSelect = body.querySelector('[data-field="unit"]');
        unitSelect.value = 'px';
        unitSelect.dispatchEvent(new Event('csel-sync'));
        body.querySelector('[data-field="name"]').value = selected.name;
        updateSummary();
        return;
      }
      if (event.target.closest('[data-swap]')) {
        const w = body.querySelector('[data-field="w"]');
        const h = body.querySelector('[data-field="h"]');
        [w.value, h.value] = [h.value, w.value];
        updateSummary();
      }
    });
    body.addEventListener('input', (event) => {
      if (event.target.matches('[data-field="bg"]')) body.querySelector('[data-field="bgText"]').value = event.target.value;
      if (event.target.matches('[data-field="bgText"]') && /^#[0-9a-f]{6}$/i.test(event.target.value)) body.querySelector('[data-field="bg"]').value = event.target.value;
      if (event.target.matches('[data-field="w"], [data-field="h"]')) {
        selected = null;
        body.querySelectorAll('.preset-card').forEach((item) => item.classList.remove('active'));
      }
      updateSummary();
    });
    body.addEventListener('change', updateSummary);
    let dialog = null;
    renderBody();
    dialog = ui.openDialog({
      title: '新建工程',
      body,
      width: 760,
      className: 'newproj-dialog',
      buttons: [
        { label: '取消', value: null },
        {
          label: '创建',
          kind: 'primary',
          onClick: () => {
            const values = read();
            if (values.width < 16 || values.height < 16 || values.width > 16000 || values.height > 16000) return false;
            /* close first so the editor is interactive while the first save runs */
            setTimeout(() => App.createProject(values), 0);
            return true;
          },
        },
      ],
    });
    updateSummary();
  }

  /* ======================= canvas size ======================= */

  function openCanvasSizeDialog(prefill) {
    if (!state.doc) return;
    const doc = state.doc;
    const body = document.createElement('div');
    body.className = 'canvas-size';
    let linked = true;
    let anchor = [0.5, 0.5];
    const ratio = doc.width / doc.height;
    const presetOptions = M.PRESETS.map((group) => `<optgroup label="${escapeHtml(group.name)}">${group.items.map((preset) => `<option value="${preset.w}x${preset.h}">${escapeHtml(preset.name)} · ${preset.w}×${preset.h}</option>`).join('')}</optgroup>`).join('');
    body.innerHTML = `
      <p class="muted-note">当前 ${doc.width} × ${doc.height} px（${M.ratioLabel(doc.width, doc.height)}）。修改会作为一步操作，可撤销。</p>
      <label class="field"><span>预设</span><select class="select-input" data-cs="preset"><option value="">自定义</option>${presetOptions}</select></label>
      <div class="field-row">
        <label class="field"><span>宽 px</span><input class="text-input" type="number" min="16" max="16000" data-cs="w" value="${prefill?.w || doc.width}"></label>
        <button type="button" class="icon-button icon-only link-dims on" data-cs-link title="锁定比例">${ui.icon('link')}</button>
        <label class="field"><span>高 px</span><input class="text-input" type="number" min="16" max="16000" data-cs="h" value="${prefill?.h || doc.height}"></label>
      </div>
      <div class="field">
        <span>内容处理</span>
        <div class="radio-list">
          <label><input type="radio" name="cs-mode" value="scale" checked><span><strong>等比缩放内容</strong><small>内容整体缩放并居中，不变形</small></span></label>
          <label><input type="radio" name="cs-mode" value="stretch"><span><strong>拉伸内容</strong><small>内容随画布非等比拉伸</small></span></label>
          <label><input type="radio" name="cs-mode" value="anchor"><span><strong>不缩放内容</strong><small>按锚点扩展或裁切画布</small></span></label>
        </div>
      </div>
      <div class="field" data-anchor-field hidden>
        <span>锚点</span>
        <div class="anchor-grid">${[0, 0.5, 1].map((ay) => [0, 0.5, 1].map((ax) => `<button type="button" class="anchor-cell${ax === 0.5 && ay === 0.5 ? ' active' : ''}" data-anchor="${ax},${ay}"></button>`).join('')).join('')}</div>
      </div>`;
    if (prefill) {
      linked = false;
      body.querySelector('[data-cs-link]').classList.remove('on');
      body.querySelector('[data-cs-link]').innerHTML = ui.icon('unlink');
    }
    const w = body.querySelector('[data-cs="w"]');
    const h = body.querySelector('[data-cs="h"]');
    body.addEventListener('input', (event) => {
      if (event.target === w && linked) h.value = Math.round(Number(w.value) / ratio) || h.value;
      if (event.target === h && linked) w.value = Math.round(Number(h.value) * ratio) || w.value;
    });
    body.addEventListener('change', (event) => {
      if (event.target.matches('[data-cs="preset"]') && event.target.value) {
        const [pw, ph] = event.target.value.split('x').map(Number);
        linked = false;
        const link = body.querySelector('[data-cs-link]');
        link.classList.remove('on');
        link.innerHTML = ui.icon('unlink');
        w.value = pw;
        h.value = ph;
      }
      if (event.target.name === 'cs-mode') body.querySelector('[data-anchor-field]').hidden = event.target.value !== 'anchor';
    });
    body.addEventListener('click', (event) => {
      const link = event.target.closest('[data-cs-link]');
      if (link) {
        linked = !linked;
        link.classList.toggle('on', linked);
        link.innerHTML = ui.icon(linked ? 'link' : 'unlink');
        if (linked) h.value = Math.round(Number(w.value) / ratio);
      }
      const cell = event.target.closest('[data-anchor]');
      if (cell) {
        anchor = cell.dataset.anchor.split(',').map(Number);
        body.querySelectorAll('.anchor-cell').forEach((item) => item.classList.toggle('active', item === cell));
      }
    });
    ui.openDialog({
      title: '画布大小',
      body,
      width: 460,
      buttons: [
        { label: '取消', value: null },
        {
          label: '应用',
          kind: 'primary',
          onClick: () => {
            const nw = Number(w.value);
            const nh = Number(h.value);
            if (!(nw >= 16 && nh >= 16 && nw <= 16000 && nh <= 16000)) {
              ui.toast('尺寸需在 16–16000 px 之间', 'error');
              return false;
            }
            const mode = body.querySelector('input[name="cs-mode"]:checked').value;
            App.resizeCanvas(nw, nh, mode, anchor);
            return true;
          },
        },
      ],
    });
  }

  /* ======================= export ======================= */

  function openExportDialog() {
    if (!state.doc) return;
    const doc = state.doc;
    const settings = { ...doc.exportSettings };
    const hasSelection = state.selection.length > 0;
    settings.range = 'canvas';
    const body = document.createElement('div');
    body.className = 'export-form';
    const draw = () => {
      const size = exportSize(settings);
      body.innerHTML = `
        <div class="field"><span>格式</span>${ui.segmented('format', settings.format, [['png', 'PNG'], ['jpeg', 'JPG'], ['webp', 'WEBP']], { scope: 'export' })}</div>
        <div class="field"><span>倍率</span>${ui.segmented('scale', settings.scale, [[0.5, '0.5×'], [1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], { scope: 'export' })}</div>
        ${settings.format !== 'png' ? `<label class="field"><span>质量 ${settings.quality}</span><input type="range" min="40" max="100" step="1" value="${settings.quality}" data-ex="quality"></label>` : ''}
        ${settings.format !== 'jpeg' ? `<label class="checkbox-row"><span>透明背景（不绘制背景色）</span><input type="checkbox" data-ex="transparent" ${settings.transparent || doc.transparent ? 'checked' : ''} ${doc.transparent ? 'disabled' : ''}></label>` : ''}
        <div class="field"><span>范围</span>${ui.segmented('range', settings.range, [['canvas', '整个画布'], ['selection', `仅选中图层${hasSelection ? `（${state.selection.length}）` : ''}`]], { scope: 'export' })}</div>
        <label class="field"><span>文件名</span><input class="text-input" type="text" data-ex="name" value="${escapeHtml(settings.fileName || U.safeFileName(doc.name))}"></label>
        <p class="newproj-summary${size.ok ? '' : ' invalid'}">${size.ok ? `输出 ${size.w} × ${size.h} px` : size.message}</p>`;
      body.querySelectorAll('input[type="range"]').forEach(ui.syncRangeFill);
      if (!hasSelection) body.querySelector('[data-seg-value="selection"]').disabled = true;
    };
    body.addEventListener('click', (event) => {
      const seg = event.target.closest('[data-seg-path]');
      if (!seg || seg.disabled) return;
      const key = seg.dataset.segPath;
      settings[key] = key === 'scale' ? Number(seg.dataset.segValue) : seg.dataset.segValue;
      settings.fileName = body.querySelector('[data-ex="name"]').value;
      draw();
    });
    body.addEventListener('input', (event) => {
      if (event.target.matches('[data-ex="quality"]')) {
        settings.quality = Number(event.target.value);
        event.target.previousElementSibling.textContent = `质量 ${settings.quality}`;
        ui.syncRangeFill(event.target);
      }
      if (event.target.matches('[data-ex="transparent"]')) settings.transparent = event.target.checked;
      if (event.target.matches('[data-ex="name"]')) settings.fileName = event.target.value;
    });
    draw();
    ui.openDialog({
      title: '导出图片',
      body,
      width: 440,
      buttons: [
        { label: '取消', value: null },
        {
          label: '导出',
          kind: 'primary',
          onClick: async () => {
            settings.fileName = body.querySelector('[data-ex="name"]').value.trim();
            const size = exportSize(settings);
            if (!size.ok) {
              ui.toast(size.message, 'error');
              return false;
            }
            doc.exportSettings = { format: settings.format, scale: settings.scale, quality: settings.quality, transparent: settings.transparent };
            App.markDirty();
            setTimeout(() => exportImage(settings), 30);
            return true;
          },
        },
      ],
    });
  }

  function selectionBounds() {
    const layers = App.selectedLayers();
    if (!layers.length) return null;
    const box = App.unionAABB(layers.map(App.layerAABB));
    const pad = Math.max(...layers.map((layer) => {
      const style = layer.style || {};
      return (style.shadow?.on ? style.shadow.distance + style.shadow.blur * 2 : 0) + (style.glow?.on ? style.glow.blur * 2 : 0) + (style.outline?.on ? style.outline.width : 0) + CC.effects.padFor(layer.effects, 1);
    })) + 4;
    return { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
  }

  function exportSize(settings) {
    const doc = state.doc;
    let w = doc.width;
    let h = doc.height;
    if (settings.range === 'selection') {
      const box = selectionBounds();
      if (!box) return { ok: false, message: '没有选中的图层' };
      w = box.maxX - box.minX;
      h = box.maxY - box.minY;
    }
    const W = Math.round(w * settings.scale);
    const H = Math.round(h * settings.scale);
    if (W > 32000 || H > 32000 || W * H > 220e6) return { ok: false, message: `输出 ${W} × ${H} 过大，浏览器画布上限约 2.2 亿像素，请降低倍率` };
    return { ok: true, w: W, h: H };
  }

  async function exportImage(settings) {
    const doc = state.doc;
    const size = exportSize(settings);
    if (!size.ok) {
      ui.toast(size.message, 'error');
      return;
    }
    ui.toast('正在导出…');
    dom.statusText.textContent = '正在导出…';
    await new Promise((resolve) => setTimeout(resolve, 30));
    await Promise.all([...state.assets.values()].map((asset) => App.loadAssetImage(asset)));
    const canvas = U.makeCanvas(size.w, size.h);
    const ctx = canvas.getContext('2d');
    const scale = settings.scale;
    const transparent = settings.format !== 'jpeg' && (settings.transparent || doc.transparent);
    try {
      if (settings.format === 'jpeg') {
        ctx.fillStyle = doc.transparent ? '#ffffff' : doc.bg;
        ctx.fillRect(0, 0, size.w, size.h);
      }
      ctx.scale(scale, scale);
      if (settings.range === 'selection') {
        const box = selectionBounds();
        ctx.translate(-box.minX, -box.minY);
        const ids = new Set(state.selection);
        const subset = { ...doc, layers: doc.layers.filter((layer) => ids.has(layer.id) || (layer.clip && ids.has(baseOf(layer)?.id))) };
        App.renderer.renderDoc(ctx, subset, { q: scale, deviceScale: scale, background: false });
      } else {
        App.renderer.renderDoc(ctx, doc, { q: scale, deviceScale: scale, background: !transparent });
      }
      const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[settings.format];
      const ext = { png: 'png', jpeg: 'jpg', webp: 'webp' }[settings.format];
      const blob = await U.canvasToBlob(canvas, mime, settings.quality / 100);
      const name = `${U.safeFileName(settings.fileName || doc.name)}${scale !== 1 ? `@${scale}x` : ''}.${ext}`;
      await saveBlob(blob, name, [{ description: `${ext.toUpperCase()} 图片`, accept: { [mime]: [`.${ext}`] } }]);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(error);
        ui.toast(`导出失败：${error.message || error}`, 'error');
      }
    } finally {
      U.releaseCanvas(canvas);
      App.renderer.releaseTemps();
      App.renderStatus();
    }
  }

  function baseOf(layer) {
    const layers = state.doc.layers;
    let index = layers.indexOf(layer);
    while (index > 0 && layers[index].clip) index -= 1;
    return layers[index];
  }

  function quickExport() {
    if (!state.doc) return;
    exportImage({ format: 'png', scale: state.doc.exportSettings?.scale || 1, quality: 92, transparent: state.doc.transparent, range: 'canvas', fileName: state.doc.name });
  }

  async function saveBlob(blob, suggestedName, types) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName, types });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        ui.toast(`已保存 ${handle.name}`);
        return handle;
      } catch (error) {
        if (error?.name === 'AbortError') return null;
        console.warn('save picker failed, falling back to download', error);
      }
    }
    U.downloadBlob(blob, suggestedName);
    ui.toast(`已下载 ${suggestedName}`);
    return null;
  }

  /* ======================= project files ======================= */

  function usedFonts(doc) {
    const families = new Set();
    doc.layers.forEach((layer) => {
      if (layer.type === 'text') families.add(layer.fontFamily);
      if (layer.type === 'window') families.add(layer.bodyFont);
      if (layer.type === 'gen' && layer.p?.family) families.add(layer.p.family);
    });
    return CC.fonts.importedRecords().filter((record) => families.has(record.family));
  }

  async function buildCurrentFile() {
    const doc = state.doc;
    const used = new Set(doc.layers.map((layer) => layer.assetId).filter(Boolean));
    const assets = [...state.assets.values()].filter((asset) => used.has(asset.id));
    return CC.storage.buildProjectFile(U.deepCopy(doc), assets, usedFonts(doc));
  }

  async function writeHandle(handle, blob) {
    if (handle.queryPermission) {
      let permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') throw new Error('没有写入该文件的权限');
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  /* Autosave also refreshes the linked .chaos file, but only while write
     permission is already granted (after a restart Chrome asks again on the
     next Ctrl+S); it never prompts by itself. */
  let linkedWriteRunning = false;
  const autoWriteLinkedFile = U.debounce(async () => {
    const handle = state.fileHandle;
    if (!handle || !state.doc || linkedWriteRunning) return;
    try {
      if (!handle.queryPermission || (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return;
      linkedWriteRunning = true;
      const writable = await handle.createWritable();
      await writable.write(await buildCurrentFile());
      await writable.close();
    } catch (error) {
      console.warn('linked file autosave failed', error);
    } finally {
      linkedWriteRunning = false;
    }
  }, 4000);

  async function saveCommand() {
    if (!state.doc) return;
    App.stopTextEditing(true);
    await App.saveProject({ force: true });
    if (state.fileHandle) {
      try {
        await writeHandle(state.fileHandle, await buildCurrentFile());
        ui.toast(`已保存到${cloudOn() ? '云端' : '工程库'}，并写入 ${state.fileHandle.name}`);
      } catch (error) {
        ui.toast(`已保存到${cloudOn() ? '云端' : '工程库'}；写入文件失败：${error.message || error}`, 'error');
      }
    } else {
      ui.toast(state.saveStatus === 'error' ? '保存失败，正在重试' : `已保存到${cloudOn() ? '云端' : '本机工程库'}（Ctrl+Shift+S 可另存为 .chaos 工程文件到本地）`);
    }
  }

  async function saveAsFile() {
    if (!state.doc) return;
    App.stopTextEditing(true);
    await App.saveProject({ force: true });
    const blob = await buildCurrentFile();
    const name = `${U.safeFileName(state.doc.name)}.chaos`;
    const handle = await saveBlob(blob, name, FILE_TYPES);
    if (handle) {
      state.fileHandle = handle;
      await CC.storage.setHandle(state.doc.id, handle);
      App.markDirty();
      App.renderSaveStatus();
    }
  }

  async function exportProjectFile(id) {
    if (state.doc?.id === id) {
      await saveAsFile();
      return;
    }
    const record = await CC.storage.getProject(id);
    if (!record) return;
    const assets = await CC.storage.getAssets(id);
    const blob = await CC.storage.buildProjectFile(record.doc, assets, usedFonts(M.normalizeDoc(record.doc)));
    await saveBlob(blob, `${U.safeFileName(record.name)}.chaos`, FILE_TYPES);
  }

  async function openProjectFile() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
        const file = await handle.getFile();
        await openProjectFromFile(file, handle);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('open picker failed, falling back to input', error);
      }
    }
    dom.projectInput.click();
  }

  async function openProjectFromFile(file, handle = null) {
    let parsed;
    try {
      parsed = await CC.storage.parseProjectFile(await file.text());
    } catch (error) {
      ui.toast(error.message || '无法读取工程文件', 'error');
      return;
    }
    const { doc, assets, fonts } = parsed;
    for (const font of fonts) {
      if (CC.fonts.isImported(font.family)) continue;
      try {
        const record = { ...font, size: font.blob.size, addedAt: Date.now() };
        await CC.fonts.registerRecord(record);
        await CC.storage.putFont(record);
      } catch (error) {
        console.warn('font failed', font.family, error);
      }
    }
    let target = M.normalizeDoc(doc);
    const existing = await CC.storage.getProject(target.id);
    if (existing) {
      const choice = await ui.choiceDialog('工程已在库中', `工程库里已经有「${existing.name}」（${U.formatTime(existing.updatedAt)}）。要怎样打开文件中的版本（${U.formatTime(target.updatedAt)}）？`, [
        { label: '取消', value: null },
        { label: '作为副本打开', value: 'copy' },
        { label: '覆盖库中版本', value: 'replace', kind: 'danger' },
      ]);
      if (!choice) return;
      if (choice === 'copy') {
        target.id = U.uid('P');
        target.name = `${target.name} 副本`;
        handle = null;
      } else await CC.storage.deleteProject(existing.id);
    }
    if (state.doc) await App.saveProject();
    /* project first: the cloud store only accepts assets of an existing project */
    await CC.storage.putProject({ id: target.id, name: target.name, width: target.width, height: target.height, createdAt: target.createdAt, updatedAt: Date.now(), doc: target, thumb: null, fileName: file.name, force: true });
    for (const asset of assets) await CC.storage.putAsset(target.id, asset);
    if (handle) await CC.storage.setHandle(target.id, handle);
    await App.openProject(target.id);
    if (handle) state.fileHandle = handle;
    App.renderSaveStatus();
    App.markDirty();
    ui.toast(`已打开 ${file.name}`);
  }

  /* ======================= file pickers ======================= */

  let replaceTarget = null;

  function chooseImages({ replace = null } = {}) {
    if (!state.doc) {
      ui.toast('请先新建或打开一个工程');
      return;
    }
    replaceTarget = replace;
    dom.imageInput.multiple = !replace;
    dom.imageInput.click();
  }

  function chooseFonts() {
    dom.fontInput.click();
  }

  async function importFontFiles(files) {
    let count = 0;
    for (const file of files) {
      try {
        const { record, duplicate } = await CC.fonts.importFile(file);
        if (!duplicate) {
          await CC.storage.putFont(record);
          count += 1;
        }
      } catch (error) {
        ui.toast(`${file.name}：无法载入字体`, 'error');
      }
    }
    if (count) ui.toast(`已导入 ${count} 个字体，可在字体列表「已导入字体」中找到`);
    App.refreshFonts();
  }

  function setupFileInputs() {
    dom.imageInput.addEventListener('change', async () => {
      const files = [...dom.imageInput.files];
      dom.imageInput.value = '';
      if (!files.length) return;
      if (replaceTarget) {
        const layer = App.layerById(replaceTarget);
        replaceTarget = null;
        if (!layer) return;
        try {
          const asset = await App.importImageBlob(files[0], files[0].name.replace(/\.[^.]+$/, ''));
          App.change('替换图片', () => {
            layer.assetId = asset.id;
          });
        } catch (error) {
          ui.toast(error.message || '替换失败', 'error');
        }
        return;
      }
      App.addImageFiles(files);
    });
    dom.projectInput.addEventListener('change', async () => {
      const [file] = dom.projectInput.files;
      dom.projectInput.value = '';
      if (file) await openProjectFromFile(file);
    });
    dom.fontInput.addEventListener('change', async () => {
      const files = [...dom.fontInput.files];
      dom.fontInput.value = '';
      if (files.length) await importFontFiles(files);
    });
  }

  /* ======================= help dialogs ======================= */

  function openShortcutsDialog() {
    const rows = [
      ['工具', 'V 选择 · W 变形 · H 抓手 · Z 缩放 · T 文字 · U 形状 · B 笔刷 · I 吸管 · G 生成器 · E 素材'],
      ['视图', '空格拖动平移 · 滚轮平移 · Ctrl+滚轮缩放 · Ctrl+0 适应 · Ctrl+1 100% · Ctrl+= / Ctrl+- 缩放'],
      ['编辑', 'Ctrl+Z 撤销 · Ctrl+Shift+Z / Ctrl+Y 重做 · Ctrl+C / X / V 复制剪切粘贴 · Ctrl+D 复制图层 · Delete 删除 · Ctrl+A 全选 · Esc 取消选择'],
      ['排列', 'Ctrl+] 上移 · Ctrl+[ 下移 · Ctrl+Shift+] 置顶 · Ctrl+Shift+[ 置底 · Ctrl+Alt+G 剪切蒙版 · 方向键微移（Shift ×10）'],
      ['变换', '边柄单向拉伸 · 角柄自由拉伸 · Shift 等比 · Alt 以中心 · Shift 旋转吸附 15° · Alt 拖动复制 · Ctrl 拖动关闭吸附'],
      ['文字', 'Enter / 双击编辑选中文字 · Ctrl+Enter 或 Esc 完成编辑'],
      ['文件', 'Ctrl+S 保存 · Ctrl+Shift+S 另存工程文件 · Ctrl+O 打开 · Ctrl+Alt+N 新建 · Ctrl+E 导出 · Ctrl+Shift+E 快速导出 PNG'],
      ['颜色', 'X 交换前景色 / 备用色'],
    ];
    ui.openDialog({
      title: '快捷键',
      width: 640,
      body: `<div class="shortcut-table">${rows.map(([title, text]) => `<div class="shortcut-row"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`).join('')}</div>`,
      buttons: [{ label: '知道了', kind: 'primary', value: true }],
    });
  }

  function openAboutDialog() {
    ui.openDialog({
      title: '数据存储说明',
      width: 520,
      body: cloudOn() ? `
        <div class="about-text">
          <p><strong>云端工程库</strong>：工程、图片、缩略图和导入字体自动保存到本站服务器上你的账号「${escapeHtml(CC.cloud.user()?.username || '')}」下，换电脑或浏览器登录同一账号即可继续编辑。每次改动约 1 秒后保存；断网时会保留改动并自动重试。</p>
          <p><strong>保存到本地</strong>：「文件 → 另存为工程文件」把工程下载为 .chaos 文件（单个 JSON，内含图片和用到的导入字体），可随时用「打开工程文件」导入回来；「导出图片」输出 PNG / JPG / WEBP。</p>
          <p><strong>多处同时编辑</strong>：同一工程在两个窗口或设备上同时修改时，后保存的一方会收到提示，可选择加载云端版本或用当前窗口覆盖。</p>
          <p><strong>空间</strong>：每个账号有空间上限，用量显示在工程主页底部；删除工程会同时删除其中的图片。</p>
          <p><strong>账号</strong>：本站不收集邮箱。忘记密码请联系站点管理员重置；注销账号会永久删除云端的全部数据。</p>
        </div>` : `
        <div class="about-text">
          <p><strong>工程库</strong>：所有工程、图片和导入字体都自动保存在当前浏览器配置文件的 IndexedDB 中，不上传任何服务器。</p>
          <p><strong>不同打开方式是不同的库</strong>：直接打开 index.html（file://）与通过本地服务器（http://127.0.0.1:8080）打开时，浏览器把它们视为不同来源，工程库互不可见；Chrome 与 Edge、同一浏览器的不同用户 / 无痕窗口也各有一个库。桌面快捷方式使用 Chrome（没有时用 Edge）的 file:// 方式。当前位置：${escapeHtml(storageLocation())}。</p>
          <p><strong>浏览器设置</strong>：如果开启了「关闭所有窗口时清除 Cookie 及网站数据」，或用清理软件清理浏览器，工程库会在重启后被清空。</p>
          <p><strong>关联工程文件</strong>：用「另存为工程文件」保存一次后，该工程就关联了这个 .chaos 文件。之后自动保存会顺带写入它（浏览器重启后需要按一次 Ctrl+S 重新授权）。</p>
          <p><strong>备份与迁移</strong>：用「文件 → 另存为工程文件」导出 .chaos（单个 JSON 文件，内含图片和用到的导入字体），可在其他电脑或浏览器里用「打开工程文件」恢复。清除浏览器数据会删除工程库，请定期导出重要工程。</p>
          <p><strong>持久存储</strong>：可在工程主页底部申请持久存储，降低浏览器在磁盘紧张时自动清理的可能。</p>
        </div>`,
      buttons: [{ label: '好的', kind: 'primary', value: true }],
    });
  }

  /* ======================= menus ======================= */

  function shapeSubmenu() {
    return App.SHAPE_TYPES.map(([type, label, iconName]) => ({ label, icon: iconName, action: () => App.addLayer(M.createShape(state.doc, type, { fill: state.opts.fg }), { label: `添加${label}` }) }))
      .concat([{ separator: true }, { label: '条形码', action: () => App.addLayer(M.createShape(state.doc, 'barcode'), { label: '添加条形码' }) }, { label: '胶带', action: () => App.addLayer(M.createShape(state.doc, 'tape'), { label: '添加胶带' }) }]);
  }

  function addMenuItems() {
    const disabled = !state.doc;
    return [
      { label: '文字', icon: 'text', disabled, action: () => App.addLayer(M.createText(state.doc, 'TYPE', { fill: state.opts.fg, fontFamily: state.opts.textFamily }), { label: '添加文字' }) },
      { label: '形状', icon: 'shape', disabled, submenu: disabled ? [] : shapeSubmenu() },
      { label: '错误窗口', icon: 'window', disabled, action: () => App.addLayer(M.createWindow(state.doc), { label: '添加窗口' }) },
      { label: '生成器…', icon: 'gen', disabled, action: () => App.toggleFlyout('generators') },
      { label: '素材贴纸…', icon: 'sticker', disabled, action: () => App.toggleFlyout('elements') },
      { label: '图片…', icon: 'image', disabled, action: () => chooseImages() },
    ];
  }

  function effectSubmenu() {
    return App.effectMenuItems((type) => App.addEffectToSelection(type));
  }

  function layerItems(hasLayer) {
    const layer = App.primaryLayer();
    const none = !hasLayer || !layer;
    return [
      { label: '置于顶层', shortcut: 'Ctrl+Shift+]', disabled: none, action: () => App.moveLayers('front') },
      { label: '上移一层', shortcut: 'Ctrl+]', disabled: none, action: () => App.moveLayers('forward') },
      { label: '下移一层', shortcut: 'Ctrl+[', disabled: none, action: () => App.moveLayers('backward') },
      { label: '置于底层', shortcut: 'Ctrl+Shift+[', disabled: none, action: () => App.moveLayers('back') },
      { separator: true },
      { label: '水平翻转', icon: 'flipH', disabled: none, action: () => App.flipSelection('x') },
      { label: '垂直翻转', icon: 'flipV', disabled: none, action: () => App.flipSelection('y') },
      {
        label: '对齐',
        disabled: none,
        submenu: [['left', '左对齐', 'alignLeft'], ['hcenter', '水平居中', 'alignCenter'], ['right', '右对齐', 'alignRight'], ['top', '顶对齐', 'alignTop'], ['vcenter', '垂直居中', 'alignMiddle'], ['bottom', '底对齐', 'alignBottom']].map(([mode, label, iconName]) => ({ label, icon: iconName, action: () => App.alignSelection(mode) })),
      },
      { label: '分布', disabled: state.selection.length < 3, submenu: [{ label: '水平分布', icon: 'distH', action: () => App.distributeSelection('x') }, { label: '垂直分布', icon: 'distV', action: () => App.distributeSelection('y') }] },
      { separator: true },
      { label: '添加效果', icon: 'fx', disabled: none, submenu: none ? [] : effectSubmenu() },
      { label: '变形预设', icon: 'warp', disabled: none, submenu: none ? [] : App.warpPresetItems() },
      { label: '重置变形', disabled: none || !CC.warp.isActive(layer?.warp), action: () => App.resetWarp() },
      { separator: true },
      { label: '剪切蒙版', shortcut: 'Ctrl+Alt+G', checked: !!layer?.clip, disabled: none, action: () => App.toggleLayerFlag(layer.id, 'clip', layer.clip ? '取消剪切蒙版' : '创建剪切蒙版') },
      { label: layer?.locked ? '解锁' : '锁定', icon: layer?.locked ? 'unlock' : 'lock', disabled: none, action: () => App.toggleLayerFlag(layer.id, 'locked', layer.locked ? '解锁图层' : '锁定图层') },
      { label: layer?.visible === false ? '显示' : '隐藏', icon: 'eye', disabled: none, action: () => App.toggleLayerFlag(layer.id, 'visible', layer.visible ? '隐藏图层' : '显示图层') },
      { label: '栅格化图层', icon: 'bake', disabled: none, action: () => App.rasterizeSelection() },
    ];
  }

  function canvasPresetSubmenu() {
    return M.PRESETS.map((group) => ({
      label: group.name,
      submenu: group.items.map((preset) => ({ label: `${preset.name} · ${preset.w}×${preset.h}`, action: () => openCanvasSizeDialog({ w: preset.w, h: preset.h }) })),
    }));
  }

  function menubarMenus() {
    const hasDoc = !!state.doc;
    const hasSel = state.selection.length > 0;
    return {
      file: [
        { label: '工程主页', icon: 'home', action: () => App.closeProject() },
        { label: '新建工程…', icon: 'plus', shortcut: 'Ctrl+Alt+N', action: () => openNewProjectDialog() },
        { label: '打开工程文件…', icon: 'folder', shortcut: 'Ctrl+O', action: () => openProjectFile() },
        { separator: true },
        { label: '保存', icon: 'save', shortcut: 'Ctrl+S', disabled: !hasDoc, action: () => saveCommand() },
        { label: '另存为工程文件…', shortcut: 'Ctrl+Shift+S', disabled: !hasDoc, action: () => saveAsFile() },
        { separator: true },
        { label: '导入图片…', icon: 'image', disabled: !hasDoc, action: () => chooseImages() },
        { label: '导入字体…', icon: 'font', action: () => chooseFonts() },
        { separator: true },
        { label: '导出图片…', icon: 'export', shortcut: 'Ctrl+E', disabled: !hasDoc, action: () => openExportDialog() },
        { label: '快速导出 PNG', shortcut: 'Ctrl+Shift+E', disabled: !hasDoc, action: () => quickExport() },
        { separator: true },
        { label: '关闭工程', disabled: !hasDoc, action: () => App.closeProject() },
        ...(cloudOn() ? [{ separator: true }, { label: '账号', icon: 'user', submenu: CC.cloud.accountMenuItems() }] : []),
      ],
      edit: [
        { label: '撤销', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !state.history.length, action: () => App.undo() },
        { label: '重做', icon: 'redo', shortcut: 'Ctrl+Shift+Z', disabled: !state.future.length, action: () => App.redo() },
        { separator: true },
        { label: '剪切', shortcut: 'Ctrl+X', disabled: !hasSel, action: () => App.copySelection(true) },
        { label: '复制', shortcut: 'Ctrl+C', disabled: !hasSel, action: () => App.copySelection(false) },
        { label: '粘贴', shortcut: 'Ctrl+V', disabled: !hasDoc || !state.clipboard, action: () => App.pasteClipboard() },
        { label: '复制图层', icon: 'duplicate', shortcut: 'Ctrl+D', disabled: !hasSel, action: () => App.duplicateSelection() },
        { label: '删除', icon: 'trash', shortcut: 'Delete', disabled: !hasSel, action: () => App.deleteSelection() },
        { separator: true },
        { label: '全选', shortcut: 'Ctrl+A', disabled: !hasDoc, action: () => App.selectAll() },
        { label: '取消选择', shortcut: 'Esc', disabled: !hasSel, action: () => App.select([]) },
        { separator: true },
        { label: '随机重排（选中或全部）', icon: 'remix', disabled: !hasDoc, action: () => App.remixSelectionOrAll() },
        { label: '换随机种子', disabled: !hasDoc, action: () => App.reseed() },
      ],
      image: [
        { label: '画布大小…', disabled: !hasDoc, action: () => openCanvasSizeDialog() },
        { label: '画布预设', disabled: !hasDoc, submenu: hasDoc ? canvasPresetSubmenu() : [] },
        { separator: true },
        { label: '透明背景', checked: !!state.doc?.transparent, disabled: !hasDoc, action: () => App.change('切换透明背景', () => { state.doc.transparent = !state.doc.transparent; }) },
        { label: '背景颜色…', disabled: !hasDoc, action: () => { App.select([]); App.focusInspectorContent?.(); } },
      ],
      layer: [
        { label: '新建', icon: 'plus', disabled: !hasDoc, submenu: addMenuItems() },
        { separator: true },
        ...layerItems(hasSel),
      ],
      view: [
        { label: '放大', icon: 'plus', shortcut: 'Ctrl+=', disabled: !hasDoc, action: () => App.zoomStep(1) },
        { label: '缩小', icon: 'minus', shortcut: 'Ctrl+-', disabled: !hasDoc, action: () => App.zoomStep(-1) },
        { label: '适应窗口', shortcut: 'Ctrl+0', disabled: !hasDoc, action: () => App.fitView() },
        { label: '100% 实际像素', shortcut: 'Ctrl+1', disabled: !hasDoc, action: () => App.zoomTo(1) },
        { separator: true },
        { label: '显示网格', checked: state.opts.grid, action: () => { state.opts.grid = !state.opts.grid; App.renderOptionsBar(); App.requestRender('overlay'); } },
        { label: '网格间距', submenu: [10, 20, 25, 50, 100, 200].map((size) => ({ label: `${size} px`, checked: state.opts.gridSize === size, action: () => { state.opts.gridSize = size; state.opts.grid = true; App.renderOptionsBar(); App.requestRender('overlay'); } })) },
        { label: '智能吸附', checked: state.opts.snap, action: () => { state.opts.snap = !state.opts.snap; App.renderOptionsBar(); } },
      ],
      help: [
        { label: '快捷键…', icon: 'keyboard', action: () => openShortcutsDialog() },
        { label: '数据存储说明…', icon: 'info', action: () => openAboutDialog() },
      ],
    };
  }

  function setupMenubar() {
    const bar = dom.menubar;
    let activeKey = null;
    const open = (button) => {
      const key = button.dataset.menuTrigger;
      activeKey = key;
      bar.querySelectorAll('[data-menu-trigger]').forEach((item) => item.classList.toggle('open', item === button));
      const rect = button.getBoundingClientRect();
      ui.openMenuAt({ left: rect.left, top: rect.bottom + 2, bottom: rect.top }, menubarMenus()[key], {
        minWidth: 220,
        onClose: () => {
          if (activeKey === key) {
            activeKey = null;
            bar.querySelectorAll('[data-menu-trigger]').forEach((item) => item.classList.remove('open'));
          }
        },
      });
    };
    bar.addEventListener('mousedown', (event) => {
      const button = event.target.closest('[data-menu-trigger]');
      if (!button) return;
      event.preventDefault();
      if (activeKey === button.dataset.menuTrigger) ui.closeMenus();
      else open(button);
    });
    bar.addEventListener('mouseover', (event) => {
      const button = event.target.closest('[data-menu-trigger]');
      if (button && activeKey && activeKey !== button.dataset.menuTrigger) open(button);
    });
    bar.addEventListener('keydown', (event) => {
      const button = event.target.closest('[data-menu-trigger]');
      if (button && (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === ' ')) {
        event.preventDefault();
        open(button);
      }
    });
  }

  function openContextMenu(x, y, onLayer, under = []) {
    /* every layer under the cursor, so covered layers can be picked directly */
    const pick = under.length > 1
      ? [{
        label: '选择图层',
        icon: 'layers',
        submenu: under.map((layer) => ({
          label: layer.name || M.TYPE_NAMES?.[layer.type] || layer.type,
          checked: state.selection.includes(layer.id),
          action: () => App.select(layer.id),
        })),
      }, { separator: true }]
      : [];
    const items = onLayer
      ? [
        ...pick,
        { label: '剪切', shortcut: 'Ctrl+X', action: () => App.copySelection(true) },
        { label: '复制', shortcut: 'Ctrl+C', action: () => App.copySelection(false) },
        { label: '粘贴', shortcut: 'Ctrl+V', disabled: !state.clipboard, action: () => App.pasteClipboard() },
        { label: '复制图层', shortcut: 'Ctrl+D', action: () => App.duplicateSelection() },
        { label: '删除', shortcut: 'Delete', danger: true, action: () => App.deleteSelection() },
        { separator: true },
        ...layerItems(true),
      ]
      : [
        { label: '粘贴', shortcut: 'Ctrl+V', disabled: !state.clipboard, action: () => App.pasteClipboard() },
        { label: '全选', shortcut: 'Ctrl+A', action: () => App.selectAll() },
        { separator: true },
        { label: '新建', icon: 'plus', submenu: addMenuItems() },
        { separator: true },
        { label: '画布大小…', action: () => openCanvasSizeDialog() },
        { label: '适应窗口', shortcut: 'Ctrl+0', action: () => App.fitView() },
      ];
    ui.openMenuAt({ left: x, top: y }, items);
  }

  Object.assign(App, {
    showHome,
    hideHome,
    renderHome,
    setupHome,
    openNewProjectDialog,
    openCanvasSizeDialog,
    openExportDialog,
    quickExport,
    saveCommand,
    saveAsFile,
    autoWriteLinkedFile,
    openProjectFile,
    openProjectFromFile,
    chooseImages,
    chooseFonts,
    importFontFiles,
    setupFileInputs,
    setupMenubar,
    openContextMenu,
    addMenuItems,
    openShortcutsDialog,
  });
})();
