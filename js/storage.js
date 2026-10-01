/* CHAOS.COLLAGE — persistence (CC.storage)
   IndexedDB library of projects, image assets, imported fonts and settings,
   plus the portable .chaos project file format (JSON with embedded data). */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const { blobToDataUrl, dataUrlToBlob } = CC.util;

  const DB_NAME = 'chaos-collage';
  const DB_VERSION = 1;
  const FILE_FORMAT = 'chaos-collage-project';
  const FILE_VERSION = 2;

  let dbPromise = null;
  let memoryFallback = null;

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) {
          const assets = db.createObjectStore('assets', { keyPath: 'key' });
          assets.createIndex('projectId', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains('fonts')) db.createObjectStore('fonts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles', { keyPath: 'projectId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    }).then((db) => {
      if (!db) {
        memoryFallback = {
          projects: new Map(),
          assets: new Map(),
          fonts: new Map(),
          settings: new Map(),
          handles: new Map(),
        };
      }
      return db;
    });
    return dbPromise;
  }

  function isPersistent() {
    return !memoryFallback;
  }

  async function tx(storeName, mode, run) {
    const db = await open();
    if (!db) return run(null);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      Promise.resolve(run(store)).then((value) => {
        result = value;
      }, reject);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('transaction aborted'));
    });
  }

  /* ---- projects ---- */

  async function listProjects() {
    await open();
    if (memoryFallback) return [...memoryFallback.projects.values()].map(summary);
    const all = await tx('projects', 'readonly', (store) => requestToPromise(store.getAll()));
    return (all || []).map(summary).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function summary(record) {
    return {
      id: record.id,
      name: record.name,
      width: record.width,
      height: record.height,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      thumb: record.thumb || null,
      layerCount: record.doc?.layers?.length || 0,
      fileName: record.fileName || '',
    };
  }

  async function getProject(id) {
    await open();
    if (memoryFallback) return memoryFallback.projects.get(id) || null;
    return tx('projects', 'readonly', (store) => requestToPromise(store.get(id)));
  }

  async function putProject(record) {
    await open();
    if (memoryFallback) {
      memoryFallback.projects.set(record.id, record);
      return record;
    }
    await tx('projects', 'readwrite', (store) => requestToPromise(store.put(record)));
    return record;
  }

  async function renameProject(id, name) {
    const record = await getProject(id);
    if (!record) return null;
    record.name = name;
    if (record.doc) record.doc.name = name;
    record.updatedAt = Date.now();
    return putProject(record);
  }

  async function deleteProject(id) {
    await open();
    if (memoryFallback) {
      memoryFallback.projects.delete(id);
      for (const key of [...memoryFallback.assets.keys()]) if (key.startsWith(`${id}/`)) memoryFallback.assets.delete(key);
      memoryFallback.handles.delete(id);
      return;
    }
    await tx('projects', 'readwrite', (store) => requestToPromise(store.delete(id)));
    const assets = await getAssets(id);
    await tx('assets', 'readwrite', (store) => Promise.all(assets.map((asset) => requestToPromise(store.delete(asset.key)))));
    await tx('handles', 'readwrite', (store) => requestToPromise(store.delete(id)));
  }

  /* ---- assets (per project, content addressed ids) ---- */

  async function putAsset(projectId, asset) {
    await open();
    const record = {
      key: `${projectId}/${asset.id}`,
      projectId,
      id: asset.id,
      name: asset.name || '',
      mime: asset.mime || asset.blob?.type || 'image/png',
      width: asset.width || 0,
      height: asset.height || 0,
      size: asset.blob?.size || 0,
      blob: asset.blob,
    };
    if (memoryFallback) {
      memoryFallback.assets.set(record.key, record);
      return record;
    }
    await tx('assets', 'readwrite', (store) => requestToPromise(store.put(record)));
    return record;
  }

  async function getAssets(projectId) {
    await open();
    if (memoryFallback) return [...memoryFallback.assets.values()].filter((item) => item.projectId === projectId);
    return tx('assets', 'readonly', (store) => requestToPromise(store.index('projectId').getAll(projectId)));
  }

  async function deleteAsset(projectId, assetId) {
    await open();
    const key = `${projectId}/${assetId}`;
    if (memoryFallback) {
      memoryFallback.assets.delete(key);
      return;
    }
    await tx('assets', 'readwrite', (store) => requestToPromise(store.delete(key)));
  }

  async function copyAssets(fromProjectId, toProjectId) {
    const assets = await getAssets(fromProjectId);
    for (const asset of assets) await putAsset(toProjectId, asset);
    return assets.length;
  }

  /* ---- fonts (global library) ---- */

  async function putFont(font) {
    await open();
    if (memoryFallback) {
      memoryFallback.fonts.set(font.id, font);
      return font;
    }
    await tx('fonts', 'readwrite', (store) => requestToPromise(store.put(font)));
    return font;
  }

  async function listFonts() {
    await open();
    if (memoryFallback) return [...memoryFallback.fonts.values()];
    return (await tx('fonts', 'readonly', (store) => requestToPromise(store.getAll()))) || [];
  }

  async function deleteFont(id) {
    await open();
    if (memoryFallback) {
      memoryFallback.fonts.delete(id);
      return;
    }
    await tx('fonts', 'readwrite', (store) => requestToPromise(store.delete(id)));
  }

  /* ---- settings & file handles ---- */

  async function getSetting(key, fallback = null) {
    await open();
    if (memoryFallback) return memoryFallback.settings.has(key) ? memoryFallback.settings.get(key) : fallback;
    const record = await tx('settings', 'readonly', (store) => requestToPromise(store.get(key)));
    return record ? record.value : fallback;
  }

  async function setSetting(key, value) {
    await open();
    if (memoryFallback) {
      memoryFallback.settings.set(key, value);
      return;
    }
    await tx('settings', 'readwrite', (store) => requestToPromise(store.put({ key, value })));
  }

  async function getHandle(projectId) {
    await open();
    if (memoryFallback) return memoryFallback.handles.get(projectId) || null;
    try {
      const record = await tx('handles', 'readonly', (store) => requestToPromise(store.get(projectId)));
      return record ? record.handle : null;
    } catch (error) {
      return null;
    }
  }

  async function setHandle(projectId, handle) {
    await open();
    if (memoryFallback) {
      memoryFallback.handles.set(projectId, handle);
      return;
    }
    try {
      await tx('handles', 'readwrite', (store) => requestToPromise(store.put({ projectId, handle })));
    } catch (error) {
      /* some browsers cannot structured-clone handles; keep the in-memory one */
    }
  }

  async function estimate() {
    try {
      if (navigator.storage?.estimate) return await navigator.storage.estimate();
    } catch (error) {
      /* ignore */
    }
    return null;
  }

  async function persisted() {
    try {
      if (navigator.storage?.persisted) return await navigator.storage.persisted();
    } catch (error) {
      /* ignore */
    }
    return false;
  }

  async function requestPersist() {
    try {
      if (navigator.storage?.persist) return await navigator.storage.persist();
    } catch (error) {
      /* ignore */
    }
    return false;
  }

  /* ---- .chaos project file ---- */

  async function buildProjectFile(doc, assets, fonts = []) {
    const assetEntries = [];
    for (const asset of assets) {
      if (!asset.blob) continue;
      assetEntries.push({
        id: asset.id,
        name: asset.name || '',
        mime: asset.mime || asset.blob.type,
        width: asset.width || 0,
        height: asset.height || 0,
        data: await blobToDataUrl(asset.blob),
      });
    }
    const fontEntries = [];
    for (const font of fonts) {
      if (!font.blob) continue;
      fontEntries.push({
        id: font.id,
        family: font.family,
        fileName: font.fileName || '',
        mime: font.mime || font.blob.type || 'font/ttf',
        data: await blobToDataUrl(font.blob),
      });
    }
    const payload = {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      app: 'CHAOS.COLLAGE',
      savedAt: new Date().toISOString(),
      doc,
      assets: assetEntries,
      fonts: fontEntries,
    };
    return new Blob([JSON.stringify(payload)], { type: 'application/json' });
  }

  async function parseProjectFile(text) {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error('不是有效的工程文件（JSON 解析失败）');
    }
    if (!payload || payload.format !== FILE_FORMAT || !payload.doc) {
      throw new Error('不是 CHAOS.COLLAGE 工程文件');
    }
    if (payload.version > FILE_VERSION) {
      throw new Error(`工程文件版本 ${payload.version} 高于当前程序支持的 ${FILE_VERSION}`);
    }
    const assets = [];
    for (const entry of payload.assets || []) {
      if (!entry?.data) continue;
      assets.push({
        id: entry.id,
        name: entry.name || '',
        mime: entry.mime,
        width: entry.width || 0,
        height: entry.height || 0,
        blob: await dataUrlToBlob(entry.data),
      });
    }
    const fonts = [];
    for (const entry of payload.fonts || []) {
      if (!entry?.data) continue;
      fonts.push({
        id: entry.id,
        family: entry.family,
        fileName: entry.fileName || '',
        mime: entry.mime,
        blob: await dataUrlToBlob(entry.data),
      });
    }
    return { doc: payload.doc, assets, fonts };
  }

  CC.storage = {
    open,
    isPersistent,
    listProjects,
    getProject,
    putProject,
    renameProject,
    deleteProject,
    putAsset,
    getAssets,
    deleteAsset,
    copyAssets,
    putFont,
    listFonts,
    deleteFont,
    getSetting,
    setSetting,
    getHandle,
    setHandle,
    estimate,
    persisted,
    requestPersist,
    buildProjectFile,
    parseProjectFile,
    FILE_EXTENSION: '.chaos',
  };
})();
