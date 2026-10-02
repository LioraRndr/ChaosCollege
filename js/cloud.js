/* CHAOS.COLLAGE — cloud mode (CC.cloud)
   When the editor is served by server/chaos_server.py, projects, images,
   thumbnails and imported fonts live on the server under the signed-in
   account. This module swaps the project-library parts of CC.storage for API
   calls; settings and linked file handles stay in the local browser. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const { escapeHtml } = CC.util;
  const local = { ...CC.storage };

  const cloud = {
    enabled: false,
    config: null,
    user: null,
    revs: new Map(),
    uploaded: new Set(),
    authListeners: [],
  };

  /* ---------------- API ---------------- */

  class CloudError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, { method = 'GET', json, body, headers = {}, keepalive = false, as = 'json' } = {}) {
    const init = { method, headers: { ...headers }, credentials: 'same-origin', cache: 'no-store' };
    if (method !== 'GET') init.headers['X-Requested-With'] = 'chaos-collage';
    if (json !== undefined) {
      init.body = JSON.stringify(json);
      init.headers['Content-Type'] = 'application/json';
    } else if (body !== undefined) init.body = body;
    if (keepalive) init.keepalive = true;
    let response;
    try {
      response = await fetch(`/api${path}`, init);
    } catch (error) {
      throw new CloudError(0, 'offline', '无法连接服务器，请检查网络');
    }
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        /* not JSON */
      }
      const failure = new CloudError(response.status, payload?.error || 'http', payload?.message || `服务器返回 ${response.status}`);
      if (response.status === 401 && cloud.user) {
        cloud.user = null;
        cloud.authListeners.forEach((fn) => fn(null));
      }
      throw failure;
    }
    if (as === 'blob') return response.blob();
    return response.json();
  }

  async function detect() {
    if (!/^https?:$/.test(location.protocol)) return false;
    try {
      const response = await fetch('/api/config', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return false;
      const config = await response.json();
      if (!config?.cloud) return false;
      cloud.config = config;
      return true;
    } catch (error) {
      return false;
    }
  }

  async function refreshUser() {
    const { user } = await api('/auth/me');
    cloud.user = user;
    return user;
  }

  /* ---------------- storage implementation ---------------- */

  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  const thumbUrl = (id) => `/api/projects/${encodeURIComponent(id)}/thumb`;

  const impl = {
    async open() {
      await local.open();
      return true;
    },

    isPersistent: () => true,

    async listProjects() {
      /* revisions are only taken from getProject: a newer one seen in the list
         must not let a stale open copy overwrite it silently */
      const { projects } = await api('/projects');
      return projects.map((project) => ({ ...project, thumb: project.hasThumb ? thumbUrl(project.id) : null }));
    },

    async getProject(id) {
      try {
        const record = await api(`/projects/${encodeURIComponent(id)}`);
        cloud.revs.set(id, record.rev);
        return { ...record, thumb: undefined };
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },

    async putProject(record) {
      const payload = {
        name: record.name,
        width: record.width,
        height: record.height,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        fileName: record.fileName || '',
        doc: record.doc,
        baseRev: cloud.revs.has(record.id) ? cloud.revs.get(record.id) : null,
        force: !!record.force,
      };
      const text = JSON.stringify(payload);
      /* keepalive lets a save started while the page closes finish, but the
         browser caps keepalive bodies at 64 KiB */
      const summary = await api(`/projects/${encodeURIComponent(record.id)}`, {
        method: 'PUT',
        body: text,
        headers: { 'Content-Type': 'application/json' },
        keepalive: text.length < 60000,
      });
      cloud.revs.set(record.id, summary.rev);
      if (record.thumb instanceof Blob) await impl.putThumb(record.id, record.thumb).catch(() => {});
      return record;
    },

    async putThumb(id, thumb) {
      if (!(thumb instanceof Blob)) return;
      await api(`/projects/${encodeURIComponent(id)}/thumb`, { method: 'PUT', body: thumb, headers: { 'Content-Type': thumb.type || 'image/webp' } });
    },

    async renameProject(id, name) {
      const summary = await api(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', json: { name } });
      cloud.revs.set(id, summary.rev);
      return summary;
    },

    async deleteProject(id) {
      await api(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      cloud.revs.delete(id);
      [...cloud.uploaded].filter((key) => key.startsWith(`${id}/`)).forEach((key) => cloud.uploaded.delete(key));
    },

    async putAsset(projectId, asset) {
      const key = `${projectId}/${asset.id}`;
      if (cloud.uploaded.has(key) || !asset.blob) return asset;
      await api(`/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`, {
        method: 'PUT',
        body: asset.blob,
        headers: {
          'Content-Type': asset.mime || asset.blob.type || 'image/png',
          'X-Asset-Name': encodeURIComponent(asset.name || ''),
          'X-Asset-Width': String(Math.round(asset.width || 0)),
          'X-Asset-Height': String(Math.round(asset.height || 0)),
        },
      });
      cloud.uploaded.add(key);
      return asset;
    },

    async getAssets(projectId) {
      let list;
      try {
        ({ assets: list } = await api(`/projects/${encodeURIComponent(projectId)}/assets`));
      } catch (error) {
        if (error.status === 404) return [];
        throw error;
      }
      const records = await mapLimit(list, 4, async (meta) => {
        try {
          const blob = await api(`/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(meta.id)}`, { as: 'blob' });
          cloud.uploaded.add(`${projectId}/${meta.id}`);
          return { ...meta, projectId, key: `${projectId}/${meta.id}`, blob: new Blob([blob], { type: meta.mime }) };
        } catch (error) {
          console.warn('asset download failed', meta.id, error);
          return null;
        }
      });
      return records.filter(Boolean);
    },

    async deleteAsset(projectId, assetId) {
      await api(`/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
      cloud.uploaded.delete(`${projectId}/${assetId}`);
    },

    async copyAssets(fromProjectId, toProjectId) {
      const { copied } = await api(`/projects/${encodeURIComponent(toProjectId)}/assets/copy-from/${encodeURIComponent(fromProjectId)}`, { method: 'POST' });
      return copied;
    },

    async putFont(font) {
      if (!font.blob) return font;
      await api(`/fonts/${encodeURIComponent(font.id)}`, {
        method: 'PUT',
        body: font.blob,
        headers: {
          'Content-Type': font.mime || font.blob.type || 'font/ttf',
          'X-Font-Family': encodeURIComponent(font.family),
          'X-Font-File': encodeURIComponent(font.fileName || ''),
          'X-Font-Added': String(font.addedAt || Date.now()),
        },
      });
      return font;
    },

    async listFonts() {
      const { fonts } = await api('/fonts');
      const records = await mapLimit(fonts, 3, async (meta) => {
        try {
          const blob = await api(`/fonts/${encodeURIComponent(meta.id)}`, { as: 'blob' });
          return { ...meta, blob: new Blob([blob], { type: meta.mime }) };
        } catch (error) {
          console.warn('font download failed', meta.family, error);
          return null;
        }
      });
      return records.filter(Boolean);
    },

    async deleteFont(id) {
      await api(`/fonts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async estimate() {
      try {
        return await api('/usage');
      } catch (error) {
        return null;
      }
    },

    persisted: async () => true,
    requestPersist: async () => true,
  };

  function enable() {
    cloud.enabled = true;
    Object.assign(CC.storage, impl);
  }

  /* ---------------- sign-in screen ---------------- */

  let gatePromise = null;

  /* Resolves once a user is signed in, or with null when they choose the
     local-only trial instead. */
  function showAuthGate({ reason = '', allowLocal = true } = {}) {
    if (gatePromise) return gatePromise;
    gatePromise = new Promise((resolve) => {
      const config = cloud.config || {};
      let mode = config.signup ? 'register' : 'login';
      const gate = document.createElement('div');
      gate.className = 'auth-gate';
      gate.id = 'authGate';
      const render = (error = '') => {
        const register = mode === 'register';
        gate.innerHTML = `
          <form class="auth-card" novalidate>
            <img class="auth-logo" src="assets/logo-mark.svg" alt="" width="56" height="56">
            <h1>CHAOS.COLLAGE</h1>
            <p class="auth-sub">${reason ? escapeHtml(reason) : '高密度拼贴海报编辑器 · 工程自动保存在云端'}</p>
            ${config.signup ? `
              <div class="auth-tabs" role="tablist">
                <button type="button" role="tab" class="${register ? '' : 'active'}" data-auth-mode="login">登录</button>
                <button type="button" role="tab" class="${register ? 'active' : ''}" data-auth-mode="register">注册</button>
              </div>` : ''}
            <label class="field"><span>用户名</span><input class="text-input wide" name="username" autocomplete="username" required maxlength="32" autofocus></label>
            <label class="field"><span>密码</span><input class="text-input wide" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="8"></label>
            ${register ? `
              <label class="field"><span>确认密码</span><input class="text-input wide" name="confirm" type="password" autocomplete="new-password" required minlength="8"></label>
              ${config.invite ? '<label class="field"><span>邀请码</span><input class="text-input wide" name="invite" autocomplete="off" required></label>' : ''}
              <p class="auth-hint">用户名 2–32 位，密码至少 8 位。本站不收集邮箱，忘记密码需联系管理员重置。</p>` : ''}
            <p class="auth-error" role="alert">${escapeHtml(error)}</p>
            <button class="ui-button primary auth-submit" type="submit">${register ? '注册并开始' : '登录'}</button>
            ${allowLocal ? '<button class="link-button auth-local" type="button" data-auth-local>不登录，先在本机试用（工程只存在这个浏览器里）</button>' : ''}
          </form>`;
        gate.querySelector('input[name="username"]')?.focus();
      };
      render();
      gate.addEventListener('click', (event) => {
        const switcher = event.target.closest('[data-auth-mode]');
        if (switcher) {
          mode = switcher.dataset.authMode;
          render();
          return;
        }
        if (event.target.closest('[data-auth-local]')) {
          gate.remove();
          gatePromise = null;
          resolve(null);
        }
      });
      gate.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.target;
        const data = Object.fromEntries(new FormData(form).entries());
        if (mode === 'register' && data.password !== data.confirm) {
          render('两次输入的密码不一致');
          return;
        }
        const submit = form.querySelector('.auth-submit');
        submit.disabled = true;
        try {
          const { user } = await api(`/auth/${mode === 'register' ? 'register' : 'login'}`, {
            method: 'POST',
            json: { username: data.username, password: data.password, invite: data.invite || '' },
          });
          cloud.user = user;
          gate.remove();
          gatePromise = null;
          cloud.authListeners.forEach((fn) => fn(user));
          resolve(user);
        } catch (error) {
          const keep = { username: data.username };
          render(error.message || '登录失败');
          gate.querySelector('input[name="username"]').value = keep.username || '';
          gate.querySelector('input[name="password"]')?.focus();
        }
      });
      document.body.appendChild(gate);
    });
    return gatePromise;
  }

  /* ---------------- account actions ---------------- */

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      /* already signed out */
    }
    location.reload();
  }

  function changePasswordDialog() {
    const ui = CC.ui;
    return ui.openDialog({
      title: '修改密码',
      width: 380,
      body: `
        <label class="field"><span>当前密码</span><input class="text-input wide" type="password" data-current autocomplete="current-password" autofocus></label>
        <label class="field"><span>新密码（至少 8 位）</span><input class="text-input wide" type="password" data-new autocomplete="new-password"></label>
        <label class="field"><span>确认新密码</span><input class="text-input wide" type="password" data-confirm autocomplete="new-password"></label>
        <p class="auth-hint">修改后，其他设备上的登录会失效。</p>`,
      buttons: [
        { label: '取消', value: null },
        {
          label: '修改',
          kind: 'primary',
          onClick: async ({ el }) => {
            const current = el.querySelector('[data-current]').value;
            const next = el.querySelector('[data-new]').value;
            if (next !== el.querySelector('[data-confirm]').value) {
              ui.toast('两次输入的新密码不一致', 'error');
              return false;
            }
            try {
              await api('/auth/password', { method: 'POST', json: { current, password: next } });
              ui.toast('密码已修改');
              return true;
            } catch (error) {
              ui.toast(error.message, 'error');
              return false;
            }
          },
        },
      ],
    }).done;
  }

  function deleteAccountDialog() {
    const ui = CC.ui;
    return ui.openDialog({
      title: '注销账号',
      width: 420,
      body: `
        <p class="modal-text">注销后，云端的全部工程、图片和字体会被永久删除，无法恢复。需要保留的工程请先用「另存为工程文件」下载到本地。</p>
        <label class="field"><span>输入密码确认</span><input class="text-input wide" type="password" data-password autocomplete="current-password" autofocus></label>`,
      buttons: [
        { label: '取消', value: null },
        {
          label: '永久注销',
          kind: 'danger primary',
          onClick: async ({ el }) => {
            try {
              await api('/account', { method: 'DELETE', json: { password: el.querySelector('[data-password]').value } });
              location.reload();
              return true;
            } catch (error) {
              ui.toast(error.message, 'error');
              return false;
            }
          },
        },
      ],
    }).done;
  }

  function accountMenuItems() {
    return [
      { heading: cloud.user ? `已登录：${cloud.user.username}` : '未登录' },
      { label: '修改密码…', action: () => changePasswordDialog() },
      { label: '退出登录', action: () => logout() },
      { separator: true },
      { label: '注销账号…', danger: true, action: () => deleteAccountDialog() },
    ];
  }

  CC.cloud = {
    CloudError,
    detect,
    refreshUser,
    enable,
    showAuthGate,
    logout,
    accountMenuItems,
    isEnabled: () => cloud.enabled,
    user: () => cloud.user,
    config: () => cloud.config,
    onAuthChange: (fn) => cloud.authListeners.push(fn),
  };
})();
