/* CHAOS.COLLAGE — smart cutout engine (CC.cutout)
   Removes the background of an image with a segmentation model that runs in
   this browser: nothing is uploaded. The runtime (ONNX Runtime Web) and the
   model (BiRefNet_lite 512) are listed in cutout-manifest.js, downloaded on
   first use, checked against their SHA-256 and kept in IndexedDB, so later
   runs work offline. Inference happens in a Worker: WebGPU when the adapter
   supports half floats, otherwise WebAssembly on the CPU.
   The model returns a 512×512 matte; compose() stretches it over the image,
   adjusts the edge and writes it into the alpha channel. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const U = CC.util;
  const MANIFEST = CC.cutoutManifest;
  const DB_NAME = 'chaos-collage-cutout';
  const STORE = 'files';
  const IDLE_MS = 180000;
  const CPU_KEY = 'chaos-collage-cutout-cpu';

  /* ---------------- component cache (IndexedDB) ---------------- */

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'name' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('存储写入被中止'));
    });
  }

  const entryFor = (name) => MANIFEST.files.find((file) => file.name === name);
  const isCurrent = (record, entry) => !!record && record.sha256 === entry.sha256 && record.blob?.size === entry.size;

  async function cachedBlob(entry) {
    const record = await withStore('readonly', (store) => store.get(entry.name)).catch(() => null);
    return isCurrent(record, entry) ? record.blob : null;
  }

  /* drop components from an older manifest */
  async function pruneCache() {
    const keys = await withStore('readonly', (store) => store.getAllKeys()).catch(() => []);
    const stale = (keys || []).filter((key) => !entryFor(key));
    if (stale.length) await withStore('readwrite', (store) => stale.forEach((key) => store.delete(key))).catch(() => {});
  }

  async function clearCache() {
    disposeEngine();
    await withStore('readwrite', (store) => store.clear());
  }

  /* ---------------- where the components come from ---------------- */

  /* 'server': the cloud server mirrors the files (its CSP blocks other hosts)
     'cdn':    file:// or a plain static server: public CDNs
     'off':    cloud server with the mirror switched off */
  function source() {
    const config = CC.cloud?.config?.();
    if (!config) return 'cdn';
    return config.cutout ? 'server' : 'off';
  }

  const serverUrl = (name) => new URL(MANIFEST.serverBase + name, location.href).href;

  /* in server mode the two small scripts are loaded by URL (CSP: 'self') */
  function neededFiles() {
    if (source() !== 'server') return MANIFEST.files;
    return [MANIFEST.runtime.wasm, MANIFEST.model.file].map(entryFor);
  }

  async function status() {
    const files = neededFiles();
    let missing = 0;
    for (const entry of files) {
      if (!(await cachedBlob(entry))) missing += entry.size;
    }
    return {
      source: source(),
      total: files.reduce((sum, entry) => sum + entry.size, 0),
      missing,
      cached: missing === 0,
      model: MANIFEST.model,
      runtime: MANIFEST.runtime,
    };
  }

  function aborted(signal) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  }

  async function readBody(response, entry, signal, onBytes) {
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      aborted(signal);
      chunks.push(value);
      loaded += value.byteLength;
      if (loaded > entry.size) {
        reader.cancel().catch(() => {});
        throw new Error('文件大小不符');
      }
      onBytes(loaded);
    }
    if (loaded !== entry.size) throw new Error('文件不完整');
    return new Blob(chunks, { type: 'application/octet-stream' });
  }

  async function download(entry, { signal, onBytes }) {
    const fromServer = source() === 'server';
    const urls = fromServer ? [serverUrl(entry.name)] : entry.urls;
    let lastError = null;
    for (const url of urls) {
      aborted(signal);
      try {
        const response = await fetch(url, { signal, credentials: fromServer ? 'same-origin' : 'omit', cache: 'no-store' });
        if (!response.ok) {
          let message = `下载失败（${response.status}）`;
          if (fromServer) message = (await response.json().catch(() => null))?.message || message;
          throw new Error(message);
        }
        const blob = await readBody(response, entry, signal, onBytes);
        /* subtle crypto needs a secure context; a plain-HTTP deployment only
           ever fetches from its own server */
        if (window.crypto?.subtle) {
          const hash = await U.sha256Hex(await blob.arrayBuffer());
          if (hash !== entry.sha256) throw new Error('文件校验失败');
        } else if (!fromServer) throw new Error('当前页面无法校验下载内容');
        return blob;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        lastError = error;
        onBytes(0);
      }
    }
    throw new Error(`无法下载抠图组件：${lastError?.message || '网络错误'}`);
  }

  /* resolves to { name: Blob } for every needed file, downloading what is missing */
  async function ensureFiles({ signal, onProgress } = {}) {
    if (source() === 'off') throw new Error('这台服务器没有开启智能抠图（CC_CUTOUT=0）');
    pruneCache();
    const files = neededFiles();
    const blobs = {};
    const pending = [];
    for (const entry of files) {
      const blob = await cachedBlob(entry);
      if (blob) blobs[entry.name] = blob;
      else pending.push(entry);
    }
    const total = pending.reduce((sum, entry) => sum + entry.size, 0);
    let done = 0;
    for (const entry of pending) {
      const blob = await download(entry, {
        signal,
        onBytes: (loaded) => onProgress?.({ stage: 'download', loaded: done + loaded, total }),
      });
      done += entry.size;
      blobs[entry.name] = blob;
      /* a full disk only costs the cache, not this run */
      await withStore('readwrite', (store) => store.put({ name: entry.name, sha256: entry.sha256, size: entry.size, blob, time: Date.now() })).catch((error) => console.warn('cutout cache write failed', error));
    }
    return blobs;
  }

  /* ---------------- inference worker ---------------- */

  /* Runs inside the Worker: must not touch anything outside its own body. */
  function workerMain() {
    let session = null;
    let backend = '';
    let config = null;
    let modelBytes = null;

    async function gpuUsable() {
      try {
        if (!self.navigator.gpu) return false;
        const adapter = await self.navigator.gpu.requestAdapter();
        /* the model is stored as half floats */
        return !!adapter && adapter.features.has('shader-f16');
      } catch (error) {
        return false;
      }
    }

    async function createSession(provider) {
      session = await self.ort.InferenceSession.create(modelBytes, { executionProviders: [provider], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
      backend = provider;
    }

    async function init(message) {
      config = message.config;
      importScripts(message.scriptBlob ? URL.createObjectURL(message.scriptBlob) : message.scriptUrl);
      const env = self.ort.env;
      env.logLevel = 'error';
      env.wasm.wasmPaths = { mjs: message.moduleBlob ? URL.createObjectURL(message.moduleBlob) : message.moduleUrl };
      env.wasm.wasmBinary = message.wasm;
      env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 1) : 1;
      modelBytes = new Uint8Array(message.model);
      const providers = message.allowGpu && (await gpuUsable()) ? ['webgpu', 'wasm'] : ['wasm'];
      let failure = null;
      for (const provider of providers) {
        try {
          await createSession(provider);
          return;
        } catch (error) {
          failure = error;
        }
      }
      throw failure;
    }

    async function infer(pixels) {
      const size = config.input;
      const count = size * size;
      const rgba = new Uint8ClampedArray(pixels);
      const data = new Float32Array(3 * count);
      for (let channel = 0; channel < 3; channel += 1) {
        const scale = 1 / (255 * config.std[channel]);
        const offset = config.mean[channel] / config.std[channel];
        const base = channel * count;
        for (let i = 0; i < count; i += 1) data[base + i] = rgba[i * 4 + channel] * scale - offset;
      }
      const input = new self.ort.Tensor('float32', data, [1, 3, size, size]);
      const outputs = await session.run({ [session.inputNames[0]]: input });
      const logits = outputs[session.outputNames[0]].data;
      if (logits.length !== count) throw new Error('unexpected output size');
      const mask = new Uint8Array(count);
      for (let i = 0; i < count; i += 1) {
        const value = logits[i];
        if (value !== value) throw new Error('output contains NaN');
        mask[i] = 255 / (1 + Math.exp(-value)) + 0.5;
      }
      return mask;
    }

    async function run(message) {
      const started = performance.now();
      let mask;
      try {
        mask = await infer(message.pixels);
      } catch (error) {
        if (backend === 'wasm') throw error;
        /* a GPU driver that cannot run the graph: redo on the CPU */
        try {
          await session.release();
        } catch (releaseError) {
          /* already lost */
        }
        await createSession('wasm');
        mask = await infer(message.pixels);
      }
      self.postMessage({ type: 'result', id: message.id, mask, backend, ms: Math.round(performance.now() - started) }, [mask.buffer]);
    }

    let queue = Promise.resolve();
    self.onmessage = (event) => {
      const message = event.data;
      queue = queue.then(async () => {
        try {
          if (message.type === 'init') {
            await init(message);
            self.postMessage({ type: 'ready', id: message.id, backend, threads: self.ort.env.wasm.numThreads });
          } else if (message.type === 'run') await run(message);
        } catch (error) {
          self.postMessage({ type: 'error', id: message.id, message: String(error?.message || error) });
        }
      });
    };
  }

  let engine = null;
  let callId = 0;

  /* escape hatch for a graphics driver that returns a wrong matte */
  function prefersCpu() {
    try {
      return localStorage.getItem(CPU_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function setPrefersCpu(on) {
    try {
      if (on) localStorage.setItem(CPU_KEY, '1');
      else localStorage.removeItem(CPU_KEY);
    } catch (error) {
      /* storage blocked: applies to this run only */
    }
    if (engine && (engine.backend === 'webgpu') === !!on) disposeEngine();
    forceCpu = !!on;
  }

  let forceCpu = prefersCpu();

  function disposeEngine() {
    if (!engine) return;
    clearTimeout(engine.idleTimer);
    engine.worker.terminate();
    engine.calls.forEach((call) => call.reject(new Error('抠图引擎已停止')));
    engine = null;
  }

  function call(target, message, transfer = []) {
    return new Promise((resolve, reject) => {
      callId += 1;
      target.calls.set(callId, { resolve, reject });
      target.worker.postMessage({ ...message, id: callId }, transfer);
    });
  }

  function touchEngine() {
    clearTimeout(engine.idleTimer);
    engine.idleTimer = setTimeout(disposeEngine, IDLE_MS);
  }

  async function startEngine({ signal, onProgress }) {
    const blobs = await ensureFiles({ signal, onProgress });
    aborted(signal);
    onProgress?.({ stage: 'init' });
    const url = URL.createObjectURL(new Blob([`(${workerMain.toString()})();`], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    const created = { worker, calls: new Map(), backend: '', idleTimer: 0 };
    worker.onmessage = (event) => {
      const message = event.data;
      const pending = created.calls.get(message.id);
      if (!pending) return;
      created.calls.delete(message.id);
      if (message.type === 'error') pending.reject(new Error(message.message));
      else pending.resolve(message);
    };
    worker.onerror = (event) => {
      created.calls.forEach((pending) => pending.reject(new Error(event.message || '抠图引擎出错')));
      created.calls.clear();
      if (engine === created) disposeEngine();
    };
    const runtime = MANIFEST.runtime;
    const [wasm, model] = await Promise.all([blobs[runtime.wasm].arrayBuffer(), blobs[MANIFEST.model.file].arrayBuffer()]);
    const message = { type: 'init', config: MANIFEST.model, wasm, model, allowGpu: !forceCpu };
    if (source() === 'server') {
      message.scriptUrl = serverUrl(runtime.script);
      message.moduleUrl = serverUrl(runtime.module);
    } else {
      message.scriptBlob = new Blob([blobs[runtime.script]], { type: 'text/javascript' });
      message.moduleBlob = new Blob([blobs[runtime.module]], { type: 'text/javascript' });
    }
    try {
      const ready = await call(created, message, [wasm, model]);
      created.backend = ready.backend;
      created.threads = ready.threads;
    } catch (error) {
      worker.terminate();
      throw new Error(`抠图引擎启动失败：${error.message}`);
    }
    return created;
  }

  let starting = null;

  async function ensureEngine(options) {
    if (engine) return engine;
    if (!starting) {
      starting = startEngine(options).then((created) => {
        engine = created;
        return created;
      }).finally(() => {
        starting = null;
      });
    }
    return starting;
  }

  /* ---------------- segmentation ---------------- */

  /* source: anything drawImage accepts. Resolves to
     { mask: Uint8Array(size²), size, backend, ms } */
  async function segment(image, { signal, onProgress } = {}) {
    if (!isSupported()) throw new Error('当前浏览器不支持智能抠图，请使用新版 Chrome 或 Edge');
    const active = await ensureEngine({ signal, onProgress });
    aborted(signal);
    touchEngine();
    const size = MANIFEST.model.input;
    const canvas = U.makeCanvas(size, size);
    const ctx = U.context2d(canvas, true);
    /* transparent pixels count as white paper */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data.buffer;
    U.releaseCanvas(canvas);
    onProgress?.({ stage: 'infer', backend: active.backend });
    const result = await call(active, { type: 'run', pixels }, [pixels]);
    active.backend = result.backend;
    if (engine === active) touchEngine();
    aborted(signal);
    return { mask: result.mask, size, backend: result.backend, ms: result.ms, threads: active.threads || 1 };
  }

  function isSupported() {
    return typeof Worker === 'function' && typeof WebAssembly === 'object' && !!window.indexedDB && typeof ReadableStream === 'function';
  }

  /* ---------------- matte refinement and compositing ---------------- */

  /* mean over a (2r+1)² window; windows are clipped at the border */
  function boxMean(src, w, h, r) {
    const tmp = new Float32Array(w * h);
    const dst = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      let sum = 0;
      for (let x = 0; x <= Math.min(r, w - 1); x += 1) sum += src[row + x];
      for (let x = 0; x < w; x += 1) {
        tmp[row + x] = sum / (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1);
        if (x + r + 1 < w) sum += src[row + x + r + 1];
        if (x - r >= 0) sum -= src[row + x - r];
      }
    }
    const column = new Float32Array(w);
    for (let y = 0; y <= Math.min(r, h - 1); y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) column[x] += tmp[row + x];
    }
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      const inv = 1 / (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1);
      for (let x = 0; x < w; x += 1) dst[row + x] = column[x] * inv;
      if (y + r + 1 < h) {
        const add = (y + r + 1) * w;
        for (let x = 0; x < w; x += 1) column[x] += tmp[add + x];
      }
      if (y - r >= 0) {
        const sub = (y - r) * w;
        for (let x = 0; x < w; x += 1) column[x] -= tmp[sub + x];
      }
    }
    return dst;
  }

  /* three box passes ≈ gaussian of the given sigma */
  function blurField(field, w, h, sigma) {
    const r = Math.max(1, Math.round(sigma * 0.94));
    return boxMean(boxMean(boxMean(field, w, h, r), w, h, r), w, h, r);
  }

  /* model matte stretched to w×h: RGBA bytes with the matte in the alpha channel */
  function matteAt(seg, w, h) {
    const small = U.makeCanvas(seg.size, seg.size);
    const sctx = small.getContext('2d');
    const image = sctx.createImageData(seg.size, seg.size);
    for (let i = 0; i < seg.mask.length; i += 1) image.data[i * 4 + 3] = seg.mask[i];
    sctx.putImageData(image, 0, 0);
    const big = U.makeCanvas(w, h);
    const bctx = U.context2d(big, true);
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(small, 0, 0, w, h);
    const data = bctx.getImageData(0, 0, w, h).data;
    U.releaseCanvas(small);
    U.releaseCanvas(big);
    return data;
  }

  /* opts: shift -1..1 (contract / expand the edge), feather 0..1.
     Returns { canvas, bbox }; bbox is null when nothing is left. */
  function compose(image, width, height, seg, opts = {}) {
    const W = Math.max(1, Math.round(width));
    const H = Math.max(1, Math.round(height));
    const canvas = U.makeCanvas(W, H);
    const ctx = U.context2d(canvas, true);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, W, H);
    const frame = ctx.getImageData(0, 0, W, H);
    const px = frame.data;
    const matte = matteAt(seg, W, H);
    const count = W * H;
    /* the matte is enlarged from the model size, which widens its soft edge
       by the same factor: steepen it again on large images */
    const unit = Math.max(W, H) / 1024;
    const harden = U.clamp(Math.max(W, H) / (seg.size * 2), 1, 3);
    const shift = U.clamp(Number(opts.shift) || 0, -1, 1);
    const feather = U.clamp(Number(opts.feather) || 0, 0, 1);
    const lut = new Uint8Array(256);
    if (shift || feather) {
      let alpha = new Float32Array(count);
      for (let i = 0; i < count; i += 1) alpha[i] = matte[i * 4 + 3] / 255;
      if (shift) alpha = blurField(alpha, W, H, Math.max(0.6, Math.abs(shift) * 5 * unit));
      const threshold = 0.5 - 0.42 * shift;
      const gain = harden * (1 + 3 * Math.abs(shift));
      for (let i = 0; i < count; i += 1) alpha[i] = U.clamp((alpha[i] - threshold) * gain + 0.5, 0, 1);
      if (feather) alpha = blurField(alpha, W, H, Math.max(0.6, feather * 8 * unit));
      for (let i = 0; i < count; i += 1) matte[i * 4 + 3] = alpha[i] * 255 + 0.5;
      for (let v = 0; v < 256; v += 1) lut[v] = v;
    } else {
      for (let v = 0; v < 256; v += 1) lut[v] = U.clamp((v / 255 - 0.5) * harden + 0.5, 0, 1) * 255 + 0.5;
    }
    let minX = W;
    let minY = H;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4 + 3;
        const value = (px[i] * lut[matte[i]] + 127) / 255 | 0;
        px[i] = value;
        if (value > 5) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(frame, 0, 0);
    const bbox = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    return { canvas, bbox };
  }

  CC.cutout = {
    manifest: MANIFEST,
    isSupported,
    source,
    status,
    segment,
    compose,
    clearCache,
    prefersCpu: () => forceCpu,
    setPrefersCpu,
    dispose: disposeEngine,
    backend: () => engine?.backend || '',
  };
})();
