/* CHAOS.COLLAGE — smart cutout component list (CC.cutoutManifest)
   The AI runtime and model are not part of the repository: they are fetched
   on first use (pinned version, size and SHA-256), then cached.
   The block between the two markers is strict JSON; server/chaos_server.py
   reads the same block to mirror these files for the cloud edition. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});

  CC.cutoutManifest = /*CUTOUT-MANIFEST-BEGIN*/{
    "version": 1,
    "serverBase": "/vendor/cutout/",
    "model": {
      "name": "BiRefNet_lite 512",
      "license": "MIT",
      "source": "https://huggingface.co/studioludens/birefnet-lite-512",
      "file": "birefnet-lite-512-fp16.onnx",
      "input": 512,
      "mean": [0.485, 0.456, 0.406],
      "std": [0.229, 0.224, 0.225]
    },
    "runtime": {
      "name": "ONNX Runtime Web 1.31.1",
      "license": "MIT",
      "script": "ort-1.31.1.webgpu.min.js",
      "module": "ort-1.31.1.asyncify.mjs",
      "wasm": "ort-1.31.1.asyncify.wasm"
    },
    "files": [
      {
        "name": "ort-1.31.1.webgpu.min.js",
        "size": 70811,
        "sha256": "03f4423bd12fdbf5eb4ffcf6c1a3c471c760e10c2a1533f1ca64f5a7619c7731",
        "urls": [
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort.webgpu.min.js",
          "https://registry.npmmirror.com/onnxruntime-web/1.31.1/files/dist/ort.webgpu.min.js",
          "https://unpkg.com/onnxruntime-web@1.31.1/dist/ort.webgpu.min.js"
        ]
      },
      {
        "name": "ort-1.31.1.asyncify.mjs",
        "size": 53457,
        "sha256": "59cf781530e1a16df2a291d78798e3ec1152467edaec402d6f9599d85047c302",
        "urls": [
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort-wasm-simd-threaded.asyncify.mjs",
          "https://registry.npmmirror.com/onnxruntime-web/1.31.1/files/dist/ort-wasm-simd-threaded.asyncify.mjs",
          "https://unpkg.com/onnxruntime-web@1.31.1/dist/ort-wasm-simd-threaded.asyncify.mjs"
        ]
      },
      {
        "name": "ort-1.31.1.asyncify.wasm",
        "size": 28747738,
        "sha256": "ca319e9539cd0f1e291cf56074760121eaf39650f5dbf84b6e52c07f4b2944ec",
        "urls": [
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort-wasm-simd-threaded.asyncify.wasm",
          "https://registry.npmmirror.com/onnxruntime-web/1.31.1/files/dist/ort-wasm-simd-threaded.asyncify.wasm",
          "https://unpkg.com/onnxruntime-web@1.31.1/dist/ort-wasm-simd-threaded.asyncify.wasm"
        ]
      },
      {
        "name": "birefnet-lite-512-fp16.onnx",
        "size": 98484532,
        "sha256": "eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516",
        "urls": [
          "https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/onnx/model_fp16.onnx",
          "https://hf-mirror.com/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/onnx/model_fp16.onnx"
        ]
      }
    ]
  }/*CUTOUT-MANIFEST-END*/;
})();
