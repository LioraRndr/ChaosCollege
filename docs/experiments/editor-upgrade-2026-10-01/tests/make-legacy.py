"""Extract the pre-upgrade glitch functions from the baseline commit for t4.mjs.

Usage (repo root):  git show 515b299:app.js > /tmp/cc-tools/old-app.js
                    python3 docs/experiments/editor-upgrade-2026-10-01/tests/make-legacy.py
Writes /tmp/cc-tools/legacy-fx.js exposing window.LEGACY.applyDatamosh / applyDatamoshFrame.
"""
src = open('/tmp/cc-tools/old-app.js', encoding='utf-8').read()


def extract(name):
    start = src.index(f'  function {name}(')
    i = src.index('{', start)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == '{':
            depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0:
                return src[start:j + 1]
    raise ValueError(name)


names = ['clamp', 'lerp', 'hashString', 'mulberry32', 'releaseFrameMoshBuffers', 'getFrameMoshBuffers',
         'fitRect', 'applyDatamosh', 'applyDatamoshFrame']
body = '\n'.join(extract(name) for name in names)
open('/tmp/cc-tools/legacy-fx.js', 'w', encoding='utf-8').write("""window.LEGACY = (() => {
const state = { seed: 0, layers: [] };
const FRAME_MOSH_BUFFER_BYTES = 16 * 1024 * 1024;
const frameMoshBuffers = [];
function getLoadedImage() { return null; }
function ensureImage() { return Promise.reject(); }
function invalidateLayer() {}
function requestRender() {}
""" + body + """
return { state, applyDatamosh, applyDatamoshFrame };
})();
""")
print('wrote /tmp/cc-tools/legacy-fx.js')
