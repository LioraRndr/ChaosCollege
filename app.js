/* CHAOS.COLLAGE — bootstrap. Wires the DOM to CC.App and restores the
   local font library and preferences, then opens the project home screen. */
(() => {
  'use strict';

  const CC = window.CC;
  const App = CC.App;
  const { state, dom } = App;

  function collectDom() {
    const byId = (id) => document.getElementById(id);
    Object.assign(dom, {
      viewport: byId('viewport'),
      art: byId('artCanvas'),
      overlay: byId('overlayCanvas'),
      textEditor: byId('textEditor'),
      dropOverlay: byId('dropOverlay'),
      flyout: byId('flyout'),
      home: byId('home'),
      menubar: byId('menubar'),
      homeButton: byId('homeButton'),
      docName: byId('docName'),
      saveState: byId('saveState'),
      undoButton: byId('undoButton'),
      redoButton: byId('redoButton'),
      exportButton: byId('exportButton'),
      toolrail: byId('toolrail'),
      optionsBar: byId('optionsBar'),
      zoomOut: byId('zoomOut'),
      zoomIn: byId('zoomIn'),
      zoomFit: byId('zoomFit'),
      zoomValue: byId('zoomValue'),
      layersList: byId('layersList'),
      layerAddButton: byId('layerAddButton'),
      layerDuplicateButton: byId('layerDuplicateButton'),
      layerDeleteButton: byId('layerDeleteButton'),
      resourcesPanel: byId('resourcesPanel'),
      historyPanel: byId('historyPanel'),
      historyList: byId('historyList'),
      inspector: byId('inspector'),
      inspectorBadge: byId('inspectorBadge'),
      statusText: byId('statusText'),
      statusPos: byId('statusPos'),
      statusDoc: byId('statusDoc'),
      seedButton: byId('seedButton'),
      imageInput: byId('imageInput'),
      projectInput: byId('projectInput'),
      fontInput: byId('fontInput'),
    });
  }

  /* Served by the cloud server: sign in (or pick the local trial) first, so
     the project library and imported fonts come from the account. */
  async function connectCloud() {
    if (!(await CC.cloud.detect())) return;
    let user = await CC.cloud.refreshUser().catch(() => null);
    if (!user) user = await CC.cloud.showAuthGate();
    if (user) CC.cloud.enable();
  }

  async function restoreLibrary() {
    await connectCloud();
    await CC.storage.open();
    const fonts = await CC.storage.listFonts();
    for (const record of fonts) {
      try {
        await CC.fonts.registerRecord(record);
      } catch (error) {
        console.warn('font restore failed', record.family, error);
      }
    }
    CC.fonts.setLocalFamilies(await CC.storage.getSetting('localFontFamilies', []));
    state.recentFonts = await CC.storage.getSetting('recentFonts', []);
    const opts = await CC.storage.getSetting('opts', null);
    if (opts) Object.assign(state.opts, { snap: opts.snap !== false, grid: !!opts.grid });
  }

  async function init() {
    collectDom();
    CC.ui.hydrateIcons();
    App.setupPanels();
    App.setupInteraction();
    App.setupHome();
    App.setupMenubar();
    App.setupFileInputs();
    dom.exportButton.addEventListener('click', () => App.openExportDialog());
    dom.homeButton.addEventListener('click', () => App.closeProject());
    new ResizeObserver(() => App.resizeViewport()).observe(dom.viewport);
    window.addEventListener('pagehide', () => App.flushSave());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') App.flushSave();
    });
    window.addEventListener('beforeunload', (event) => {
      if (state.dirty || state.saving) {
        App.flushSave();
        event.preventDefault();
        event.returnValue = '';
      }
    });
    await restoreLibrary();
    CC.fonts.onChange(() => App.refreshFonts());
    document.fonts?.addEventListener?.('loadingdone', () => App.refreshFonts());
    App.renderAll();
    App.showHome();
  }

  init().catch((error) => {
    console.error(error);
    CC.ui.toast(`初始化失败：${error.message || error}`, 'error');
  });
})();
