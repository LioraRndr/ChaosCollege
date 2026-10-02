/* CHAOS.COLLAGE — UI kit (CC.ui): icons, toast, menus, dialogs, styled
   selects, inspector control builders and the font picker. No editor state. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const { escapeHtml, clamp } = CC.util;

  /* ---------------- icons ---------------- */

  const ICONS = {
    user: '<circle cx="8" cy="5.6" r="2.7"/><path d="M2.8 14c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3"/>',
    image: '<rect x="2" y="3" width="12" height="10" rx="1.6"/><circle cx="5.6" cy="6.4" r="1.1"/><path d="M2.6 11.8 5.8 9l2.3 2 2.2-2.4 3.1 3.2"/>',
    text: '<path d="M3.2 4.6V3.2h9.6v1.4M8 3.2v9.6M6 12.8h4"/>',
    window: '<rect x="2" y="3.4" width="12" height="9.4" rx="1.6"/><path d="M2 6h12"/><path d="M3.8 4.7h.01M5.6 4.7h.01"/>',
    shape: '<circle cx="5.6" cy="5.6" r="3.1"/><rect x="8.6" y="8.6" width="5" height="5" rx="1.1"/>',
    shatter: '<path d="M8 1.9l1.3 3.9 4.1-2.3-2.4 4 4 1.9-4.3 1 1.4 3.5L9 11.9 8 14.2 7 11.9l-3.1 2 1.4-3.5-4.3-1 4-1.9-2.4-4 4.1 2.3Z"/>',
    vector: '<path d="M8 13.2S2.6 9.9 2.6 6.1A2.7 2.7 0 0 1 8 5a2.7 2.7 0 0 1 5.4 1.1c0 3.8-5.4 7.1-5.4 7.1Z"/>',
    gen: '<path d="M8 1.8 9.2 6.8 14.2 8 9.2 9.2 8 14.2 6.8 9.2 1.8 8 6.8 6.8Z"/>',
    path: '<path d="M2.5 12.5c2-5 4-1 6-5s3.5-3 5-4.5"/>',
    undo: '<path d="M2.8 6.8h6.4a3.9 3.9 0 0 1 0 7.8H6.4"/><path d="M5.6 3.8 2.6 6.8l3 3"/>',
    redo: '<path d="M13.2 6.8H6.8a3.9 3.9 0 0 0 0 7.8h2.8"/><path d="M10.4 3.8l3 3-3 3"/>',
    remix: '<path d="M2.2 4.6h2.6l6.4 6.8h2.6"/><path d="M2.2 11.4h2.6l1.7-1.8M13.8 4.6h-2.6l-1.7 1.8"/><path d="M11.9 2.7l1.9 1.9-1.9 1.9M11.9 9.5l1.9 1.9-1.9 1.9"/>',
    export: '<path d="M8 2.4v7.4"/><path d="M4.9 6.6 8 9.7l3.1-3.1"/><path d="M2.8 11v1.6a1.2 1.2 0 0 0 1.2 1.2h8a1.2 1.2 0 0 0 1.2-1.2V11"/>',
    eye: '<path d="M1.8 8S3.9 4.3 8 4.3 14.2 8 14.2 8 12.1 11.7 8 11.7 1.8 8 1.8 8Z"/><circle cx="8" cy="8" r="1.9"/>',
    eyeOff: '<path d="M3.1 3.1l9.8 9.8"/><path d="M6.2 4.8C6.8 4.5 7.4 4.3 8 4.3c4.1 0 6.2 3.7 6.2 3.7a12.6 12.6 0 0 1-1.7 2M3.6 5.7A12.9 12.9 0 0 0 1.8 8s2.1 3.7 6.2 3.7c.7 0 1.4-.1 2-.4"/>',
    duplicate: '<rect x="5.3" y="5.3" width="9.3" height="9.3" rx="1.4"/><path d="M2.7 10.7c-.7 0-1.4-.6-1.4-1.4V2.7c0-.8.7-1.4 1.4-1.4h6.6c.8 0 1.4.6 1.4 1.4"/>',
    trash: '<path d="M2.6 4.2h10.8"/><path d="M6.4 4.2V3.1a1 1 0 0 1 1-1h1.2a1 1 0 0 1 1 1v1.1"/><path d="M4.2 4.2l.5 8.2a1.1 1.1 0 0 0 1.1 1h4.4a1.1 1.1 0 0 0 1.1-1l.5-8.2"/><path d="M6.7 7v3.6M9.3 7v3.6"/>',
    front: '<path d="M8 13.2V6.2"/><path d="M5.2 9 8 6.2 10.8 9"/><path d="M3 2.8h10"/>',
    back: '<path d="M8 2.8v7"/><path d="M5.2 7 8 9.8l2.8-2.8"/><path d="M3 13.2h10"/>',
    grip: '<circle cx="6" cy="4.2" r="1.05"/><circle cx="10" cy="4.2" r="1.05"/><circle cx="6" cy="8" r="1.05"/><circle cx="10" cy="8" r="1.05"/><circle cx="6" cy="11.8" r="1.05"/><circle cx="10" cy="11.8" r="1.05"/>',
    chevron: '<path d="M4.4 6.2 8 9.8l3.6-3.6"/>',
    chevronRight: '<path d="M6.2 4.4 9.8 8l-3.6 3.6"/>',
    up: '<path d="M4.4 9.8 8 6.2l3.6 3.6"/>',
    plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
    minus: '<path d="M3.2 8h9.6"/>',
    select: '<path d="M4 2.4v10.4l2.8-2.7 1.9 3.7 1.7-.8-1.9-3.7h3.9Z"/>',
    transform: '<path d="M3.2 4.4 12.4 2.6 13.4 12.2 4.2 13.4Z"/><path d="M2.4 3.6h1.6v1.6H2.4zM11.6 1.8h1.6v1.6h-1.6zM12.6 11.4h1.6V13h-1.6zM3.4 12.6H5v1.6H3.4z"/>',
    hand: '<path d="M5.5 8V3.6a1 1 0 0 1 2 0V7.5M7.5 7V2.8a1 1 0 0 1 2 0V7.2M9.5 7.2V3.6a1 1 0 0 1 2 0v5.2c0 2.8-1.8 4.7-4.4 4.7-1.9 0-3-.8-4-2.4L1.9 8.6a1 1 0 0 1 1.6-1.1l2 1.9"/>',
    zoom: '<circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2 13.8 13.8M5.2 7h3.6M7 5.2v3.6"/>',
    brush: '<path d="M13.6 2.4 7.4 8.6"/><path d="M7.4 8.6c-1.6-.6-3.1.3-3.5 1.9-.3 1.2-.9 2-2 2.4 2.7.9 5.8.3 6.3-2.3"/>',
    eyedropper: '<path d="M10.6 2.8a1.9 1.9 0 0 1 2.7 2.7l-1.5 1.5.8.8-1.1 1.1-3.4-3.4 1.1-1.1.8.8z"/><path d="M8.6 5.9 3.4 11.1l-.7 2.2 2.2-.7 5.2-5.2"/>',
    lock: '<rect x="3.4" y="7.2" width="9.2" height="6.6" rx="1.4"/><path d="M5.4 7.2V5a2.6 2.6 0 0 1 5.2 0v2.2"/>',
    unlock: '<rect x="3.4" y="7.2" width="9.2" height="6.6" rx="1.4"/><path d="M5.4 7.2V5a2.6 2.6 0 0 1 5-1"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    search: '<circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2 13.6 13.6"/>',
    fx: '<path d="M5.6 13.4c1.2 0 1.6-1 1.9-2.6l1.2-6.6c.3-1.5.8-2.3 2-2.3M4.6 6.2h5"/><path d="M10 9.4l3.4 4M13.4 9.4 10 13.4"/>',
    clip: '<path d="M4 2.6v6.6a3 3 0 0 0 3 3h6"/><path d="M10.6 9.8 13 12.2l-2.4 2.4"/>',
    flipH: '<path d="M8 2v12"/><path d="M6 4.5 2.5 11.5H6Z"/><path d="M10 4.5l3.5 7H10Z"/>',
    flipV: '<path d="M2 8h12"/><path d="M4.5 6 11.5 2.5V6Z"/><path d="M4.5 10l7 3.5V10Z"/>',
    alignLeft: '<path d="M2.5 2v12"/><rect x="4.5" y="4" width="8" height="3" rx=".6"/><rect x="4.5" y="9" width="5" height="3" rx=".6"/>',
    alignCenter: '<path d="M8 2v12"/><rect x="3.5" y="4" width="9" height="3" rx=".6"/><rect x="5" y="9" width="6" height="3" rx=".6"/>',
    alignRight: '<path d="M13.5 2v12"/><rect x="3.5" y="4" width="8" height="3" rx=".6"/><rect x="6.5" y="9" width="5" height="3" rx=".6"/>',
    alignTop: '<path d="M2 2.5h12"/><rect x="4" y="4.5" width="3" height="8" rx=".6"/><rect x="9" y="4.5" width="3" height="5" rx=".6"/>',
    alignMiddle: '<path d="M2 8h12"/><rect x="4" y="3.5" width="3" height="9" rx=".6"/><rect x="9" y="5" width="3" height="6" rx=".6"/>',
    alignBottom: '<path d="M2 13.5h12"/><rect x="4" y="3.5" width="3" height="8" rx=".6"/><rect x="9" y="6.5" width="3" height="5" rx=".6"/>',
    distH: '<path d="M2 2v12M14 2v12"/><rect x="6.5" y="5" width="3" height="6" rx=".6"/>',
    distV: '<path d="M2 2h12M2 14h12"/><rect x="5" y="6.5" width="6" height="3" rx=".6"/>',
    grid: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11"/>',
    magnet: '<path d="M4 3v5a4 4 0 0 0 8 0V3"/><path d="M4 5.4h2.4M9.6 5.4H12M6.4 3v5a1.6 1.6 0 0 0 3.2 0V3"/>',
    home: '<path d="M2.5 7.5 8 3l5.5 4.5V13a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8Z"/><path d="M6.4 13.8V9.6h3.2v4.2"/>',
    folder: '<path d="M2 4.2a1 1 0 0 1 1-1h3.2l1.4 1.6H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z"/>',
    save: '<path d="M3 2.5h8l2.5 2.5v8.5H3Z"/><path d="M5.2 2.5v3.3h5V2.5M5.2 13.5V9.4h5.6v4.1"/>',
    more: '<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>',
    check: '<path d="M3 8.4 6.4 11.6 13 4.6"/>',
    reset: '<path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M2.8 2.6v2.6h2.6"/>',
    font: '<path d="M2.5 13 6.2 3h1.2l3.7 10M3.8 9.6h5.9"/><path d="M11.6 13V8.4M11.6 9.6c0-1 .9-1.6 1.9-1.6"/>',
    layers: '<path d="M8 2 14 5.2 8 8.4 2 5.2Z"/><path d="M2 8.2l6 3.2 6-3.2M2 11l6 3.2 6-3.2"/>',
    history: '<circle cx="8" cy="8" r="5.6"/><path d="M8 4.8V8l2.2 1.6"/>',
    warp: '<path d="M2.5 3.5c3.5 1.5 7.5-1.5 11 0M2.5 8c3.5 1.5 7.5-1.5 11 0M2.5 12.5c3.5 1.5 7.5-1.5 11 0M2.5 3.5v9M8 3.2v9.6M13.5 3.5v9"/>',
    sticker: '<path d="M2.8 2.8h10.4v6.4l-4 4H2.8Z"/><path d="M9.2 13.2V9.2h4"/><path d="M5.4 6.4h.01M8.6 6.4h.01"/><path d="M5.4 8.6c.8.8 2.4.8 3.2 0"/>',
    rect: '<rect x="2.5" y="3.5" width="11" height="9" rx=".8"/>',
    roundrect: '<rect x="2.5" y="3.5" width="11" height="9" rx="3"/>',
    ellipse: '<ellipse cx="8" cy="8" rx="5.8" ry="4.8"/>',
    triangle: '<path d="M8 2.8 13.6 12.8H2.4Z"/>',
    polygon: '<path d="M8 2.2 13.5 6.2 11.4 12.8H4.6L2.5 6.2Z"/>',
    star: '<path d="M8 1.8 9.7 6.1l4.6.3-3.5 2.9 1.1 4.5L8 11.4l-3.9 2.4 1.1-4.5L1.7 6.4l4.6-.3Z"/>',
    sparkle: '<path d="M8 1.6C8.5 6 10 7.5 14.4 8 10 8.5 8.5 10 8 14.4 7.5 10 6 8.5 1.6 8 6 7.5 7.5 6 8 1.6Z"/>',
    arrow: '<path d="M2 6.4h7.2V3.6L14 8l-4.8 4.4V9.6H2Z"/>',
    line: '<path d="M2.5 13.5 13.5 2.5"/>',
    ring: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="2.6"/>',
    burst: '<path d="M8 1.6l1.3 2.7 2.9-.9-.6 3 2.8 1.2-2.4 1.9 1.6 2.6-3-.1-.7 2.9L8 13.1l-2 2.2-.6-2.9-3 .1 1.6-2.6L1.6 8l2.8-1.2-.6-3 2.9.9Z"/>',
    cross: '<path d="M6 2.5h4v3.5h3.5v4H10v3.5H6V10H2.5V6H6Z"/>',
    info: '<circle cx="8" cy="8" r="5.8"/><path d="M8 7.2v4M8 4.9v.1"/>',
    keyboard: '<rect x="1.8" y="4" width="12.4" height="8" rx="1.4"/><path d="M4.4 6.6h.01M6.8 6.6h.01M9.2 6.6h.01M11.6 6.6h.01M5 9.4h6"/>',
    link: '<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.9.9"/><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2.1 2.1a2.6 2.6 0 0 0 3.7 3.7l.9-.9"/>',
    unlink: '<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7"/><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2.1 2.1a2.6 2.6 0 0 0 3.7 3.7"/><path d="M2 2l12 12"/>',
    bake: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.4"/><path d="M2.5 10.5 6 7l2.6 2.6 1.6-1.6 3.3 3.3"/><path d="M10.4 5.4h.01"/>',
  };
  const FILLED = new Set(['grip', 'more']);

  function icon(name, cls = 'icon') {
    const body = ICONS[name] || '';
    const filled = FILLED.has(name);
    return `<svg class="${cls}" viewBox="0 0 16 16" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${body}</svg>`;
  }

  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      if (el.dataset.iconReady === el.dataset.icon) return;
      el.dataset.iconReady = el.dataset.icon;
      const label = el.querySelector('.label');
      el.innerHTML = icon(el.dataset.icon) + (label ? label.outerHTML : '');
    });
  }

  /* ---------------- toast ---------------- */

  let toastTimer = null;
  function toast(message, kind = '') {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = message;
    el.className = `toast visible ${kind}`;
    toastTimer = setTimeout(() => el.classList.remove('visible'), kind === 'error' ? 4200 : 2000);
  }

  /* ---------------- menus ---------------- */

  let menuStack = [];

  function closeMenus(depth = 0) {
    while (menuStack.length > depth) {
      const entry = menuStack.pop();
      entry.el.remove();
      entry.onClose?.();
    }
  }

  function menusOpen() {
    return menuStack.length > 0;
  }

  function renderMenu(items, depth, onClose) {
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    /* only the row whose submenu is showing keeps the highlight */
    const clearOpen = () => el.querySelectorAll('.menu-item.open').forEach((row) => row.classList.remove('open'));
    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'menu-sep';
        el.appendChild(sep);
        return;
      }
      if (item.heading) {
        const head = document.createElement('div');
        head.className = 'menu-heading';
        head.textContent = item.heading;
        el.appendChild(head);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `menu-item${item.disabled ? ' disabled' : ''}${item.checked ? ' checked' : ''}${item.danger ? ' danger' : ''}`;
      button.setAttribute('role', 'menuitem');
      button.disabled = !!item.disabled;
      button.innerHTML = `
        <span class="menu-check">${item.checked ? icon('check') : item.icon ? icon(item.icon) : ''}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-shortcut">${item.submenu ? icon('chevronRight') : escapeHtml(item.shortcut || '')}</span>`;
      if (item.submenu) {
        const open = () => {
          closeMenus(depth + 1);
          clearOpen();
          const rect = button.getBoundingClientRect();
          openMenuAt({ left: rect.right - 2, top: rect.top - 4, right: rect.left + 2 }, item.submenu, { depth: depth + 1, side: true });
          button.classList.add('open');
        };
        button.addEventListener('mouseenter', open);
        button.addEventListener('click', open);
        button.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            open();
            menuStack[depth + 1]?.el.querySelector('.menu-item:not(.disabled)')?.focus();
          }
        });
      } else {
        button.addEventListener('mouseenter', () => {
          closeMenus(depth + 1);
          clearOpen();
        });
        button.addEventListener('click', () => {
          if (item.disabled) return;
          closeMenus(0);
          item.action?.();
        });
      }
      el.appendChild(button);
    });
    el.addEventListener('keydown', (event) => {
      const buttons = [...el.querySelectorAll('.menu-item:not(.disabled)')];
      const index = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        buttons[(index + 1) % buttons.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
      } else if (event.key === 'ArrowLeft' && depth > 0) {
        event.preventDefault();
        closeMenus(depth);
        menuStack[depth - 1]?.el.querySelector('.menu-item.open')?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeMenus(0);
      }
    });
    menuStack.push({ el, onClose });
    return el;
  }

  /* anchor: { left, top, bottom?, right? } in viewport px */
  function openMenuAt(anchor, items, options = {}) {
    const depth = options.depth || 0;
    if (!depth) closeMenus(0);
    const el = renderMenu(items, depth, options.onClose);
    document.body.appendChild(el);
    const width = Math.max(options.minWidth || 0, el.offsetWidth);
    const height = el.offsetHeight;
    let left = anchor.left;
    if (left + width > window.innerWidth - 6) left = options.side && anchor.right != null ? anchor.right - width : window.innerWidth - width - 6;
    let top = anchor.top;
    if (top + height > window.innerHeight - 6) top = Math.max(6, (anchor.bottom != null && !options.side ? anchor.bottom - height - (anchor.bottom - anchor.top) : window.innerHeight - height - 6));
    el.style.left = `${Math.max(6, left)}px`;
    el.style.top = `${Math.max(6, top)}px`;
    if (options.minWidth) el.style.minWidth = `${options.minWidth}px`;
    if (options.focus) el.querySelector('.menu-item:not(.disabled)')?.focus();
    return el;
  }

  document.addEventListener('mousedown', (event) => {
    if (!menuStack.length) return;
    if (menuStack.some((entry) => entry.el.contains(event.target))) return;
    if (event.target.closest?.('[data-menu-trigger]')) return;
    closeMenus(0);
  }, true);
  window.addEventListener('blur', () => closeMenus(0));
  window.addEventListener('resize', () => closeMenus(0));

  /* ---------------- dialogs ---------------- */

  const dialogStack = [];

  function openDialog({ title, body = '', width = 460, buttons = [], onOpen, dismissible = true, className = '' }) {
    const root = document.getElementById('modalRoot') || document.body;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const dialog = document.createElement('div');
    dialog.className = `modal ${className}`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.width = `min(${typeof width === 'number' ? `${width}px` : width}, calc(100vw - 32px))`;
    dialog.innerHTML = `
      <div class="modal-head">
        <strong>${escapeHtml(title || '')}</strong>
        ${dismissible ? `<button class="icon-button icon-only modal-close" data-dialog-close title="关闭">${icon('close')}</button>` : ''}
      </div>
      <div class="modal-body"></div>
      ${buttons.length ? '<div class="modal-foot"></div>' : ''}`;
    const bodyEl = dialog.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    let closed = false;
    let resolveFn;
    const done = new Promise((resolve) => {
      resolveFn = resolve;
    });
    const close = (value = null) => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      const index = dialogStack.indexOf(entry);
      if (index >= 0) dialogStack.splice(index, 1);
      resolveFn(value);
    };
    const foot = dialog.querySelector('.modal-foot');
    buttons.forEach((button) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `ui-button ${button.kind || ''}`;
      el.textContent = button.label;
      if (button.kind === 'primary') el.dataset.primary = '1';
      if (button.spacer) el.style.marginRight = 'auto';
      /* onClick may return false to keep the dialog open, or a value to resolve with */
      el.addEventListener('click', async () => {
        let result = button.value ?? null;
        if (button.onClick) {
          const returned = await button.onClick({ close, el: dialog });
          if (returned === false) return;
          if (returned !== undefined) result = returned;
        }
        close(result);
      });
      foot.appendChild(el);
    });
    dialog.querySelectorAll('[data-dialog-close]').forEach((el) => el.addEventListener('click', () => close(null)));
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop && dismissible) close(null);
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        event.stopPropagation();
        close(null);
      }
      if (event.key === 'Enter' && !event.shiftKey && event.target.tagName !== 'TEXTAREA' && !event.target.closest('.csel-btn')) {
        const primary = dialog.querySelector('[data-primary="1"]');
        if (primary && !primary.disabled) {
          event.preventDefault();
          primary.click();
        }
      }
    });
    backdrop.appendChild(dialog);
    root.appendChild(backdrop);
    const entry = { close, dialog };
    dialogStack.push(entry);
    hydrateIcons(dialog);
    enhanceSelects(dialog);
    onOpen?.(dialog, close);
    requestAnimationFrame(() => {
      const focusable = dialog.querySelector('[autofocus], input:not([type="hidden"]):not([disabled]), .ui-button.primary');
      focusable?.focus();
      if (focusable?.select && focusable.type === 'text') focusable.select();
    });
    return { el: dialog, close, done };
  }

  function dialogsOpen() {
    return dialogStack.length > 0;
  }

  function confirmDialog(message, { title = '确认', okLabel = '确定', cancelLabel = '取消', danger = false } = {}) {
    return openDialog({
      title,
      body: `<p class="modal-text">${escapeHtml(message)}</p>`,
      width: 400,
      buttons: [
        { label: cancelLabel, value: false },
        { label: okLabel, kind: danger ? 'danger primary' : 'primary', value: true },
      ],
    }).done.then((value) => value === true);
  }

  function promptDialog(title, value = '', { label = '', okLabel = '确定', placeholder = '' } = {}) {
    return openDialog({
      title,
      body: `${label ? `<label class="field-label">${escapeHtml(label)}</label>` : ''}<input class="text-input wide" type="text" data-prompt value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autofocus>`,
      width: 400,
      buttons: [
        { label: '取消', value: null },
        { label: okLabel, kind: 'primary', onClick: ({ el }) => el.querySelector('[data-prompt]').value },
      ],
    }).done;
  }

  function choiceDialog(title, message, choices) {
    return openDialog({
      title,
      body: `<p class="modal-text">${escapeHtml(message)}</p>`,
      width: 440,
      buttons: choices.map((choice) => ({ label: choice.label, kind: choice.kind || '', value: choice.value })),
    }).done;
  }

  /* ---------------- styled selects ---------------- */

  let openCsel = null;

  function closeCsel() {
    if (!openCsel) return;
    openCsel.menu.remove();
    openCsel.btn.classList.remove('open');
    openCsel.btn.setAttribute('aria-expanded', 'false');
    openCsel = null;
  }

  function enhanceSelects(root) {
    root.querySelectorAll('select.select-input').forEach((select) => {
      if (select.dataset.cselReady) return;
      select.dataset.cselReady = '1';
      const wrap = document.createElement('div');
      wrap.className = 'csel';
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csel-btn';
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.setAttribute('aria-expanded', 'false');
      const label = document.createElement('span');
      label.textContent = select.options[select.selectedIndex]?.textContent || '';
      btn.append(label);
      btn.insertAdjacentHTML('beforeend', icon('chevron'));
      wrap.appendChild(btn);
      select.addEventListener('csel-sync', () => {
        label.textContent = select.options[select.selectedIndex]?.textContent || '';
      });

      const openMenu = () => {
        closeCsel();
        const menu = document.createElement('div');
        menu.className = 'csel-menu';
        menu.setAttribute('role', 'listbox');
        let group = null;
        [...select.children].forEach((child) => {
          const options = child.tagName === 'OPTGROUP' ? [...child.children] : [child];
          if (child.tagName === 'OPTGROUP') {
            group = document.createElement('div');
            group.className = 'csel-group';
            group.textContent = child.label;
            menu.appendChild(group);
          }
          options.forEach((option) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `csel-option${option.selected ? ' selected' : ''}`;
            item.setAttribute('role', 'option');
            item.textContent = option.textContent;
            item.disabled = option.disabled;
            item.addEventListener('click', () => {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              label.textContent = option.textContent;
              closeCsel();
              btn.focus();
            });
            menu.appendChild(item);
          });
        });
        document.body.appendChild(menu);
        const rect = btn.getBoundingClientRect();
        menu.style.minWidth = `${rect.width}px`;
        const maxH = 300;
        const menuHeight = Math.min(menu.offsetHeight, maxH);
        menu.style.maxHeight = `${maxH}px`;
        menu.style.left = `${Math.max(6, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
        const below = window.innerHeight - rect.bottom - 10;
        menu.style.top = below >= menuHeight || below >= rect.top - 10 ? `${rect.bottom + 4}px` : `${rect.top - menuHeight - 4}px`;
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        openCsel = { btn, menu };
        const selected = menu.querySelector('.csel-option.selected');
        selected?.focus();
        selected?.scrollIntoView({ block: 'nearest' });
        menu.addEventListener('keydown', (event) => {
          const items = [...menu.querySelectorAll('.csel-option:not(:disabled)')];
          const index = items.indexOf(document.activeElement);
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            items[Math.min(index + 1, items.length - 1)]?.focus();
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            items[Math.max(index - 1, 0)]?.focus();
          }
          if (event.key === 'Escape') {
            event.stopPropagation();
            closeCsel();
            btn.focus();
          }
        });
      };
      btn.addEventListener('click', () => {
        if (openCsel?.btn === btn) closeCsel();
        else openMenu();
      });
      btn.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          openMenu();
        }
      });
    });
  }

  document.addEventListener('mousedown', (event) => {
    if (openCsel && !openCsel.menu.contains(event.target) && !openCsel.btn.contains(event.target)) closeCsel();
  });
  window.addEventListener('resize', closeCsel);
  window.addEventListener('scroll', (event) => {
    if (openCsel && !openCsel.menu.contains(event.target)) closeCsel();
  }, true);

  /* ---------------- inspector control builders ---------------- */

  function attrs(opts) {
    const list = [`data-scope="${escapeHtml(opts.scope || 'layer')}"`];
    if (opts.kind) list.push(`data-kind="${opts.kind}"`);
    return list.join(' ');
  }

  function range(label, path, value, min, max, step = 1, opts = {}) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? numeric : min;
    return `
      <div class="control-row${opts.disabled ? ' disabled' : ''}">
        <label title="${escapeHtml(opts.hint || label)}">${escapeHtml(label)}</label>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${safe}" data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: 'number' })}>
        <input class="value-input" type="number" min="${min}" max="${max}" step="${step}" value="${Number(safe.toFixed(4))}" data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: 'number' })} title="${escapeHtml(opts.unit || '')}">
      </div>`;
  }

  function numberField(label, path, value, opts = {}) {
    return `
      <label class="num-field" title="${escapeHtml(opts.hint || label)}">
        <span>${escapeHtml(label)}</span>
        <input class="value-input" type="number" step="${opts.step ?? 1}" ${opts.min != null ? `min="${opts.min}"` : ''} ${opts.max != null ? `max="${opts.max}"` : ''} value="${Number((Number(value) || 0).toFixed(opts.precision ?? 1))}" data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: 'number' })}>
      </label>`;
  }

  function text(label, path, value, opts = {}) {
    if (opts.multiline) {
      return `
        <div class="control-group-tight">
          <span class="control-label">${escapeHtml(label)}</span>
          <textarea class="textarea-input" rows="${opts.rows || 3}" data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: 'string' })}>${escapeHtml(value ?? '')}</textarea>
        </div>`;
    }
    return `
      <div class="control-row compact">
        <label>${escapeHtml(label)}</label>
        <input class="text-input" type="text" value="${escapeHtml(value ?? '')}" data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: 'string' })} ${opts.placeholder ? `placeholder="${escapeHtml(opts.placeholder)}"` : ''}>
      </div>`;
  }

  function color(label, path, value, opts = {}) {
    const safe = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#111111';
    return `
      <div class="control-row compact">
        <label>${escapeHtml(label)}</label>
        <div class="color-pair">
          <input type="color" value="${escapeHtml(safe)}" data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: 'string' })}>
          <input class="text-input" type="text" value="${escapeHtml(value || safe)}" data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: 'color' })} spellcheck="false">
        </div>
      </div>`;
  }

  function select(label, path, value, choices, opts = {}) {
    const optionHtml = (choice) => `<option value="${escapeHtml(choice[0])}" ${String(choice[0]) === String(value) ? 'selected' : ''}>${escapeHtml(choice[1])}</option>`;
    const body = choices.map((choice) => {
      if (choice.group) return `<optgroup label="${escapeHtml(choice.group)}">${choice.options.map(optionHtml).join('')}</optgroup>`;
      return optionHtml(choice);
    }).join('');
    return `
      <div class="control-row compact">
        <label>${escapeHtml(label)}</label>
        <select class="select-input" data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: opts.numeric ? 'number' : 'string' })}>${body}</select>
      </div>`;
  }

  function checkbox(label, path, value, opts = {}) {
    return `
      <label class="checkbox-row">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" ${value ? 'checked' : ''} data-path="${escapeHtml(path)}" ${attrs({ ...opts, kind: 'boolean' })}>
      </label>`;
  }

  function segmented(path, value, choices, opts = {}) {
    return `
      <div class="segmented${opts.iconOnly ? ' icon-seg' : ''}" role="radiogroup">
        ${choices.map(([choice, labelText, iconName]) => `
          <button type="button" class="seg-btn${String(choice) === String(value) ? ' active' : ''}" data-seg-path="${escapeHtml(path)}" data-seg-value="${escapeHtml(choice)}" ${attrs(opts)} title="${escapeHtml(labelText)}">
            ${iconName ? icon(iconName) : ''}${opts.iconOnly ? '' : `<span>${escapeHtml(labelText)}</span>`}
          </button>`).join('')}
      </div>`;
  }

  function section(id, title, content, { open = true, actions = '', badge = '' } = {}) {
    return `
      <details class="insp-section" data-section="${escapeHtml(id)}" ${open ? 'open' : ''}>
        <summary><span class="summary-title">${escapeHtml(title)}${badge ? `<em class="summary-badge">${escapeHtml(badge)}</em>` : ''}</span>${actions ? `<span class="summary-actions">${actions}</span>` : ''}</summary>
        <div class="control-group">${content}</div>
      </details>`;
  }

  function syncRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--pct', `${clamp(pct, 0, 100)}%`);
  }

  /* ---------------- font picker ---------------- */

  let fontPicker = null;

  function closeFontPicker() {
    if (!fontPicker) return;
    fontPicker.el.remove();
    fontPicker = null;
  }

  function openFontPicker(anchor, current, onPick, extras = {}) {
    closeFontPicker();
    const el = document.createElement('div');
    el.className = 'font-picker';
    el.innerHTML = `
      <div class="font-picker-head">
        <div class="search-field">${icon('search')}<input type="text" placeholder="搜索字体…" data-font-search></div>
      </div>
      <div class="font-picker-list" data-font-list></div>
      <div class="font-picker-foot">
        <button type="button" class="mini-button" data-font-action="local">${icon('font')}<span>读取本机全部字体</span></button>
        <button type="button" class="mini-button" data-font-action="import">${icon('plus')}<span>导入字体文件</span></button>
      </div>`;
    document.body.appendChild(el);
    const rect = anchor.getBoundingClientRect();
    const width = 300;
    el.style.width = `${width}px`;
    el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    const preferred = Math.min(460, window.innerHeight - 24);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    if (below >= Math.min(preferred, 360) || below >= above) {
      el.style.maxHeight = `${Math.min(preferred, below)}px`;
      el.style.top = `${rect.bottom + 4}px`;
    } else {
      const height = Math.min(preferred, above);
      el.style.maxHeight = `${height}px`;
      el.style.top = `${rect.top - 4 - height}px`;
      el.style.height = `${height}px`;
    }
    const list = el.querySelector('[data-font-list]');
    const search = el.querySelector('[data-font-search]');
    const sample = extras.sample || '永 Aa 字体';

    const draw = () => {
      const query = search.value.trim().toLowerCase();
      const groups = CC.fonts.pickerGroups();
      const recent = (extras.recent || []).filter((family) => CC.fonts.detect(family));
      const all = [];
      if (recent.length && !query) all.push({ id: 'recent', name: '最近使用', fonts: recent.map((family) => ({ family, label: CC.fonts.label(family) })) });
      groups.forEach((group) => all.push(group));
      const html = all.map((group) => {
        const fonts = group.fonts.filter((font) => !query || font.family.toLowerCase().includes(query) || String(font.label).toLowerCase().includes(query));
        if (!fonts.length) return '';
        const limited = fonts.slice(0, group.id === 'local' && !query ? 300 : 600);
        return `<div class="font-group">${escapeHtml(group.name)}</div>${limited.map((font) => `
          <button type="button" class="font-option${font.family === current ? ' selected' : ''}" data-family="${escapeHtml(font.family)}">
            <span class="font-name">${escapeHtml(font.label)}</span>
            <span class="font-sample" style="font-family:${escapeHtml(CC.fonts.stack(font.family))}">${escapeHtml(sample)}</span>
          </button>`).join('')}`;
      }).join('');
      list.innerHTML = html || '<div class="font-empty">没有匹配的字体</div>';
      list.querySelector('.font-option.selected')?.scrollIntoView({ block: 'center' });
    };
    draw();
    search.addEventListener('input', draw);
    list.addEventListener('click', (event) => {
      const option = event.target.closest('[data-family]');
      if (!option) return;
      onPick(option.dataset.family);
      closeFontPicker();
    });
    el.querySelector('[data-font-action="local"]').addEventListener('click', async () => {
      try {
        const families = await CC.fonts.queryLocal();
        extras.onLocalFonts?.(families);
        toast(`已读取 ${families.length} 个本机字体`);
        draw();
      } catch (error) {
        toast(error.message || '无法读取本机字体', 'error');
      }
    });
    el.querySelector('[data-font-action="import"]').addEventListener('click', () => {
      closeFontPicker();
      extras.onImport?.();
    });
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeFontPicker();
      }
    });
    fontPicker = { el };
    search.focus();
  }

  document.addEventListener('mousedown', (event) => {
    if (fontPicker && !fontPicker.el.contains(event.target) && !event.target.closest('[data-font-trigger]')) closeFontPicker();
  });

  CC.ui = {
    icon,
    hydrateIcons,
    toast,
    openMenuAt,
    closeMenus,
    menusOpen,
    openDialog,
    dialogsOpen,
    confirmDialog,
    promptDialog,
    choiceDialog,
    enhanceSelects,
    closeCsel,
    range,
    numberField,
    text,
    color,
    select,
    checkbox,
    segmented,
    section,
    syncRangeFill,
    openFontPicker,
    closeFontPicker,
  };
})();
