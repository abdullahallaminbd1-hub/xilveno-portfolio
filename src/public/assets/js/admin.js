/**
 * Xilveno Portfolio – admin panel.
 *
 * A small, dependency-free single-page admin for the Cloudflare-native
 * portfolio (Workers + D1 + R2). Every page is rendered client side from the
 * JSON APIs under /api/admin/* and shares the public site's design language.
 *
 * Nothing in this file is loaded by the public website.
 */
(() => {
  'use strict';
  const root = document.querySelector('#admin-app');
  if (!root) return;

  /* --------------------------------------------------------------- state */
  const store = { csrf: '', media: null, mediaLoaded: false, home: null, categories: null };

  /* ------------------------------------------------------------- helpers */
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ESCAPES[character]);
  const listOf = (value) => String(value ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const isTrue = (value) => value === 1 || value === true || value === '1' || value === 'true' || value === 'on';
  const normalizeRows = (data) => (Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []));
  const rowsOf = (value) => {
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(String(value ?? '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };
  const humanSize = (size) => {
    const total = Number(size || 0);
    if (!total) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    const power = Math.min(units.length - 1, Math.floor(Math.log(total) / Math.log(1024)));
    return `${(total / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
  };
  const humanDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

  const request = async (path, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (store.csrf && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = store.csrf;
    const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data && data.error ? data.error : `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const mediaUrl = (row) => (row && row.object_key ? `/media/${encodeURIComponent(row.object_key)}` : '');
  const mediaRowById = (id) => (store.media || []).find((row) => String(row.id) === String(id));
  const mediaSrcById = (id) => mediaUrl(mediaRowById(id));
  const loadMedia = async (force = false) => {
    if (!store.mediaLoaded || force) {
      store.media = normalizeRows(await request('/api/admin/media'));
      store.mediaLoaded = true;
    }
    return store.media;
  };

  /* ------------------------------------------------------------ feedback */
  const toastHost = () => {
    let host = document.querySelector('.admin-toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'admin-toasts';
      document.body.appendChild(host);
    }
    return host;
  };
  const notify = (text, kind = 'success') => {
    const node = document.createElement('div');
    node.className = `admin-toast${kind === 'error' ? ' admin-toast--error' : kind === 'info' ? ' admin-toast--info' : ''}`;
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.innerHTML = `<span>${esc(text)}</span><button type="button" class="admin-toast__close" aria-label="Dismiss">×</button>`;
    node.querySelector('.admin-toast__close').addEventListener('click', () => node.remove());
    toastHost().appendChild(node);
    window.setTimeout(() => node.remove(), kind === 'error' ? 9000 : 4500);
    return node;
  };
  const say = (text, error = false) => {
    const target = document.querySelector('#admin-message');
    if (target) target.innerHTML = `<div class="admin-message ${error ? 'admin-error' : 'admin-success'}" role="status">${esc(text)}</div>`;
    notify(text, error ? 'error' : 'success');
  };
  const clearMessage = () => {
    const target = document.querySelector('#admin-message');
    if (target) target.innerHTML = '';
  };
  const confirmDialog = ({ title = 'Are you sure?', text = '', confirmLabel = 'Confirm', danger = true } = {}) => new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = `<div class="admin-modal__panel admin-modal__panel--narrow" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="admin-modal__head"><h3>${esc(title)}</h3></div>
      <div class="admin-modal__body">${text ? `<p style="margin:0">${esc(text)}</p>` : ''}</div>
      <div class="admin-modal__foot"><button type="button" class="admin-button secondary" data-cancel>Cancel</button><button type="button" class="admin-button ${danger ? 'danger solid' : ''}" data-confirm>${esc(confirmLabel)}</button></div>
    </div>`;
    document.body.appendChild(modal);
    const close = (result) => { modal.remove(); resolve(result); };
    modal.addEventListener('click', (event) => { if (event.target === modal) close(false); });
    modal.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    modal.querySelector('[data-confirm]').addEventListener('click', () => close(true));
    modal.querySelector('[data-confirm]').focus();
  });

  const busy = async (button, work) => {
    if (!button) return work();
    button.disabled = true;
    button.classList.add('is-busy');
    try { return await work(); } finally { button.disabled = false; button.classList.remove('is-busy'); }
  };

  /* --------------------------------------------------------------- icons */
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    layout: '<path d="M4 5h16v14H4z"/><path d="M4 9h16"/><path d="M8 13h8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    business: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v9a1 1 0 0 0 1 1h3.5v-5.5h5V20H17a1 1 0 0 0 1-1v-9"/>',
    monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6"/><path d="M12 16.5V20"/>',
    tag: '<path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8-8-8Z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    code: '<path d="m9 8-5 4 5 4"/><path d="m15 8 5 4-5 4"/>',
    warning: '<path d="M12 3.5 21 19H3l9-15.5Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1 .9-1 1.6v.4"/><path d="M12 17h.01"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 4.5-4.2L13 17l3-2.6 4 3.6"/>',
    demos: '<path d="M14 4h6v6"/><path d="m20 4-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z"/>',
    seo: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.5 4.5"/><path d="M8.6 12.4 10.8 8l2.2 4.4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 12h9"/><path d="m13 8-4 4 4 4"/><path d="M10 8H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h5"/>',
    external: '<path d="M14 4h6v6"/><path d="m20 4-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    check: '<path d="m5 13 4 4L19 7"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/>',
    edit: '<path d="M5 19h3l9-9a2 2 0 0 0-3-3l-9 9v3Z"/><path d="m14.5 6.5 3 3"/>',
    eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/>',
    upload: '<path d="M12 16V5"/><path d="m7.5 9.5 4.5-4.5 4.5 4.5"/><path d="M5 19h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    up: '<path d="M12 19V6"/><path d="m6 11 6-6 6 6"/>',
    down: '<path d="M12 5v13"/><path d="m6 13 6 6 6-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    sparkle: '<path d="M12 4.5 13.7 10l5.3 1.7-5.3 1.7L12 18.9 10.3 13.4 5 11.7 10.3 10Z"/>',
    refresh: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16"/><path d="M4 20v-4h4"/>',
  };
  const icon = (name, size = 18) => `<svg class="admin-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.grid}</svg>`;
  /* -------------------------------------------------------------- layout */
  const NAV_GROUPS = [
    { label: 'Overview', items: [['/admin/dashboard', 'Dashboard', 'grid']] },
    { label: 'Pages', items: [['/admin/home', 'Homepage editor', 'layout'], ['/admin/about', 'About page', 'user'], ['/admin/sites/brightsmile', 'BrightSmile Dental', 'business']] },
    { label: 'Content', items: [['/admin/services', 'Services', 'business'], ['/admin/projects', 'Projects', 'monitor'], ['/admin/categories', 'Categories', 'tag'], ['/admin/process', 'Process', 'clock'], ['/admin/skills', 'Skills', 'code'], ['/admin/problems', 'Why it matters', 'warning'], ['/admin/faq', 'FAQ', 'help']] },
    { label: 'Library', items: [['/admin/media', 'Media library', 'image'], ['/admin/demos', 'Demo sites', 'demos']] },
    { label: 'Site', items: [['/admin/settings', 'Settings', 'settings'], ['/admin/seo', 'SEO', 'seo'], ['/admin/forms', 'Inquiries', 'mail']] },
  ];
  const isActive = (active, href) => active === href || (href !== '/admin/dashboard' && active.startsWith(`${href}/`));
  const sidebar = (active, selectedSite) => `<aside class="admin-sidebar" id="admin-sidebar">
    <div class="admin-sidebar__brand"><span class="admin-sidebar__logo" aria-hidden="true">X</span><div><strong>Xilveno</strong><span>Portfolio control centre</span></div></div>
    ${NAV_GROUPS.map((group) => `<div class="admin-nav__group"><p class="admin-nav__label">${esc(group.label)}</p><nav class="admin-nav" aria-label="${esc(group.label)}">${group.items.map(([href, label, iconName]) => {
      const target = selectedSite === 'brightsmile' && href === '/admin/media' ? '/admin/sites/brightsmile?section=images' : href;
      const section = new URLSearchParams(window.location.search).get('section');
      const isBrightSmileEditor = selectedSite === 'brightsmile' && href === '/admin/sites/brightsmile';
      const activeMatch = isActive(active, target.split('?')[0])
        && (target.includes('?section=images') ? section === 'images' : !(isBrightSmileEditor && section === 'images'));
      return `<a href="${target}"${activeMatch ? ' aria-current="page"' : ''}>${icon(iconName, 17)}<span>${esc(selectedSite === 'brightsmile' && label === 'Media library' ? 'BrightSmile media library' : label)}</span></a>`;
    }).join('')}</nav></div>`).join('')}
    <div class="admin-sidebar__foot">
      <a href="${selectedSite === 'brightsmile' ? 'https://dental.xilveno.shop/' : '/'}" target="_blank" rel="noopener">${icon('external', 17)}<span>Open public site</span></a>
      <button type="button" data-logout>${icon('logout', 17)}<span>Log out</span></button>
    </div>
  </aside>`;

  const layout = (content, active, title, options = {}) => {
    const { subtitle = '', actions = '' } = options;
    const selectedSite = active.startsWith('/admin/sites/brightsmile') ? 'brightsmile' : 'portfolio';
    return `<div class="admin-shell"><div class="admin-layout">
      ${sidebar(active, selectedSite)}
      <section class="admin-main">
        <div class="admin-top">
          <div class="admin-top__text">
            <button class="admin-button secondary admin-menu-toggle" type="button" data-menu-toggle>${icon('menu', 16)} Menu</button>
            <h2>${esc(title)}</h2>
            ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
          </div>
          <div class="admin-top__actions">
            <label class="admin-label" style="min-width:190px;margin:0">Manage site
              <select class="admin-select" data-site-switcher aria-label="Select site">
                <option value="portfolio"${selectedSite === 'portfolio' ? ' selected' : ''}>Xilveno Portfolio</option>
                <option value="brightsmile"${selectedSite === 'brightsmile' ? ' selected' : ''}>BrightSmile Dental</option>
              </select>
            </label>
            <a class="admin-button secondary" href="${selectedSite === 'brightsmile' ? 'https://dental.xilveno.shop/' : '/'}" target="_blank" rel="noopener">${icon('external', 16)} View site</a>
            ${actions}
          </div>
        </div>
        <div id="admin-message"></div>
        ${content}
      </section>
    </div></div>`;
  };

  const bindChrome = () => {
    const sidebarNode = document.querySelector('#admin-sidebar');
    const openDrawer = (open) => {
      if (!sidebarNode) return;
      sidebarNode.classList.toggle('is-open', open);
      const existing = document.querySelector('.admin-scrim');
      if (open && !existing) {
        const scrim = document.createElement('button');
        scrim.type = 'button';
        scrim.className = 'admin-scrim';
        scrim.setAttribute('aria-label', 'Close menu');
        scrim.addEventListener('click', () => openDrawer(false));
        document.body.appendChild(scrim);
      } else if (!open && existing) existing.remove();
    };
    document.querySelectorAll('[data-menu-toggle]').forEach((button) => button.addEventListener('click', () => openDrawer(!sidebarNode.classList.contains('is-open'))));
    document.querySelectorAll('[data-site-switcher]').forEach((select) => select.addEventListener('change', () => {
      window.location.href = select.value === 'brightsmile' ? '/admin/sites/brightsmile' : '/admin/dashboard';
    }));
    sidebarNode?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => openDrawer(false)));
    document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
      await busy(button, async () => {
        try { await request('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* session may already be gone */ }
        window.location.href = '/admin/login';
      });
    }));
  };
  /* ------------------------------------------------------- form builders */
  const fieldText = ({ name, label, value = '', hint = '', type = 'text', placeholder = '', autocomplete = '' }) =>
    `<label class="admin-label">${esc(label)}<input class="admin-input" type="${esc(type)}" name="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${autocomplete ? ` autocomplete="${esc(autocomplete)}"` : ''}>${hint ? `<span class="admin-hint">${esc(hint)}</span>` : ''}</label>`;
  const fieldArea = ({ name, label, value = '', hint = '', rows = 5 }) =>
    `<label class="admin-label">${esc(label)}<textarea class="admin-textarea" name="${esc(name)}" rows="${Number(rows) || 5}">${esc(value)}</textarea>${hint ? `<span class="admin-hint">${esc(hint)}</span>` : ''}</label>`;
  const fieldNumber = ({ name, label, value = 0, hint = '' }) =>
    `<label class="admin-label">${esc(label)}<input class="admin-input" type="number" name="${esc(name)}" value="${esc(value)}">${hint ? `<span class="admin-hint">${esc(hint)}</span>` : ''}</label>`;
  const fieldCheck = ({ name, label, checked = false, hint = '' }) =>
    `<div class="admin-field"><label class="admin-check"><input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}> <span>${esc(label)}</span></label>${hint ? `<span class="admin-hint">${esc(hint)}</span>` : ''}</div>`;
  const fieldSelect = ({ name, label, value = '', options = [], hint = '' }) =>
    `<label class="admin-label">${esc(label)}<select class="admin-select" name="${esc(name)}">${options.map((option) => `<option value="${esc(option.value)}"${String(option.value) === String(value ?? '') ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select>${hint ? `<span class="admin-hint">${esc(hint)}</span>` : ''}</label>`;
  const ICON_CHOICES = [
    ['sparkle', 'Sparkle'], ['business', 'Business / building'], ['landing', 'Landing page'], ['ecommerce', 'Online store'],
    ['redesign', 'Redesign / refresh'], ['design', 'Design'], ['support', 'Support / care'], ['code', 'Code'],
    ['seo', 'SEO'], ['responsive', 'Responsive / devices'], ['monitor', 'Monitor'], ['clock', 'Clock / time'],
    ['grid', 'Grid / layout'], ['user', 'Person'], ['warning', 'Warning'], ['check', 'Check / done'],
    ['wordpress', 'WordPress'], ['shopify', 'Shopify'], ['elementor', 'Elementor'], ['figma', 'Figma'],
  ];
  const getField = (form, name) => {
    if (!form || !name) return null;
    try {
      const control = form.elements ? form.elements[name] : null;
      if (control && typeof control === 'object' && !(control instanceof RadioNodeList && control.length === 0)) return control;
    } catch { /* fall through to the attribute lookup */ }
    try { return form.querySelector ? form.querySelector(`[name="${String(name).replace(/"/g, '\\"')}"]`) : null; } catch { return null; }
  };
  const controlValue = (control, fallback = '') => {
    if (!control) return fallback;
    if (control.type === 'checkbox') return control.checked ? 'true' : 'false';
    const value = control.value;
    return value == null ? fallback : String(value);
  };
  const formValues = (form, names) => Object.fromEntries(names.map((name) => [name, controlValue(getField(form, name), '')]));
  const setFormValues = (form, values) => {
    for (const [name, value] of Object.entries(values)) {
      const control = getField(form, name);
      if (!control) continue;
      if (control.type === 'checkbox') control.checked = isTrue(value);
      else control.value = value == null ? '' : String(value);
      control.classList.remove('admin-invalid');
    }
  };
  const markInvalid = (form, name, invalid) => {
    const control = getField(form, name);
    if (control) control.classList.toggle('admin-invalid', Boolean(invalid));
  };
  const requireFields = (form, checks) => {
    let ok = true;
    for (const [name, label] of checks) {
      const value = controlValue(getField(form, name), '').trim();
      const invalid = !value;
      markInvalid(form, name, invalid);
      if (invalid && ok) { say(`${label} is required.`, true); ok = false; }
    }
    return ok;
  };
  const statusChip = (label, tone = '') => `<span class="admin-chip${tone ? ` admin-chip--${tone}` : ''}">${esc(label)}</span>`;
  const note = (text, tone = '') => `<p class="admin-inline-note${tone === 'warn' ? ' admin-inline-note--warn' : ''}" style="margin:0">${icon('info', 16)}<span>${esc(text)}</span></p>`;
  /* ------------------------------------------------------------ pickers */
  const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml';
  const pickerField = ({ name, label, value = '', mode = 'id', hint = '' }) => {
    const control = mode === 'url'
      ? `<input class="admin-input" type="text" name="${esc(name)}" value="${esc(value)}" placeholder="/media/… or https://…" data-picker-source>`
      : `<input type="hidden" name="${esc(name)}" value="${esc(value)}" data-picker-source>`;
    return `<div class="admin-field"><span class="admin-label">${esc(label)}</span><div class="admin-picker" data-picker data-picker-mode="${esc(mode)}">
      ${control}
      <div class="admin-picker-preview" data-picker-preview></div>
      <div class="admin-picker-actions">
        <button type="button" class="admin-button secondary admin-button--sm" data-picker-choose>${icon('image', 16)} Choose from media library</button>
        <button type="button" class="admin-button secondary admin-button--sm" data-picker-upload>${icon('upload', 16)} Upload new image</button>
        <button type="button" class="admin-button ghost admin-button--sm" data-picker-clear>Remove</button>
      </div>
    </div>${hint ? `<span class="admin-hint">${esc(hint)}</span>` : ''}</div>`;
  };
  const pickerSource = (picker) => (picker && picker.querySelector ? picker.querySelector('[data-picker-source]') : null);
  const paintPicker = (picker) => {
    const preview = picker.querySelector('[data-picker-preview]');
    if (!preview) return;
    const source = pickerSource(picker);
    const value = source ? String(source.value || '').trim() : '';
    const mode = picker.dataset.pickerMode || 'id';
    const src = !value ? '' : (mode === 'url' ? value : mediaSrcById(value));
    preview.innerHTML = src
      ? `<img src="${esc(src)}" alt="" loading="lazy">`
      : '<span class="admin-hint" style="padding:10px;text-align:center">No image selected</span>';
  };
  const applyPick = (picker, values) => {
    const source = pickerSource(picker);
    const mode = picker.dataset.pickerMode || 'id';
    if (source && values.length) source.value = mode === 'url' ? mediaUrl(values[0]) : String(values[0].id);
    paintPicker(picker);
  };
  const bindPickers = (scope) => {
    (scope || document).querySelectorAll('[data-picker]').forEach((picker) => {
      paintPicker(picker);
      const source = pickerSource(picker);
      if (source && source.tagName === 'INPUT' && source.type !== 'hidden') source.addEventListener('input', () => paintPicker(picker));
      picker.querySelector('[data-picker-choose]')?.addEventListener('click', async (event) => {
        event.preventDefault();
        const picked = await openMediaLibrary({ title: 'Choose an image from the media library' });
        if (picked.length) applyPick(picker, picked);
      });
      picker.querySelector('[data-picker-upload]')?.addEventListener('click', async (event) => {
        event.preventDefault();
        const uploaded = await uploadFromDisk();
        if (uploaded) applyPick(picker, [uploaded]);
      });
      picker.querySelector('[data-picker-clear]')?.addEventListener('click', () => {
        if (source) source.value = '';
        paintPicker(picker);
      });
    });
  };

  /* ------------------------------------------------------- media upload */
  const uploadFiles = async (files) => {
    if (!files || !files.length) return [];
    const form = new FormData();
    for (const file of files) form.append('files', file);
    const result = await request('/api/admin/media', { method: 'POST', body: form });
    await loadMedia(true);
    const ids = normalizeRows(result.media || []).map((item) => item.id);
    return ids.map((id) => mediaRowById(id)).filter(Boolean);
  };
  const pickFiles = ({ multiple = false } = {}) => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_ACCEPT;
    input.multiple = multiple;
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      window.setTimeout(() => input.remove(), 0);
      resolve(files);
    });
    input.click();
  });
  const uploadFromDisk = async ({ multiple = false } = {}) => {
    const chosen = await pickFiles({ multiple });
    if (!chosen.length) return multiple ? [] : null;
    try {
      const uploaded = await uploadFiles(chosen);
      notify(multiple ? `${uploaded.length} image(s) uploaded.` : 'Image uploaded.');
      return multiple ? uploaded : (uploaded[0] || null);
    } catch (error) { say(error.message, true); return multiple ? [] : null; }
  };
  /* ------------------------------------------------- media library modal */
  const openMediaLibrary = async ({ title = 'Choose an image', multi = false } = {}) => {
    await loadMedia();
    return new Promise((resolve) => {
      let query = '';
      let selected = [];
      const modal = document.createElement('div');
      modal.className = 'admin-modal';
      modal.innerHTML = `<div class="admin-modal__panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="admin-modal__head"><h3>${esc(title)}</h3><button type="button" class="admin-iconbutton" data-close aria-label="Close">${icon('close', 16)}</button></div>
        <div class="admin-modal__body">
          <div class="admin-media-toolbar" style="margin-bottom:16px">
            <label class="admin-label">Search images<input class="admin-input" type="search" data-search placeholder="File name, e.g. hero"></label>
            <div class="admin-actions"><button type="button" class="admin-button secondary" data-upload>${icon('upload', 16)} Upload images</button></div>
          </div>
          <div data-grid></div>
        </div>
        <div class="admin-modal__foot"><span class="admin-hint" data-count style="margin-right:auto"></span>
          <button type="button" class="admin-button secondary" data-close>Cancel</button>
          <button type="button" class="admin-button" data-use>${multi ? 'Add selected images' : 'Use this image'}</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      const grid = modal.querySelector('[data-grid]');
      const count = modal.querySelector('[data-count]');
      const useButton = modal.querySelector('[data-use]');
      const finish = (rows) => { modal.remove(); resolve(rows || []); };
      const render = () => {
        const rows = (store.media || []).filter((row) => !query || String(row.filename || '').toLowerCase().includes(query));
        grid.innerHTML = rows.length
          ? `<div class="admin-media-grid">${rows.map((row) => {
            const active = selected.some((item) => String(item.id) === String(row.id));
            return `<button type="button" class="admin-media-card${active ? ' is-selected' : ''}" data-media="${esc(row.id)}">
              <img class="admin-media-card__thumb" src="${mediaUrl(row)}" alt="${esc(row.alt_text || '')}" loading="lazy">
              <span class="admin-media-card__body"><span class="admin-media-card__name">${esc(row.filename)}</span><span class="admin-media-meta">${row.width ? `${esc(row.width)}×${esc(row.height)}` : 'Image'} · ${esc(humanSize(row.byte_size))}</span></span>
            </button>`;
          }).join('')}</div>`
          : '<p class="admin-empty">No images match that search. Try another name, or upload a new image.</p>';
        grid.querySelectorAll('[data-media]').forEach((button) => button.addEventListener('click', () => {
          const row = (store.media || []).find((item) => String(item.id) === String(button.dataset.media));
          if (!row) return;
          if (multi) {
            selected = selected.some((item) => String(item.id) === String(row.id))
              ? selected.filter((item) => String(item.id) !== String(row.id))
              : [...selected, row];
            render();
          } else finish([row]);
        }));
        count.textContent = multi
          ? `${selected.length} selected · ${rows.length} image(s)`
          : `${rows.length} image(s) available`;
        useButton.disabled = multi ? selected.length === 0 : false;
      };
      useButton.addEventListener('click', () => finish(multi ? selected : []));
      modal.querySelector('[data-search]').addEventListener('input', (event) => { query = event.target.value.trim().toLowerCase(); render(); });
      modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => finish([])));
      modal.addEventListener('click', (event) => { if (event.target === modal) finish([]); });
      modal.querySelector('[data-upload]').addEventListener('click', async () => {
        const uploaded = await uploadFromDisk({ multiple: true });
        if (multi) selected = [...selected, ...uploaded];
        render();
      });
      render();
    });
  };
  /* --------------------------------------------------------------- login */
  const renderLogin = () => {
    root.innerHTML = `<div class="admin-login-wrap"><section class="admin-login">
      <p class="admin-login__brand">Xilveno</p>
      <h1 class="admin-login__brand" style="font-size:22px">Sign in to your panel</h1>
      <p class="admin-login__sub">Manage the website content, projects and media.</p>
      <div id="admin-message"></div>
      <form class="admin-form" id="login-form" novalidate>
        <label class="admin-label">Email address<input class="admin-input" name="email" type="email" value="admin@xilveno.shop" autocomplete="username" required></label>
        <label class="admin-label">Password<input class="admin-input" name="password" type="password" autocomplete="current-password" required></label>
        <button class="admin-button admin-button--block" type="submit">Sign in</button>
      </form>
      <p class="admin-login__foot">Sessions are protected with a secure httpOnly cookie and rate limited against brute-force attempts.</p>
    </section></div>`;
    document.querySelector('#login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      if (!requireFields(form, [['email', 'Email address'], ['password', 'Password']])) return;
      await busy(button, async () => {
        try {
          const data = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(formValues(form, ['email', 'password'])) });
          store.csrf = data.csrfToken || '';
          window.location.href = '/admin/dashboard';
        } catch (error) { say(error.message, true); }
      });
    });
  };

  /* ----------------------------------------------------------- dashboard */
  const ACTIVITY_LABELS = {
    projects: 'project', settings: 'settings', media: 'media library', inquiries: 'inquiry', demos: 'demo site',
    services: 'service', faqs: 'FAQ', process: 'process step', skills: 'skill', categories: 'category', problems: '“why it matters” card',
    project_gallery: 'project gallery', navigation: 'navigation',
  };
  const activityLabel = (row) => {
    const area = ACTIVITY_LABELS[row.entity] || String(row.entity || 'content').replace(/_/g, ' ');
    const verb = row.action === 'create' ? 'Created' : row.action === 'delete' ? 'Deleted' : 'Updated';
    return `${verb} ${area}`;
  };
  const dashboardPage = async () => {
    const data = await request('/api/admin/dashboard');
    const recent = normalizeRows(data.recent || []).filter((row) => row.entity !== 'public-inquiry');
    const stats = [
      ['Total projects', data.projects, '/admin/projects', 'monitor'],
      ['Featured projects', data.featuredProjects, '/admin/projects', 'sparkle'],
      ['Media files', data.media, '/admin/media', 'image'],
      ['Unread inquiries', data.unreadInquiries, '/admin/forms', 'mail'],
    ];
    const content = `<div class="admin-grid">${stats.map(([label, value, href, iconName]) => `<div class="admin-card admin-stat">
        <span class="admin-chip admin-chip--muted" style="width:max-content">${icon(iconName, 14)} ${esc(label)}</span>
        <strong>${esc(value ?? 0)}</strong>
        <a href="${href}">Open ${esc(label.toLowerCase())}</a>
      </div>`).join('')}</div>
      <div class="admin-card">
        <div class="admin-card__head"><div><h3>Quick actions</h3><p>The things you do most often, one click away.</p></div></div>
        <p class="admin-actions"><a class="admin-button" href="/admin/projects/new">${icon('plus', 16)} New project</a><a class="admin-button secondary" href="/admin/media">${icon('upload', 16)} Upload media</a><a class="admin-button secondary" href="/admin/home">${icon('layout', 16)} Edit homepage</a><a class="admin-button secondary" href="/" target="_blank" rel="noopener">${icon('external', 16)} View site</a></p>
      </div>
      <div class="admin-card">
        <div class="admin-card__head"><div><h3>Recent activity</h3><p>Every change made from this panel.</p></div></div>
        ${recent.length ? `<div class="admin-table__wrap"><table class="admin-table"><thead><tr><th>When</th><th>What happened</th><th>Area</th></tr></thead><tbody>${recent.map((row) => `<tr><td style="white-space:nowrap">${esc(humanDate(row.created_at))}</td><td>${esc(activityLabel(row))}</td><td>${esc(ACTIVITY_LABELS[row.entity] || row.entity || 'content')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-empty">Nothing recorded yet. Anything you edit here will be listed.</p>'}
      </div>`;
    root.innerHTML = layout(content, '/admin/dashboard', 'Dashboard', { subtitle: 'A quick overview of the website content and what changed recently.' });
    bindChrome();
  };
  /* ------------------------------------------- homepage visual editor map */
  const HOME_SECTIONS = [
    {
      id: 'hero', label: 'Hero', icon: 'layout', stage: 'hero', key: 'hero',
      summary: 'The first thing visitors see: eyebrow, heading, description, buttons and side panel.',
      groups: [
        { legend: 'Heading', fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text', hint: 'The small label above the heading.' },
          { name: 'title', label: 'Heading', type: 'area', rows: 3, hint: 'Press Enter where the heading should break onto a new line.' },
          { name: 'subtitle', label: 'Description', type: 'area', rows: 3 },
        ] },
        { legend: 'Buttons', fields: [
          { name: 'cta_text', label: 'Primary button label', type: 'text' },
          { name: 'cta_url', label: 'Primary button link', type: 'text', hint: 'A path such as /work/ or a full https:// address.' },
          { name: 'cta2_text', label: 'Secondary button label', type: 'text' },
          { name: 'cta2_url', label: 'Secondary button link', type: 'text' },
        ] },
        { legend: 'Side panel', fields: [
          { name: 'panel_title', label: 'Panel heading', type: 'text' },
          { name: 'panel_points', label: 'Panel bullet points', type: 'list', rows: 4, hint: 'One point per line.' },
        ] },
      ],
    },
    {
      id: 'tech-stack', label: 'Tech stack', icon: 'code', stage: 'hero', key: 'hero', focus: 'tech_strip',
      summary: 'The row of technologies shown under the hero heading. It lives inside the hero section on the live site.',
      groups: [
        { legend: 'Tech stack strip', fields: [
          { name: 'tech_strip', label: 'Technologies under the hero', type: 'list', rows: 8, hint: 'One technology per line, in the order they should appear.' },
        ] },
      ],
    },
    {
      id: 'services', label: 'Services', icon: 'business', stage: 'services', key: 'services_heading',
      summary: 'The heading above the service cards. The cards themselves are managed in the Services section.',
      groups: [
        { legend: 'Section heading', fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
          { name: 'title', label: 'Heading', type: 'text' },
          { name: 'text', label: 'Supporting text', type: 'area', rows: 3 },
        ] },
      ],
      manage: { label: 'Manage the service cards', href: '/admin/services' },
    },
    {
      id: 'work', label: 'Selected work', icon: 'monitor', stage: 'work', key: 'work_heading',
      summary: 'The heading and featured project cards shown on the homepage. Edit the card content and Featured switch in Projects.',
      groups: [
        { legend: 'Section heading', fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
          { name: 'title', label: 'Heading', type: 'text' },
          { name: 'text', label: 'Supporting text', type: 'area', rows: 3 },
        ] },
      ],
      manage: { label: 'Manage selected work and featured projects', href: '/admin/projects' },
    },
    {
      id: 'problems', label: 'Why it matters', icon: 'warning', stage: 'problems', key: 'problems_heading',
      summary: 'The dark band that explains why a website matters. Each card is edited in the “Why it matters” section.',
      groups: [
        { legend: 'Section heading', fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
          { name: 'title', label: 'Heading', type: 'text' },
          { name: 'text', label: 'Supporting text', type: 'area', rows: 3 },
        ] },
      ],
      manage: { label: 'Manage the cards', href: '/admin/problems' },
    },
    {
      id: 'process', label: 'Process', icon: 'clock', stage: 'process', key: 'process_heading',
      summary: 'How the work happens, step by step. The steps themselves live in the Process section.',
      groups: [
        { legend: 'Section heading', fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
          { name: 'title', label: 'Heading', type: 'text' },
          { name: 'text', label: 'Supporting text', type: 'area', rows: 3 },
        ] },
      ],
      manage: { label: 'Manage the process steps', href: '/admin/process' },
    },
    {
      id: 'skills', label: 'Skills', icon: 'code', stage: 'skills', key: 'skills_heading',
      summary: 'The tools and skills band. Individual skills are edited in the Skills section.',
      groups: [
        { legend: 'Section heading', fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
          { name: 'title', label: 'Heading', type: 'text' },
          { name: 'text', label: 'Supporting text', type: 'area', rows: 3 },
        ] },
      ],
      manage: { label: 'Manage skills', href: '/admin/skills' },
    },
    {
      id: 'faq', label: 'FAQ', icon: 'help', stage: 'faq', key: 'faq_heading',
      summary: 'Frequently asked questions shown as an accordion. Questions and answers are edited in the FAQ section.',
      groups: [
        { legend: 'Section heading', fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
          { name: 'title', label: 'Heading', type: 'text' },
          { name: 'text', label: 'Supporting text', type: 'area', rows: 3 },
        ] },
      ],
      manage: { label: 'Manage questions and answers', href: '/admin/faq' },
    },
    {
      id: 'cta', label: 'Final call to action', icon: 'mail', stage: 'cta', key: 'cta',
      summary: 'The closing band that invites visitors to get in touch. It appears at the bottom of every page.',
      groups: [
        { legend: 'Content', fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
          { name: 'title', label: 'Heading', type: 'text' },
          { name: 'text', label: 'Supporting text', type: 'area', rows: 3 },
        ] },
        { legend: 'Buttons', fields: [
          { name: 'cta_text', label: 'Primary button label', type: 'text' },
          { name: 'cta_url', label: 'Primary button link', type: 'text' },
          { name: 'cta2_text', label: 'Secondary button label', type: 'text' },
          { name: 'cta2_url', label: 'Secondary button link', type: 'text' },
        ] },
      ],
    },
  ];
  const sectionFieldMarkup = (field, value) => {
    if (field.type === 'area') return fieldArea({ name: field.name, label: field.label, value: String(value ?? ''), hint: field.hint, rows: field.rows || 4 });
    if (field.type === 'list') return fieldArea({ name: field.name, label: field.label, value: rowsOf(value).map((item) => String(item ?? '')).join('\n'), hint: field.hint, rows: field.rows || 4 });
    return fieldText({ name: field.name, label: field.label, value: String(value ?? ''), hint: field.hint });
  };

  const homeState = { activeId: 'hero', data: {}, settings: {} };
  const currentSection = () => HOME_SECTIONS.find((item) => item.id === homeState.activeId) || HOME_SECTIONS[0];

  const renderHomePanel = () => {
    const panel = document.querySelector('[data-panel]');
    if (!panel) return;
    const section = currentSection();
    const source = homeState.data[section.key] || {};
    const groups = section.focus
      ? [...section.groups].sort((a, b) => (a.fields.some((field) => field.name === section.focus) ? -1 : 0) - (b.fields.some((field) => field.name === section.focus) ? -1 : 0))
      : section.groups;
    const fieldsHtml = groups.map((group) => `<fieldset class="admin-fieldset"><legend class="admin-fieldset__legend">${esc(group.legend)}</legend>${group.fields.map((field) => sectionFieldMarkup(field, source[field.name])).join('')}</fieldset>`).join('');
    const imagesHtml = (section.images || []).map((image) => `<fieldset class="admin-fieldset"><legend class="admin-fieldset__legend">Image</legend>${pickerField({ name: image.name, label: image.label, value: homeState.settings[image.name] || '', hint: image.hint })}</fieldset>`).join('');
    panel.innerHTML = `<div class="admin-editor__panel-head"><div><h3>${esc(section.label)}</h3><p class="admin-hint">${esc(section.summary)}</p></div></div>
      ${section.manage ? `<p class="admin-actions" style="margin-bottom:16px"><a class="admin-button ghost admin-button--sm" href="${section.manage.href}">${icon('arrow', 15)} ${esc(section.manage.label)}</a></p>` : ''}
      <form class="admin-form" data-home-form novalidate>
        ${fieldsHtml}${imagesHtml}
        <div class="admin-editor__panel-actions">
          <button class="admin-button" type="submit">Save changes</button>
          <button class="admin-button secondary" type="button" data-cancel>Cancel</button>
          <a class="admin-button ghost" href="/" target="_blank" rel="noopener">${icon('external', 15)} View live</a>
        </div>
      </form>`;
    bindPickers(panel);
    const form = panel.querySelector('[data-home-form]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      await busy(button, async () => {
        try {
          const payload = { ...(homeState.data[section.key] || {}) };
          for (const group of section.groups) {
            for (const field of group.fields) {
              const raw = controlValue(getField(form, field.name), '');
              payload[field.name] = field.type === 'list' ? listOf(raw) : raw;
            }
          }
          const settingsPayload = {};
          for (const image of (section.images || [])) settingsPayload[image.name] = controlValue(getField(form, image.name), '');
          await request('/api/admin/home', { method: 'POST', body: JSON.stringify({ [section.key]: payload }) });
          if (Object.keys(settingsPayload).length) await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settingsPayload) });
          homeState.data[section.key] = payload;
          homeState.settings = { ...homeState.settings, ...settingsPayload };
          say('Saved. The preview and the live website now show these changes.');
          refreshFrame();
        } catch (error) { say(error.message, true); }
      });
    });
    form.querySelector('[data-cancel]').addEventListener('click', async () => {
      const home = await request('/api/admin/home');
      homeState.data = home || {};
      renderHomePanel();
      say('Changes discarded.', false);
    });
    if (section.focus) {
      const target = getField(form, section.focus);
      if (target && target.focus) target.focus({ preventScroll: true });
    }
  };
  const frameSource = () => `/?xilveno-editor=${Date.now()}`;
  const refreshFrame = () => {
    const frame = document.querySelector('[data-frame]');
    if (frame) frame.src = frameSource();
  };
  const frameDocument = () => {
    const frame = document.querySelector('[data-frame]');
    if (!frame) return null;
    try { return frame.contentDocument || null; } catch { return null; }
  };
  const paintFrameSelection = (scrollTo = false) => {
    const doc = frameDocument();
    if (!doc || !doc.body) return;
    if (!doc.getElementById('xilveno-editor-style')) {
      const style = doc.createElement('style');
      style.id = 'xilveno-editor-style';
      style.textContent = '[data-admin-section]{position:relative;cursor:pointer;transition:box-shadow .15s ease}'
        + '[data-admin-section]:hover{box-shadow:inset 0 0 0 2px rgba(37,99,235,.55)}'
        + '[data-admin-section].xilveno-editor-selected{box-shadow:inset 0 0 0 3px #2563eb}'
        + '[data-admin-section]::after{content:attr(data-admin-section);position:absolute;top:10px;right:10px;z-index:20;background:#2563eb;color:#fff;font:700 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:6px 9px;border-radius:99px;letter-spacing:.06em;text-transform:uppercase;opacity:0;transition:opacity .15s ease;pointer-events:none}'
        + '[data-admin-section]:hover::after,[data-admin-section].xilveno-editor-selected::after{opacity:1}';
      (doc.head || doc.documentElement).appendChild(style);
    }
    const stage = currentSection().stage;
    doc.querySelectorAll('[data-admin-section]').forEach((node) => {
      node.classList.toggle('xilveno-editor-selected', node.getAttribute('data-admin-section') === stage);
      if (node.getAttribute('data-xilveno-bound') === '1') return;
      node.setAttribute('data-xilveno-bound', '1');
      node.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = node.getAttribute('data-admin-section');
        const target = HOME_SECTIONS.find((item) => item.stage === id);
        if (target) selectHomeSection(target.id, true);
      }, true);
    });
    doc.querySelectorAll('a').forEach((link) => {
      if (link.getAttribute('data-xilveno-bound') === '1') return;
      link.setAttribute('data-xilveno-bound', '1');
      link.addEventListener('click', (event) => event.preventDefault(), true);
    });
    if (scrollTo) {
      const node = doc.querySelector(`[data-admin-section="${stage}"]`);
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'start' });
    }
  };
  const selectHomeSection = (id, scrollTo = false) => {
    homeState.activeId = id;
    document.querySelectorAll('[data-section-list] [data-select]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.select === id);
      button.setAttribute('aria-pressed', button.dataset.select === id ? 'true' : 'false');
    });
    renderHomePanel();
    paintFrameSelection(scrollTo);
  };

  const homeEditorPage = async () => {
    const [home, siteSettings] = await Promise.all([request('/api/admin/home'), request('/api/admin/settings')]);
    homeState.data = home || {};
    homeState.settings = siteSettings || {};
    homeState.activeId = HOME_SECTIONS[0].id;
    const content = `<div class="admin-editor">
      <aside class="admin-editor__rail">
        <h3>Homepage sections</h3>
        <p class="admin-hint">Click a section to edit it. Saving updates the preview and the live website.</p>
        <ul class="admin-section-list" data-section-list>
          ${HOME_SECTIONS.map((section) => `<li><button type="button" data-select="${section.id}" aria-pressed="${section.id === homeState.activeId ? 'true' : 'false'}">${icon(section.icon, 16)}<span>${esc(section.label)}</span></button></li>`).join('')}
        </ul>
      </aside>
      <div class="admin-editor__stage">
        <div class="admin-stage-bar">
          <strong>Live preview</strong>
          <div class="admin-actions">
            <div class="admin-tabs" style="margin:0" role="group" aria-label="Preview width">
              <button type="button" data-device="desktop" aria-pressed="true">Desktop</button>
              <button type="button" data-device="tablet" aria-pressed="false">Tablet</button>
              <button type="button" data-device="mobile" aria-pressed="false">Mobile</button>
            </div>
            <button type="button" class="admin-button secondary admin-button--sm" data-refresh>${icon('refresh', 15)} Reload preview</button>
          </div>
        </div>
        <div class="admin-stage" data-stage><iframe title="Homepage preview" data-frame src="${frameSource()}"></iframe></div>
      </div>
      <aside class="admin-editor__panel" data-panel aria-live="polite"></aside>
    </div>`;
    root.innerHTML = layout(content, '/admin/home', 'Homepage editor', { subtitle: 'Click a section in the live preview (or in the list) and edit its content on the right.' });
    bindChrome();
    const frame = root.querySelector('[data-frame]');
    frame.addEventListener('load', () => paintFrameSelection(false));
    root.querySelectorAll('[data-section-list] [data-select]').forEach((button) => button.addEventListener('click', () => selectHomeSection(button.dataset.select, true)));
    root.querySelector('[data-refresh]').addEventListener('click', () => refreshFrame());
    root.querySelectorAll('[data-device]').forEach((button) => button.addEventListener('click', () => {
      const stage = root.querySelector('[data-stage]');
      stage.className = `admin-stage${button.dataset.device === 'desktop' ? '' : ` admin-stage--${button.dataset.device}`}`;
      root.querySelectorAll('[data-device]').forEach((other) => other.setAttribute('aria-pressed', other === button ? 'true' : 'false'));
    }));
    renderHomePanel();
  };
  /* -------------------------------------------------------- collections */
  const COLLECTIONS = {
    services: {
      title: 'Services', singular: 'service', icon: 'business', blurb: 'Services appear as cards on the homepage and as detailed blocks on the services page.',
      fields: [
        { name: 'title', label: 'Service name', type: 'text', required: true, hint: 'Shown as the card heading.' },
        { name: 'slug', label: 'Link name (slug)', type: 'text', required: true, hint: 'Lowercase letters, numbers and hyphens, e.g. business-websites.' },
        { name: 'icon', label: 'Icon', type: 'icon' },
        { name: 'description', label: 'Short description on the card', type: 'area', rows: 3 },
        { name: 'overview', label: 'Overview paragraph on the services page', type: 'area', rows: 3 },
        { name: 'audience', label: 'Who it is for', type: 'area', rows: 3 },
        { name: 'includes_json', label: 'What is included', type: 'list', rows: 5, hint: 'One item per line.' },
        { name: 'workflow_json', label: 'How it works', type: 'list', rows: 5, hint: 'One step per line, in order.' },
        { name: 'sort_order', label: 'Order', type: 'number', hint: 'Lower numbers appear first.' },
        { name: 'active', label: 'Show this service on the website', type: 'check' },
      ],
    },
    process: {
      title: 'Process steps', singular: 'process step', icon: 'clock', blurb: 'The numbered steps shown in the process section of the homepage and the process page.',
      fields: [
        { name: 'title', label: 'Step name', type: 'text', required: true },
        { name: 'description', label: 'Step description', type: 'area', rows: 3 },
        { name: 'sort_order', label: 'Order', type: 'number', hint: 'Lower numbers appear first.' },
        { name: 'active', label: 'Show this step on the website', type: 'check' },
      ],
    },
    skills: {
      title: 'Skills', singular: 'skill', icon: 'code', blurb: 'Tools and skills listed in the skills band on the homepage and the about page.',
      fields: [
        { name: 'title', label: 'Skill or tool', type: 'text', required: true },
        { name: 'description', label: 'Description', type: 'area', rows: 3 },
        { name: 'icon', label: 'Icon', type: 'icon' },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'active', label: 'Show this skill on the website', type: 'check' },
      ],
    },
    problems: {
      title: 'Why it matters', singular: 'card', icon: 'warning', blurb: 'The dark band on the homepage that explains why a website matters.',
      fields: [
        { name: 'title', label: 'Card heading', type: 'text', required: true },
        { name: 'description', label: 'Card description', type: 'area', rows: 3 },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'active', label: 'Show this card on the website', type: 'check' },
      ],
    },
    faqs: {
      title: 'FAQ', singular: 'question', icon: 'help', blurb: 'Questions and answers shown in the FAQ accordion on the homepage and the FAQ page.',
      fields: [
        { name: 'question', label: 'Question', type: 'text', required: true },
        { name: 'answer', label: 'Answer', type: 'area', rows: 5 },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'active', label: 'Show this question on the website', type: 'check' },
      ],
    },
    categories: {
      title: 'Categories', singular: 'category', icon: 'tag', blurb: 'Categories group your projects and appear on project cards.',
      fields: [
        { name: 'name', label: 'Category name', type: 'text', required: true },
        { name: 'slug', label: 'Link name (slug)', type: 'text', required: true, hint: 'Lowercase letters, numbers and hyphens.' },
        { name: 'description', label: 'Description', type: 'area', rows: 3 },
        { name: 'sort_order', label: 'Order', type: 'number' },
      ],
    },
  };
  const collectionFieldMarkup = (field, row) => {
    const value = row ? row[field.name] : (field.type === 'number' ? 0 : field.type === 'check' ? true : '');
    if (field.type === 'area') return fieldArea({ name: field.name, label: field.label, value: String(value ?? ''), hint: field.hint, rows: field.rows });
    if (field.type === 'list') return fieldArea({ name: field.name, label: field.label, value: rowsOf(value ?? '[]').map((item) => String(item ?? '')).join('\n'), hint: field.hint, rows: field.rows });
    if (field.type === 'number') return fieldNumber({ name: field.name, label: field.label, value: value ?? 0, hint: field.hint });
    if (field.type === 'check') return fieldCheck({ name: field.name, label: field.label, checked: isTrue(value), hint: field.hint });
    if (field.type === 'icon') return fieldSelect({ name: field.name, label: field.label, value: value || 'sparkle', options: ICON_CHOICES.map(([iconValue, iconLabel]) => ({ value: iconValue, label: iconLabel })), hint: field.hint || 'Uses the same icon style as the public website.' });
    return fieldText({ name: field.name, label: field.label, value: String(value ?? ''), hint: field.hint });
  };
  const collectionPayload = (config, form) => {
    const payload = {};
    for (const field of config.fields) {
      const control = getField(form, field.name);
      const raw = controlValue(control, field.type === 'check' ? 'false' : '');
      if (field.type === 'check') payload[field.name] = control && control.checked ? 'true' : 'false';
      else if (field.type === 'list') payload[field.name] = JSON.stringify(listOf(raw));
      else payload[field.name] = raw;
    }
    return payload;
  };
  const rowTitle = (config, row) => String(row[config.fields[0].name] ?? '(untitled)');
  const collectionRowMarkup = (config, row, index, total) => `<div class="admin-card admin-card--tight" data-row="${esc(row.id)}">
    <div class="admin-card__head" style="margin-bottom:0">
      <div>
        <h3 style="font-size:16px">${esc(rowTitle(config, row))}</h3>
        <p class="admin-hint">${config.fields.some((field) => field.name === 'active') ? (isTrue(row.active) ? 'Visible on the website' : 'Hidden from the website') : ''}${row.slug ? ` · /${esc(row.slug)}` : ''}</p>
      </div>
      <div class="admin-actions">
        ${statusChip(`#${index + 1}`, 'muted')}
        <button type="button" class="admin-iconbutton" data-move="up"${index === 0 ? ' disabled' : ''} aria-label="Move up">${icon('up', 15)}</button>
        <button type="button" class="admin-iconbutton" data-move="down"${index === total - 1 ? ' disabled' : ''} aria-label="Move down">${icon('down', 15)}</button>
        <button type="button" class="admin-button secondary admin-button--sm" data-edit aria-expanded="false">${icon('edit', 15)} Edit</button>
        <button type="button" class="admin-button danger admin-button--sm" data-delete>${icon('trash', 15)} Delete</button>
      </div>
    </div>
    <form class="admin-form" data-row-form data-id="${esc(row.id)}" hidden style="margin-top:18px">
      <div class="admin-split">${config.fields.map((field) => collectionFieldMarkup(field, row)).join('')}</div>
      <div class="admin-actions"><button class="admin-button" type="submit">Save changes</button><button class="admin-button secondary" type="button" data-close>Cancel</button></div>
    </form>
  </div>`;
  const collectionAddMarkup = (config) => `<div class="admin-card" data-add-card>
    <div class="admin-card__head">
      <div><h3>Add ${esc(config.singular)}</h3><p>${esc(config.blurb)}</p></div>
      <button type="button" class="admin-button" data-add-toggle>${icon('plus', 16)} Add ${esc(config.singular)}</button>
    </div>
    <form class="admin-form" data-row-form data-id="" hidden style="margin-top:18px">
      <div class="admin-split">${config.fields.map((field) => collectionFieldMarkup(field, null)).join('')}</div>
      <div class="admin-actions"><button class="admin-button" type="submit">Create ${esc(config.singular)}</button><button class="admin-button secondary" type="button" data-close>Cancel</button></div>
    </form>
  </div>`;
  const bindCollection = (config, resource, rows, reload) => {
    root.querySelectorAll('[data-row-form]').forEach((form) => {
      const id = form.dataset.id;
      const isNew = !id;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const required = config.fields.filter((field) => field.required).map((field) => [field.name, field.label]);
        if (required.length && !requireFields(form, required)) return;
        const button = form.querySelector('button[type="submit"]');
        await busy(button, async () => {
          try {
            const payload = collectionPayload(config, form);
            if (!isNew) payload.id = id;
            await request(`/api/admin/${resource}`, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(payload) });
            say(isNew ? `New ${config.singular} created.` : 'Changes saved.');
            await reload();
          } catch (error) { say(error.message, true); }
        });
      });
      form.querySelector('[data-close]')?.addEventListener('click', () => {
        form.hidden = true;
        form.closest('[data-row]')?.querySelector('[data-edit]')?.setAttribute('aria-expanded', 'false');
      });
    });
    root.querySelectorAll('[data-add-toggle]').forEach((button) => button.addEventListener('click', () => {
      const form = root.querySelector('[data-add-card] [data-row-form]');
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) getField(form, config.fields[0].name)?.focus();
    }));
    root.querySelectorAll('[data-row]').forEach((card, index) => {
      const form = card.querySelector('[data-row-form]');
      const edit = card.querySelector('[data-edit]');
      if (edit && form) edit.addEventListener('click', () => {
        form.hidden = !form.hidden;
        edit.setAttribute('aria-expanded', form.hidden ? 'false' : 'true');
      });
      card.querySelector('[data-delete]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const confirmed = await confirmDialog({ title: `Delete this ${config.singular}?`, text: 'It will be removed from the website immediately. This cannot be undone.', confirmLabel: 'Delete' });
        if (!confirmed) return;
        await busy(button, async () => {
          try {
            await request(`/api/admin/${resource}`, { method: 'DELETE', body: JSON.stringify({ id: card.dataset.row }) });
            notify(`${config.singular} deleted.`);
            await reload();
          } catch (error) { say(error.message, true); }
        });
      });
      const move = async (direction) => {
        const target = index + direction;
        if (target < 0 || target >= rows.length) return;
        const order = [...rows];
        [order[index], order[target]] = [order[target], order[index]];
        try {
          // Sequential rather than parallel: one request at a time keeps the
          // writes ordered and avoids a burst of simultaneous updates.
          for (const [position, row] of order.entries()) {
            await request(`/api/admin/${resource}`, { method: 'PUT', body: JSON.stringify({ id: row.id, sort_order: position }) });
          }
          notify('Order updated.');
          await reload();
        } catch (error) { say(error.message, true); }
      };
      card.querySelector('[data-move="up"]')?.addEventListener('click', (event) => busy(event.currentTarget, () => move(-1)));
      card.querySelector('[data-move="down"]')?.addEventListener('click', (event) => busy(event.currentTarget, () => move(1)));
    });
  };

  const collectionPage = async (resource) => {
    const config = COLLECTIONS[resource];
    const rows = normalizeRows(await request(`/api/admin/${resource}`));
    const reload = () => collectionPage(resource);
    const content = `${collectionAddMarkup(config)}
      <div class="admin-stack">${rows.length ? rows.map((row, index) => collectionRowMarkup(config, row, index, rows.length)).join('') : `<p class="admin-empty">Nothing here yet. Use “Add ${esc(config.singular)}” above to create the first one.</p>`}</div>`;
    root.innerHTML = layout(content, resource === 'faqs' ? '/admin/faq' : `/admin/${resource}`, config.title, { subtitle: `${rows.length} item(s). Use the arrow buttons to change the order they appear in.` });
    bindChrome();
    bindCollection(config, resource, rows, reload);
  };
  /* --------------------------------------------------------------- about */
  const valueRowMarkup = (value = {}) => `<div class="admin-card admin-card--tight" data-value-row>
    <div class="admin-split">
      <label class="admin-label">Value heading<input class="admin-input" data-value-title value="${esc(value.title || '')}" placeholder="e.g. Clear communication"></label>
      <label class="admin-label">Value description<textarea class="admin-textarea admin-textarea--sm" data-value-text placeholder="One or two sentences about this value.">${esc(value.text || '')}</textarea></label>
    </div>
    <p class="admin-actions" style="margin-top:12px"><button type="button" class="admin-button danger admin-button--sm" data-value-remove>${icon('trash', 15)} Remove</button></p>
  </div>`;

  const aboutPage = async () => {
    const [home, siteSettings] = await Promise.all([request('/api/admin/home'), request('/api/admin/settings')]);
    const about = home.about || {};
    const profile = about.profile || {};
    const values = rowsOf(about.values);
    const content = `<form class="admin-stack" data-about-form novalidate>
      <section class="admin-card">
        <div class="admin-card__head"><div><h3>Introduction</h3><p>Shown at the top of the about page.</p></div></div>
        <div class="admin-form">
          ${fieldText({ name: 'intro_title', label: 'Main heading', value: String(about.intro_title ?? '') })}
          ${fieldArea({ name: 'intro_text', label: 'Paragraphs', value: rowsOf(about.intro_text).map((item) => String(item ?? '')).join('\n'), rows: 7, hint: 'One paragraph per line. Each line becomes its own paragraph.' })}
        </div>
      </section>
      <section class="admin-card">
        <div class="admin-card__head"><div><h3>Profile summary</h3><p>The two quick facts shown next to your portrait.</p></div></div>
        <div class="admin-split">
          ${fieldText({ name: 'profile_focus', label: 'Focus', value: String(profile.focus ?? ''), hint: 'e.g. Business websites and Shopify stores' })}
          ${fieldText({ name: 'profile_working', label: 'Working with', value: String(profile.working ?? ''), hint: 'e.g. Small teams and solo founders' })}
        </div>
      </section>
      <section class="admin-card">
        <div class="admin-card__head"><div><h3>Values</h3><p>How you work, as a short list of cards.</p></div><button type="button" class="admin-button secondary" data-value-add>${icon('plus', 16)} Add value</button></div>
        <div class="admin-fieldset">
          ${fieldText({ name: 'values_title', label: 'Values heading', value: String(about.values_title ?? '') })}
          <div class="admin-stack" data-values>${values.length ? values.map((value) => valueRowMarkup(value)).join('') : valueRowMarkup({})}</div>
        </div>
      </section>
      <section class="admin-card">
        <div class="admin-card__head"><div><h3>Portrait</h3><p>Shown in the portrait frame on the public About page.</p></div></div>
        ${pickerField({ name: 'about_image_media_id', label: 'About page portrait', value: siteSettings.about_image_media_id || '', hint: 'Choose an existing image or upload one. Removing it restores the default portrait placeholder.' })}
      </section>
      <div class="admin-card">
        <div class="admin-card__head"><div><h3>Related content</h3><p>The about page also lists your skills.</p></div></div>
        <p class="admin-actions"><a class="admin-button secondary" href="/admin/skills">${icon('code', 16)} Manage skills</a><a class="admin-button secondary" href="/admin/settings">${icon('settings', 16)} Site settings</a><a class="admin-button secondary" href="/about/" target="_blank" rel="noopener">${icon('external', 16)} View about page</a></p>
      </div>
      <div class="admin-card admin-card__head" style="margin-bottom:0">
        <p class="admin-hint">Changes go live straight away — no deployment needed.</p>
        <div class="admin-actions"><button class="admin-button" type="submit">Save about page</button><button class="admin-button secondary" type="button" data-cancel>Cancel</button></div>
      </div>
    </form>`;
    root.innerHTML = layout(content, '/admin/about', 'About page', { subtitle: 'Everything visitors read on the about page.' });
    bindChrome();
    bindPickers(root);
    const form = root.querySelector('[data-about-form]');
    const valuesBox = form.querySelector('[data-values]');
    form.querySelector('[data-value-add]').addEventListener('click', () => valuesBox.insertAdjacentHTML('beforeend', valueRowMarkup({})));
    valuesBox.addEventListener('click', (event) => {
      const button = event.target.closest('[data-value-remove]');
      if (button) button.closest('[data-value-row]').remove();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      await busy(button, async () => {
        try {
          const payload = {
            ...about,
            intro_title: controlValue(getField(form, 'intro_title'), ''),
            intro_text: listOf(controlValue(getField(form, 'intro_text'), '')),
            profile: { focus: controlValue(getField(form, 'profile_focus'), ''), working: controlValue(getField(form, 'profile_working'), '') },
            values_title: controlValue(getField(form, 'values_title'), ''),
            values: Array.from(valuesBox.querySelectorAll('[data-value-row]')).map((row) => ({
              title: String(row.querySelector('[data-value-title]').value || '').trim(),
              text: String(row.querySelector('[data-value-text]').value || '').trim(),
            })).filter((item) => item.title || item.text),
          };
          await request('/api/admin/home', { method: 'POST', body: JSON.stringify({ about: payload }) });
          await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ about_image_media_id: controlValue(getField(form, 'about_image_media_id'), '') }) });
          say('About page saved.');
        } catch (error) { say(error.message, true); }
      });
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => aboutPage());
  };
  /* ------------------------------------------------------------ projects */
  const PROJECT_GROUPS = [
    { legend: 'Basic info', fields: [
      { name: 'title', label: 'Project title', type: 'text', required: true },
      { name: 'slug', label: 'Link name (slug)', type: 'text', required: true, hint: 'Used for /work/your-slug/ — lowercase letters, numbers and hyphens.' },
      { name: 'short_description', label: 'Short description', type: 'area', rows: 3, hint: 'Shown on the project card and at the top of the case study.' },
      { name: 'full_description', label: 'Full description', type: 'area', rows: 6 },
    ] },
    { legend: 'Project details', fields: [
      { name: 'project_type', label: 'Project type', type: 'select', options: [
        { value: 'Portfolio Demo', label: 'Portfolio Demo' },
        { value: 'Client Project', label: 'Client Project' },
        { value: 'External Project', label: 'External Project' },
      ] },
      { name: 'platform', label: 'Platform', type: 'text', hint: 'e.g. WordPress, Shopify, custom.' },
      { name: 'role', label: 'Your role', type: 'text', hint: 'e.g. Design and build.' },
      { name: 'focus', label: 'Focus', type: 'text', hint: 'e.g. Conversions and clarity.' },
      { name: 'status', label: 'Status', type: 'text', hint: 'e.g. Concept or Live.' },
    ] },
    { legend: 'Case study', fields: [
      { name: 'challenge', label: 'Challenge', type: 'area', rows: 4, hint: 'What problem needed solving?' },
      { name: 'approach', label: 'Approach', type: 'area', rows: 4, hint: 'How you tackled it.' },
      { name: 'solution', label: 'Solution', type: 'area', rows: 4, hint: 'What you delivered.' },
      { name: 'key_features_json', label: 'Key features', type: 'list', rows: 5, hint: 'One feature per line.' },
      { name: 'technologies_json', label: 'Technologies', type: 'list', rows: 4, hint: 'One technology per line.' },
    ] },
    { legend: 'Publishing', fields: [
      { name: 'published', label: 'Published — visible on the website', type: 'check' },
      { name: 'featured', label: 'Featured on the homepage', type: 'check' },
      { name: 'sort_order', label: 'Order', type: 'number', hint: 'Lower numbers appear first.' },
    ] },
    { legend: 'Live demo', fields: [
      { name: 'live_demo_url', label: 'Live demo URL', type: 'text', hint: 'Full https:// address. Leave empty if there is no live demo.' },
      { name: 'case_study_url', label: 'External case study URL', type: 'text', hint: 'Optional link to an outside write-up.' },
    ] },
  ];
  const PROJECT_FIELD_NAMES = PROJECT_GROUPS.flatMap((group) => group.fields.map((field) => field.name));
  const projectFieldMarkup = (field, row) => {
    const value = row ? row[field.name] : (field.name === 'published' ? true : field.name === 'sort_order' ? 0 : field.name === 'project_type' ? 'Portfolio Demo' : '');
    if (field.type === 'area') return fieldArea({ name: field.name, label: field.label, value: String(value ?? ''), hint: field.hint, rows: field.rows });
    if (field.type === 'list') return fieldArea({ name: field.name, label: field.label, value: rowsOf(value ?? '[]').map((item) => String(item ?? '')).join('\n'), hint: field.hint, rows: field.rows });
    if (field.type === 'select') {
      const options = field.options.some((option) => String(option.value) === String(value)) ? field.options : [...field.options, { value, label: String(value) }];
      return fieldSelect({ name: field.name, label: field.label, value, options, hint: field.hint });
    }
    if (field.type === 'number') return fieldNumber({ name: field.name, label: field.label, value: value ?? 0, hint: field.hint });
    if (field.type === 'check') return fieldCheck({ name: field.name, label: field.label, checked: isTrue(value), hint: field.hint });
    return fieldText({ name: field.name, label: field.label, value: String(value ?? ''), hint: field.hint });
  };
  const projectPayload = (form) => {
    const payload = {};
    for (const group of PROJECT_GROUPS) {
      for (const field of group.fields) {
        const control = getField(form, field.name);
        if (!control) continue;
        if (field.type === 'check') payload[field.name] = control.checked ? 'true' : 'false';
        else if (field.type === 'list') payload[field.name] = JSON.stringify(listOf(controlValue(control, '')));
        else payload[field.name] = controlValue(control, '');
      }
    }
    payload.category_id = controlValue(getField(form, 'category_id'), '');
    payload.featured_image_id = controlValue(getField(form, 'featured_image_id'), '');
    payload.case_study_media_id = controlValue(getField(form, 'case_study_media_id'), '');
    return payload;
  };
  const projectsPage = async () => {
    const rows = normalizeRows(await request('/api/admin/projects'));
    try { await loadMedia(); } catch { /* thumbnails are optional */ }
    const table = rows.length ? `<div class="admin-table__wrap"><table class="admin-table">
      <thead><tr><th>Project</th><th>Category</th><th>Type</th><th>Visibility</th><th>Order</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((row) => {
        const thumb = row.featured_image_id ? mediaSrcById(row.featured_image_id) : '';
        return `<tr>
          <td><div class="admin-cell">${thumb ? `<img class="admin-table__thumb" src="${esc(thumb)}" alt="">` : '<span class="admin-table__thumb" aria-hidden="true"></span>'}<div><strong>${esc(row.title)}</strong><br><span class="admin-hint">/work/${esc(row.slug)}/</span></div></div></td>
          <td>${esc(row.category_name || '—')}</td>
          <td>${esc(row.project_type || '—')}</td>
          <td>${isTrue(row.published) ? statusChip('Published', 'ok') : statusChip('Draft', 'muted')}${isTrue(row.featured) ? ` ${statusChip('Featured', 'info')}` : ''}</td>
          <td>${esc(row.sort_order ?? 0)}</td>
          <td><div class="admin-actions">
            <a class="admin-button secondary admin-button--sm" href="/admin/projects/${esc(row.id)}">${icon('edit', 15)} Edit</a>
            <a class="admin-button ghost admin-button--sm" href="/work/${esc(row.slug)}/" target="_blank" rel="noopener">${icon('eye', 15)} Preview</a>
            <button type="button" class="admin-button danger admin-button--sm" data-project-delete="${esc(row.id)}">${icon('trash', 15)} Delete</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="admin-empty">No projects yet. Create the first one with “New project”.</p>';
    const content = `<div class="admin-card">
      <div class="admin-card__head"><div><h3>All projects</h3><p>Published projects appear on the work page. Featured projects also appear on the homepage.</p></div><a class="admin-button" href="/admin/projects/new">${icon('plus', 16)} New project</a></div>
      ${table}
    </div>`;
    root.innerHTML = layout(content, '/admin/projects', 'Projects', { subtitle: `${rows.length} project(s).` });
    bindChrome();
    root.querySelectorAll('[data-project-delete]').forEach((button) => button.addEventListener('click', async (event) => {
      const target = event.currentTarget;
      const confirmed = await confirmDialog({ title: 'Delete this project?', text: 'The project and its case study page will be removed. This cannot be undone.', confirmLabel: 'Delete project' });
      if (!confirmed) return;
      await busy(target, async () => {
        try {
          await request('/api/admin/projects', { method: 'DELETE', body: JSON.stringify({ id: target.dataset.projectDelete }) });
          notify('Project deleted.');
          await projectsPage();
        } catch (error) { say(error.message, true); }
      });
    }));
  };
  const projectEditorPage = async (id) => {
    const [rows, categoryRows] = await Promise.all([request('/api/admin/projects'), request('/api/admin/categories')]);
    const list = normalizeRows(rows);
    const row = id ? list.find((item) => String(item.id) === String(id)) : null;
    if (id && !row) {
      root.innerHTML = layout('<div class="admin-card"><h3>Project not found</h3><p class="admin-hint">It may have been deleted. Choose another project from the list.</p><p class="admin-actions" style="margin-top:14px"><a class="admin-button" href="/admin/projects">Back to projects</a></p></div>', '/admin/projects', 'Projects');
      bindChrome();
      return;
    }
    await loadMedia();
    const categories = normalizeRows(categoryRows);
    const categoryOptions = [{ value: '', label: 'No category' }, ...categories.map((item) => ({ value: String(item.id), label: String(item.name) }))];
    const isNew = !row;
    const groupCards = PROJECT_GROUPS.map((group) => `<section class="admin-card">
      <div class="admin-card__head"><div><h3>${esc(group.legend)}</h3></div></div>
      <div class="admin-split">${group.fields.map((field) => projectFieldMarkup(field, row)).join('')}</div>
    </section>`).join('');
    const galleryCard = isNew
      ? `<div class="admin-card"><div class="admin-card__head"><div><h3>Project media</h3><p>Save the project first, then come back to add gallery images.</p></div></div></div>`
      : `<section class="admin-card">
          <div class="admin-card__head"><div><h3>Gallery and case study screenshots</h3><p>Drag a thumbnail to reorder. Every change is saved automatically.</p></div><button type="button" class="admin-button secondary" data-gallery-add>${icon('plus', 15)} Add images</button></div>
          <div class="admin-media-grid" data-gallery-grid><p class="admin-hint">Loading gallery…</p></div>
        </section>`;
    const content = `<form class="admin-stack" data-project-form novalidate>
      ${groupCards}
      <section class="admin-card">
        <div class="admin-card__head"><div><h3>Category and project card image</h3><p>The image appears on the homepage and Work cards. It is also the case study lead image unless a separate lead image is selected.</p></div></div>
        <div class="admin-split">
          ${fieldSelect({ name: 'category_id', label: 'Category', value: row ? (row.category_id ?? '') : '', options: categoryOptions, hint: categories.length ? 'Groups the project on the work page.' : 'No categories yet — create one in Categories.' })}
          ${pickerField({ name: 'featured_image_id', label: 'Project card image', value: row ? (row.featured_image_id ?? '') : '', hint: 'Shown on the homepage and Work page project cards.' })}
        </div>
      </section>
      <section class="admin-card">
        <div class="admin-card__head"><div><h3>Case study lead image</h3><p>Optional; when selected this appears above the case study content instead of the project card image.</p></div></div>
        ${pickerField({ name: 'case_study_media_id', label: 'Case study lead image', value: row ? (row.case_study_media_id ?? '') : '', hint: 'Remove it to use the project card image as the case study lead image.' })}
      </section>
      ${galleryCard}
      <div class="admin-card admin-card__head" style="margin-bottom:0">
        <p class="admin-hint">${isNew ? 'The project is created as soon as you save.' : 'Changes go live straight away.'}</p>
        <div class="admin-actions">
          <button class="admin-button" type="submit">${isNew ? 'Create project' : 'Save project'}</button>
          <button class="admin-button secondary" type="button" data-cancel>Cancel</button>
          <a class="admin-button secondary" href="/admin/projects">Back to list</a>
        </div>
      </div>
    </form>`;
    const actions = `${row && isTrue(row.published) ? `<a class="admin-button secondary" href="/work/${esc(row.slug)}/" target="_blank" rel="noopener">${icon('eye', 16)} Preview case study</a>` : ''}${row ? `<button type="button" class="admin-button danger" data-project-delete>${icon('trash', 16)} Delete</button>` : ''}`;
    root.innerHTML = layout(content, '/admin/projects', isNew ? 'New project' : `Edit project: ${row.title}`, { subtitle: 'Grouped so it is obvious what each field controls.', actions });
    bindChrome();
    bindPickers(root);
    const form = root.querySelector('[data-project-form]');
    const titleField = getField(form, 'title');
    const slugField = getField(form, 'slug');
    if (titleField && slugField && isNew) {
      titleField.addEventListener('blur', () => { if (!slugField.value.trim()) slugField.value = slugify(titleField.value); });
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!requireFields(form, [['title', 'Project title'], ['slug', 'Link name']])) return;
      const slugControl = getField(form, 'slug');
      if (slugControl && slugControl.value.trim() !== slugify(slugControl.value)) slugControl.value = slugify(slugControl.value);
      const button = form.querySelector('button[type="submit"]');
      await busy(button, async () => {
        try {
          const payload = projectPayload(form);
          if (!isNew) payload.id = row.id;
          const result = await request('/api/admin/projects', { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(payload) });
          if (isNew) {
            const nextId = Number(result.id || 0);
            if (nextId) { window.location.href = `/admin/projects/${nextId}`; return; }
          }
          say('Project saved.');
          await bindGallery(row.id || Number(result.id || 0));
        } catch (error) { say(error.message, true); }
      });
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => { window.location.href = '/admin/projects'; });
    root.querySelector('[data-project-delete]')?.addEventListener('click', async (event) => {
      const target = event.currentTarget;
      const confirmed = await confirmDialog({ title: 'Delete this project?', text: 'The project and its case study page will be removed. This cannot be undone.', confirmLabel: 'Delete project' });
      if (!confirmed) return;
      await busy(target, async () => {
        try {
          await request('/api/admin/projects', { method: 'DELETE', body: JSON.stringify({ id: row.id }) });
          window.location.href = '/admin/projects';
        } catch (error) { say(error.message, true); }
      });
    });
    if (!isNew) await bindGallery(row.id);
  };
  /* -------------------------------------------------------- gallery */
  const galleryItemMarkup = (row, index, total) => `<div class="admin-media-card" draggable="true" data-gallery-item="${index}">
    <img class="admin-media-card__thumb" src="${mediaUrl(row)}" alt="${esc(row.alt_text || '')}" loading="lazy">
    <div class="admin-media-card__body"><span class="admin-media-card__name">${esc(row.filename)}</span><span class="admin-media-meta">${index === 0 ? 'First in the gallery' : `Position ${index + 1}`}</span></div>
    <div class="admin-media-card__actions">
      <button type="button" class="admin-iconbutton" data-gal-move="up"${index === 0 ? ' disabled' : ''} aria-label="Move earlier">${icon('up', 15)}</button>
      <button type="button" class="admin-iconbutton" data-gal-move="down"${index === total - 1 ? ' disabled' : ''} aria-label="Move later">${icon('down', 15)}</button>
      <button type="button" class="admin-button danger admin-button--sm" data-gal-remove>${icon('trash', 15)} Remove</button>
    </div>
  </div>`;

  const bindGallery = async (projectId) => {
    const grid = root.querySelector('[data-gallery-grid]');
    if (!grid) return;
    let items = [];
    let dragIndex = null;
    const save = async () => {
      try {
        await request('/api/admin/project-gallery', { method: 'PUT', body: JSON.stringify({ project_id: projectId, media_ids: items.map((item) => item.id) }) });
        notify('Gallery saved.');
      } catch (error) { say(error.message, true); }
    };
    const paint = () => {
      grid.innerHTML = items.length
        ? items.map((row, index) => galleryItemMarkup(row, index, items.length)).join('')
        : '<p class="admin-hint">No gallery images yet. Use “Add images” to pick from the media library or upload new ones.</p>';
      grid.querySelectorAll('[data-gallery-item]').forEach((card) => {
        const index = Number(card.dataset.galleryItem);
        card.querySelector('[data-gal-move="up"]')?.addEventListener('click', async (event) => {
          if (index === 0) return;
          [items[index - 1], items[index]] = [items[index], items[index - 1]];
          paint();
          await busy(event.currentTarget, save);
        });
        card.querySelector('[data-gal-move="down"]')?.addEventListener('click', async (event) => {
          if (index === items.length - 1) return;
          [items[index + 1], items[index]] = [items[index], items[index + 1]];
          paint();
          await busy(event.currentTarget, save);
        });
        card.querySelector('[data-gal-remove]')?.addEventListener('click', async () => {
          items.splice(index, 1);
          paint();
          await save();
        });
        card.addEventListener('dragstart', () => { dragIndex = index; card.classList.add('is-selected'); });
        card.addEventListener('dragend', () => { dragIndex = null; card.classList.remove('is-selected'); });
        card.addEventListener('dragover', (event) => event.preventDefault());
        card.addEventListener('drop', async (event) => {
          event.preventDefault();
          if (dragIndex === null || dragIndex === index) return;
          const moved = items.splice(dragIndex, 1)[0];
          items.splice(index, 0, moved);
          dragIndex = null;
          paint();
          await save();
        });
      });
    };
    try {
      items = normalizeRows(await request(`/api/admin/project-gallery?project_id=${projectId}`));
    } catch { items = []; }
    paint();
    const addButton = root.querySelector('[data-gallery-add]');
    if (addButton) addButton.onclick = async () => {
      const picked = await openMediaLibrary({ title: 'Add images to the project gallery', multi: true });
      if (!picked.length) return;
      for (const pickedRow of picked) {
        if (!items.some((item) => String(item.id) === String(pickedRow.id))) items.push(pickedRow);
      }
      paint();
      await save();
    };
  };
  /* --------------------------------------------------------- media page */
  const mediaCardMarkup = (row) => `<div class="admin-media-card" data-media-card="${esc(row.id)}">
    <img class="admin-media-card__thumb" src="${mediaUrl(row)}" alt="${esc(row.alt_text || '')}" loading="lazy">
    <div class="admin-media-card__body">
      <span class="admin-media-card__name" title="${esc(row.filename)}">${esc(row.filename)}</span>
      <span class="admin-media-meta">${row.width ? `${esc(row.width)}×${esc(row.height)}` : 'Image'} · ${esc(humanSize(row.byte_size))} · ${esc(String(row.mime_type || '').replace('image/', '').toUpperCase())}</span>
    </div>
    <label class="admin-label">Alt text (for accessibility)<input class="admin-input" data-alt="${esc(row.id)}" value="${esc(row.alt_text || '')}" placeholder="Describe the image"></label>
    <div class="admin-media-card__actions">
      <button type="button" class="admin-button secondary admin-button--sm" data-alt-save="${esc(row.id)}">Save alt text</button>
      <button type="button" class="admin-button secondary admin-button--sm" data-details="${esc(row.id)}">${icon('info', 14)} Details</button>
      <button type="button" class="admin-button secondary admin-button--sm" data-replace="${esc(row.id)}">${icon('refresh', 14)} Replace</button>
      <button type="button" class="admin-button danger admin-button--sm" data-media-delete="${esc(row.id)}">${icon('trash', 14)} Delete</button>
    </div>
  </div>`;

  const openMediaDetails = (row) => {
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = `<div class="admin-modal__panel" role="dialog" aria-modal="true" aria-label="${esc(row.filename)}">
      <div class="admin-modal__head"><h3>${esc(row.filename)}</h3><button type="button" class="admin-iconbutton" data-close aria-label="Close">${icon('close', 16)}</button></div>
      <div class="admin-modal__body">
        <div class="admin-split">
          <img src="${mediaUrl(row)}" alt="${esc(row.alt_text || '')}" style="width:100%;border-radius:var(--x-r);border:1px solid var(--x-line);background:#eef2f9">
          <div class="admin-form">
            <dl class="admin-detail">
              <div><dt>Dimensions</dt><dd>${row.width && row.height ? `${esc(row.width)} × ${esc(row.height)} pixels` : 'Not detected'}</dd></div>
              <div><dt>File size</dt><dd>${esc(humanSize(row.byte_size))}</dd></div>
              <div><dt>Type</dt><dd>${esc(row.mime_type || '')}</dd></div>
              <div><dt>Uploaded</dt><dd>${esc(humanDate(row.created_at))}</dd></div>
            </dl>
            <label class="admin-label">Alt text (for accessibility)<input class="admin-input" data-detail-alt value="${esc(row.alt_text || '')}" placeholder="Describe the image"></label>
            <p class="admin-actions"><button type="button" class="admin-button" data-detail-save>Save alt text</button><button type="button" class="admin-button secondary" data-copy>${icon('external', 15)} Copy image link</button></p>
          </div>
        </div>
      </div>
      <div class="admin-modal__foot"><button type="button" class="admin-button secondary" data-close>Close</button></div>
    </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
    modal.querySelector('[data-detail-save]').addEventListener('click', async (event) => {
      await busy(event.currentTarget, async () => {
        try {
          const alt = modal.querySelector('[data-detail-alt]').value;
          await request('/api/admin/media', { method: 'PATCH', body: JSON.stringify({ id: row.id, alt_text: alt }) });
          row.alt_text = alt;
          const source = root.querySelector(`[data-alt="${row.id}"]`);
          if (source) source.value = alt;
          notify('Alt text saved.');
        } catch (error) { say(error.message, true); }
      });
    });
    modal.querySelector('[data-copy]').addEventListener('click', async (event) => {
      try {
        await navigator.clipboard.writeText(new URL(mediaUrl(row), window.location.origin).toString());
        await busy(event.currentTarget, async () => notify('Image link copied.'));
      } catch { say('Copying is not available in this browser.', true); }
    });
  };
  const mediaPage = async (query = '') => {
    const rows = normalizeRows(await request(`/api/admin/media${query ? `?q=${encodeURIComponent(query)}` : ''}`));
    store.media = rows;
    store.mediaLoaded = true;
    const content = `<div class="admin-card">
      <div class="admin-card__head"><div><h3>Upload images</h3><p>JPEG, PNG, WebP or SVG up to 8 MB each. Files are stored in R2 and listed here.</p></div><button class="admin-button" type="button" data-upload>${icon('upload', 16)} Choose files</button></div>
      <div class="admin-dropzone" data-dropzone>Drag and drop images here, or use “Choose files”.</div>
    </div>
    <div class="admin-card">
      <div class="admin-card__head">
        <div><h3>Media library</h3><p>${rows.length} image(s)${query ? ` matching “${esc(query)}”` : ''}.</p></div>
        <form class="admin-actions" data-search><label class="admin-label">Search by file name<input class="admin-input" type="search" name="q" value="${esc(query)}" placeholder="e.g. hero"></label><button class="admin-button secondary" type="submit">${icon('search', 16)} Search</button></form>
      </div>
      ${rows.length ? `<div class="admin-media-grid">${rows.map(mediaCardMarkup).join('')}</div>` : '<p class="admin-empty">No images found. Upload one, or clear the search.</p>'}
    </div>`;
    root.innerHTML = layout(content, '/admin/media', 'Media library', { subtitle: 'Every image used across the website.', actions: `<button class="admin-button" type="button" data-upload>${icon('upload', 16)} Upload images</button>` });
    bindChrome();
    const refresh = (nextQuery = query) => mediaPage(nextQuery);
    root.querySelectorAll('[data-upload]').forEach((button) => button.addEventListener('click', async () => {
      await busy(button, async () => { await uploadFromDisk({ multiple: true }); await refresh(); });
    }));
    const dropzone = root.querySelector('[data-dropzone]');
    const handleDrop = async (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-over');
      const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'));
      if (!files.length) { say('Please drop image files.', true); return; }
      try { await uploadFiles(files); notify(`${files.length} image(s) uploaded.`); await refresh(); } catch (error) { say(error.message, true); }
    };
    if (dropzone) {
      dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('is-over'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
      dropzone.addEventListener('drop', handleDrop);
      dropzone.addEventListener('click', () => root.querySelector('[data-upload]')?.click());
    }
    root.querySelector('[data-search]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      refresh(controlValue(getField(event.currentTarget, 'q'), '').trim());
    });
    root.querySelectorAll('[data-alt-save]').forEach((button) => button.addEventListener('click', async (event) => {
      const id = button.dataset.altSave;
      await busy(event.currentTarget, async () => {
        try {
          const input = root.querySelector(`[data-alt="${id}"]`);
          const alt = input ? input.value : '';
          await request('/api/admin/media', { method: 'PATCH', body: JSON.stringify({ id, alt_text: alt }) });
          const row = rows.find((item) => String(item.id) === String(id));
          if (row) row.alt_text = alt;
          store.media = rows;
          notify('Alt text saved.');
        } catch (error) { say(error.message, true); }
      });
    }));
    root.querySelectorAll('[data-details]').forEach((button) => button.addEventListener('click', () => {
      const row = rows.find((item) => String(item.id) === String(button.dataset.details));
      if (row) openMediaDetails(row);
    }));
    root.querySelectorAll('[data-replace]').forEach((button) => button.addEventListener('click', async (event) => {
      const id = button.dataset.replace;
      const files = await pickFiles();
      if (!files.length) return;
      await busy(event.currentTarget, async () => {
        try {
          const input = root.querySelector(`[data-alt="${id}"]`);
          const form = new FormData();
          form.set('id', id);
          form.set('alt_text', input ? input.value : '');
          form.append('files', files[0]);
          await request('/api/admin/media', { method: 'PUT', body: form });
          notify('Image replaced.');
          await refresh();
        } catch (error) { say(error.message, true); }
      });
    }));
    root.querySelectorAll('[data-media-delete]').forEach((button) => button.addEventListener('click', async (event) => {
      const id = button.dataset.mediaDelete;
      const confirmed = await confirmDialog({ title: 'Delete this image?', text: 'Anywhere the image is used will show an empty slot until you pick a replacement.', confirmLabel: 'Delete image' });
      if (!confirmed) return;
      await busy(event.currentTarget, async () => {
        try {
          await request('/api/admin/media', { method: 'DELETE', body: JSON.stringify({ id }) });
          notify('Image deleted.');
          await refresh();
        } catch (error) { say(error.message, true); }
      });
    }));
  };
  /* ----------------------------------------------------------- settings */
  const SETTINGS_GROUPS = [
    {
      id: 'branding', legend: 'Branding', blurb: 'Your name and how the site introduces itself.',
      fields: [
        { name: 'site_name', label: 'Site name', hint: 'Appears in the header, footer and page titles.' },
        { name: 'tagline', label: 'Tagline', hint: 'A short line about what you do.' },
      ],
      images: [
        { name: 'favicon_media_id', label: 'Favicon', hint: 'The small icon shown in browser tabs. Leave empty for the built-in icon.' },
      ],
    },
    {
      id: 'contact', legend: 'Contact', blurb: 'Shown in the footer and on the contact page.',
      fields: [
        { name: 'email', label: 'Email address', type: 'email' },
        { name: 'phone', label: 'Phone number' },
        { name: 'whatsapp', label: 'WhatsApp number' },
        { name: 'location', label: 'Location', hint: 'e.g. Dhaka, Bangladesh' },
      ],
    },
    {
      id: 'social', legend: 'Social profiles', blurb: 'Only the links you fill in are shown in the footer.',
      fields: [
        { name: 'facebook', label: 'Facebook URL' },
        { name: 'instagram', label: 'Instagram URL' },
        { name: 'linkedin', label: 'LinkedIn URL' },
        { name: 'behance', label: 'Behance URL' },
        { name: 'dribbble', label: 'Dribbble URL' },
        { name: 'other', label: 'Another profile URL' },
      ],
    },
    {
      id: 'seo', legend: 'Search and sharing', blurb: 'How the site appears in search results and link previews.',
      fields: [
        { name: 'seo_title', label: 'Homepage title', hint: 'Shown in the browser tab and search results.' },
        { name: 'seo_home_description', label: 'Homepage description', type: 'area', rows: 3, hint: 'Around 150–160 characters works best.' },
        { name: 'canonical_base', label: 'Canonical base URL', hint: 'The base address used in the sitemap, e.g. https://xilveno.shop' },
      ],
      images: [
        { name: 'default_og_image', label: 'Social sharing image', mode: 'url', hint: 'Shown when the site is shared on social media. Choose from the library or paste a URL.' },
      ],
    },
    {
      id: 'legal', legend: 'Legal links', blurb: 'Links shown in the footer. Leave empty to hide them.',
      fields: [
        { name: 'privacy_url', label: 'Privacy policy URL' },
        { name: 'terms_url', label: 'Terms of service URL' },
      ],
    },
  ];
  const settingsFieldMarkup = (field, settings) => {
    const value = settings[field.name] ?? '';
    if (field.type === 'area') return fieldArea({ name: field.name, label: field.label, value: String(value), hint: field.hint, rows: field.rows || 3 });
    return fieldText({ name: field.name, label: field.label, value: String(value), hint: field.hint, type: field.type === 'email' ? 'email' : 'text' });
  };
  /** Social profiles live inside the social_links JSON blob, so spread it into the group values. */
  const socialLinkValues = (settings) => {
    try {
      const parsed = JSON.parse(String(settings.social_links || '{}'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  };
  const groupValues = (group, settings) => (group.id === 'social' ? { ...settings, ...socialLinkValues(settings) } : settings);
  const settingsGroupMarkup = (group, settings) => {
    const values = groupValues(group, settings);
    return `<section class="admin-card">
    <div class="admin-card__head"><div><h3>${esc(group.legend)}</h3><p>${esc(group.blurb)}</p></div></div>
    <form class="admin-form" data-settings-form="${group.id}" novalidate>
      <div class="admin-split">${group.fields.map((field) => settingsFieldMarkup(field, values)).join('')}</div>
      ${(group.images || []).length ? `<fieldset class="admin-fieldset"><legend class="admin-fieldset__legend">Images</legend><div class="admin-split">${group.images.map((image) => pickerField({ name: image.name, label: image.label, value: String(settings[image.name] || ''), mode: image.mode || 'id', hint: image.hint })).join('')}</div></fieldset>` : ''}
      <div class="admin-actions"><button class="admin-button" type="submit">Save ${esc(group.legend.toLowerCase())}</button><a class="admin-button ghost" href="/" target="_blank" rel="noopener">${icon('external', 15)} View site</a></div>
    </form>
  </section>`;
  };
  const bindSettingsForms = (settings) => {
    root.querySelectorAll('[data-settings-form]').forEach((form) => {
      const group = SETTINGS_GROUPS.find((item) => item.id === form.dataset.settingsForm);
      if (!group) return;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        let emailBad = false;
        for (const field of group.fields) {
          if (field.type !== 'email') continue;
          const value = controlValue(getField(form, field.name), '').trim();
          const bad = Boolean(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          markInvalid(form, field.name, bad);
          emailBad = emailBad || bad;
        }
        if (emailBad) { say('Please enter a valid email address.', true); return; }
        await busy(button, async () => {
          try {
            const payload = {};
            for (const field of group.fields) payload[field.name] = controlValue(getField(form, field.name), '');
            for (const image of (group.images || [])) payload[image.name] = controlValue(getField(form, image.name), '');
            await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
            Object.assign(settings, payload);
            say(`${group.legend} saved.`);
          } catch (error) { say(error.message, true); }
        });
      });
    });
  };
  const settingsPage = async () => {
    const settings = await request('/api/admin/settings');
    store.settings = settings;
    const tabs = `<nav class="admin-tabs" aria-label="Settings sections">${SETTINGS_GROUPS.map((group) => `<a class="admin-button secondary admin-button--sm" href="#settings-${group.id}">${esc(group.legend)}</a>`).join('')}</nav>`;
    const content = `${tabs}${SETTINGS_GROUPS.map((group) => `<div id="settings-${group.id}">${settingsGroupMarkup(group, settings)}</div>`).join('')}
      <div class="admin-card admin-card__head" style="margin-bottom:0"><p class="admin-hint">Everything here is stored in the site database and appears on the public website immediately.</p><a class="admin-button secondary" href="/admin/seo">${icon('seo', 16)} SEO tools</a></div>`;
    root.innerHTML = layout(content, '/admin/settings', 'Settings', { subtitle: 'Site details, contact information, social links and legal pages.' });
    bindChrome();
    bindPickers(root);
    bindSettingsForms(settings);
  };
  const seoPage = async () => {
    const settings = await request('/api/admin/settings');
    const group = SETTINGS_GROUPS.find((item) => item.id === 'seo');
    const content = `${settingsGroupMarkup(group, settings)}
      <section class="admin-card">
        <div class="admin-card__head"><div><h3>Sitemap and search engine files</h3><p>Generated automatically from your published content.</p></div></div>
        <p class="admin-actions"><a class="admin-button secondary" href="/sitemap.xml" target="_blank" rel="noopener">${icon('external', 16)} Open sitemap.xml</a><a class="admin-button secondary" href="/robots.txt" target="_blank" rel="noopener">${icon('external', 16)} Open robots.txt</a></p>
        <p class="admin-hint" style="margin-top:12px">The sitemap uses the canonical base URL above and lists every published page and project.</p>
      </section>`;
    root.innerHTML = layout(content, '/admin/seo', 'SEO', { subtitle: 'Titles, descriptions and the image shown when the site is shared.' });
    bindChrome();
    bindPickers(root);
    bindSettingsForms(settings);
  };
  /* ---------------------------------------------------------- inquiries */
  const INQUIRY_STATUSES = {
    unread: ['Unread', 'danger'],
    read: ['Read', 'ok'],
    archived: ['Archived', 'muted'],
  };
  const inquiryStatusChip = (status) => {
    const [label, tone] = INQUIRY_STATUSES[status] || INQUIRY_STATUSES.unread;
    return statusChip(label, tone);
  };
  const setInquiryStatus = async (id, status, reload) => {
    try {
      await request('/api/admin/inquiries', { method: 'PATCH', body: JSON.stringify({ id, status }) });
      notify(`Inquiry marked as ${status}.`);
      await reload();
    } catch (error) { say(error.message, true); }
  };
  const openInquiryDetail = (row, reload) => {
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = `<div class="admin-modal__panel" role="dialog" aria-modal="true" aria-label="Inquiry from ${esc(row.name)}">
      <div class="admin-modal__head"><div><h3>${esc(row.name)}</h3><p class="admin-hint">Received ${esc(humanDate(row.created_at))}</p></div><button type="button" class="admin-iconbutton" data-close aria-label="Close">${icon('close', 16)}</button></div>
      <div class="admin-modal__body">
        <dl class="admin-detail">
          <div><dt>Email</dt><dd><a href="mailto:${esc(row.email)}">${esc(row.email)}</a></dd></div>
          <div><dt>Project type</dt><dd>${esc(row.project_type || 'Not specified')}</dd></div>
          <div><dt>Budget</dt><dd>${esc(row.budget || 'Not specified')}</dd></div>
          <div><dt>Timeline</dt><dd>${esc(row.timeline || 'Not specified')}</dd></div>
          <div><dt>Status</dt><dd>${inquiryStatusChip(row.status)}</dd></div>
          <div><dt>Message</dt><dd><p class="admin-message-box">${esc(row.message || '')}</p></dd></div>
        </dl>
      </div>
      <div class="admin-modal__foot">
        <button type="button" class="admin-button secondary" data-close>Close</button>
        <a class="admin-button secondary" href="mailto:${esc(row.email)}?subject=${encodeURIComponent('Re: your project inquiry')}">${icon('mail', 15)} Reply by email</a>
        <button type="button" class="admin-button" data-status="read">Mark as read</button>
        <button type="button" class="admin-button secondary" data-status="archived">Archive</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
    modal.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', async (event) => {
      await busy(event.currentTarget, async () => { await setInquiryStatus(row.id, button.dataset.status, reload); close(); });
    }));
  };
  const inquiriesPage = async (filter = 'all') => {
    const rows = normalizeRows(await request('/api/admin/inquiries'));
    const visible = filter === 'all' ? rows : rows.filter((row) => row.status === filter);
    const counts = {
      all: rows.length,
      unread: rows.filter((row) => row.status === 'unread').length,
      read: rows.filter((row) => row.status === 'read').length,
      archived: rows.filter((row) => row.status === 'archived').length,
    };
    const tabs = `<nav class="admin-tabs" aria-label="Filter inquiries">${['all', 'unread', 'read', 'archived'].map((key) => `<button type="button" data-filter="${key}" aria-pressed="${filter === key ? 'true' : 'false'}">${key === 'all' ? 'All' : INQUIRY_STATUSES[key][0]} (${counts[key]})</button>`).join('')}</nav>`;
    const table = visible.length ? `<div class="admin-table__wrap"><table class="admin-table">
      <thead><tr><th>From</th><th>Project</th><th>Received</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${visible.map((row) => `<tr>
        <td><strong>${esc(row.name)}</strong><br><a href="mailto:${esc(row.email)}">${esc(row.email)}</a></td>
        <td>${esc(row.project_type || '—')}<br><span class="admin-hint">${esc(row.budget || '')}${row.timeline ? ` · ${esc(row.timeline)}` : ''}</span></td>
        <td style="white-space:nowrap">${esc(humanDate(row.created_at))}</td>
        <td>${inquiryStatusChip(row.status)}</td>
        <td><div class="admin-actions">
          <button type="button" class="admin-button secondary admin-button--sm" data-view="${esc(row.id)}">${icon('eye', 14)} View</button>
          <button type="button" class="admin-button secondary admin-button--sm" data-quick="${esc(row.id)}" data-status="${row.status === 'read' ? 'unread' : 'read'}">${row.status === 'read' ? 'Mark unread' : 'Mark read'}</button>
          <button type="button" class="admin-button secondary admin-button--sm" data-quick="${esc(row.id)}" data-status="archived">Archive</button>
          <button type="button" class="admin-button danger admin-button--sm" data-inquiry-delete="${esc(row.id)}">${icon('trash', 14)} Delete</button>
        </div></td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="admin-empty">No inquiries in this view yet.</p>';
    const content = `<div class="admin-card">
      <div class="admin-card__head"><div><h3>Inquiries</h3><p>Messages sent from the contact form. Sender details are never shown on the public website.</p></div></div>
      ${tabs}${table}
    </div>`;
    const reload = () => inquiriesPage(filter);
    root.innerHTML = layout(content, '/admin/forms', 'Inquiries', { subtitle: `${counts.unread} unread of ${counts.all} total.` });
    bindChrome();
    root.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => inquiriesPage(button.dataset.filter)));
    root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
      const row = rows.find((item) => String(item.id) === String(button.dataset.view));
      if (row) openInquiryDetail(row, reload);
    }));
    root.querySelectorAll('[data-quick]').forEach((button) => button.addEventListener('click', (event) => busy(event.currentTarget, () => setInquiryStatus(button.dataset.quick, button.dataset.status, reload))));
    root.querySelectorAll('[data-inquiry-delete]').forEach((button) => button.addEventListener('click', async (event) => {
      const confirmed = await confirmDialog({ title: 'Delete this inquiry?', text: 'The message will be permanently removed. This cannot be undone.', confirmLabel: 'Delete inquiry' });
      if (!confirmed) return;
      await busy(event.currentTarget, async () => {
        try {
          await request('/api/admin/inquiries', { method: 'DELETE', body: JSON.stringify({ id: button.dataset.inquiryDelete }) });
          notify('Inquiry deleted.');
          await reload();
        } catch (error) { say(error.message, true); }
      });
    }));
  };
/* -------------------------------------------------------------- demos */
  const DEMO_FIELDS = [
    { name: 'name', label: 'Demo name', type: 'text', required: true },
    { name: 'slug', label: 'Short name (slug)', type: 'text', required: true, hint: 'Lowercase letters, numbers and hyphens.' },
    { name: 'subdomain', label: 'Subdomain', type: 'text', required: true, hint: 'For example dental.xilveno.shop' },
    { name: 'description', label: 'Description', type: 'area', rows: 3 },
    { name: 'live_url', label: 'Site URL', type: 'text', hint: 'Any valid external http:// or https:// URL.' },
    { name: 'worker_identifier', label: 'Worker/site identifier', type: 'text', hint: 'Optional internal label for the deployed site.' },
    { name: 'screenshot_media_id', label: 'Preview image', type: 'image', hint: 'Choose a portfolio image or upload a new preview.' },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft — not live' }, { value: 'active', label: 'Live — deployment and URL verified' }, { value: 'archived', label: 'Archived' }], hint: 'Mark Live only after deployment and the public URL have been verified.' },
    { name: 'sort_order', label: 'Order', type: 'number' },
  ];
  const demoFieldMarkup = (field, row) => {
    const value = row ? row[field.name] : (field.name === 'status' ? 'draft' : field.name === 'sort_order' ? 0 : '');
    if (field.type === 'select') return fieldSelect({ name: field.name, label: field.label, value: value, options: field.options, hint: field.hint });
    if (field.type === 'number') return fieldNumber({ name: field.name, label: field.label, value: value ?? 0, hint: field.hint });
    if (field.type === 'area') return fieldArea({ name: field.name, label: field.label, value: String(value ?? ''), hint: field.hint, rows: field.rows || 3 });
    if (field.type === 'image') return pickerField({ name: field.name, label: field.label, value: value || '', hint: field.hint });
    return fieldText({ name: field.name, label: field.label, value: String(value ?? ''), hint: field.hint });
  };
  const demoPayload = (form) => {
    const payload = {};
    for (const field of DEMO_FIELDS) payload[field.name] = controlValue(getField(form, field.name), '');
    payload.category_id = controlValue(getField(form, 'category_id'), '');
    return payload;
  };
  const demoCardMarkup = (row, categoryOptions) => `<section class="admin-card admin-card--tight" data-demo="${esc(row.id)}">
    <div class="admin-card__head" style="margin-bottom:12px">
      <div class="admin-cell">
        <div>
          <h3 style="font-size:16px">${esc(row.name)}</h3>
          <p class="admin-hint">${esc(row.subdomain || '')}</p>
          ${row.worker_identifier ? `<p class="admin-hint">${esc(row.worker_identifier)}</p>` : ''}
        </div>
      </div>
      <div class="admin-actions">
        ${row.status === 'active' ? statusChip('Live', 'ok') : row.status === 'archived' ? statusChip('Archived', 'muted') : statusChip('Not verified live', 'warn')}
        ${row.live_url ? `<a class="admin-button secondary admin-button--sm" href="${esc(row.live_url)}" target="_blank" rel="noopener">${icon('external', 14)} Open demo</a>` : ''}
        <button type="button" class="admin-button secondary admin-button--sm" data-demo-edit aria-expanded="false">${icon('edit', 14)} Edit</button>
        ${row.status === 'active' ? '' : `<button type="button" class="admin-button secondary admin-button--sm" data-demo-active>${icon('check', 14)} Mark live (verified)</button>`}
        <button type="button" class="admin-button danger admin-button--sm" data-demo-delete>${icon('trash', 14)} Delete</button>
      </div>
    </div>
    ${row.screenshot_media_id && mediaSrcById(row.screenshot_media_id) ? `<img src="${esc(mediaSrcById(row.screenshot_media_id))}" alt="" style="display:block;width:min(100%,420px);max-height:220px;object-fit:cover;border-radius:12px;margin:0 0 12px">` : ''}
    ${row.description ? `<p class="admin-hint" style="margin:0 0 12px">${esc(row.description)}</p>` : ''}
    ${row.status === 'active' ? '' : '<p class="admin-inline-note admin-inline-note--warn" style="margin:0 0 12px">Subdomains are not created automatically. Deploy the Worker, attach its domain, and verify the public URL before marking this demo live.</p>'}
    <form class="admin-form" data-demo-form data-id="${esc(row.id)}" hidden>
      <div class="admin-split">${DEMO_FIELDS.map((field) => demoFieldMarkup(field, row)).join('')}</div>
      ${fieldSelect({ name: 'category_id', label: 'Category', value: row.category_id ?? '', options: categoryOptions })}
      <div class="admin-actions"><button class="admin-button" type="submit">Save demo</button><button class="admin-button secondary" type="button" data-demo-cancel>Cancel</button></div>
    </form>
  </section>`;
  const demosPage = async () => {
    const [demoRows, categoryRows] = await Promise.all([request('/api/admin/demos'), request('/api/admin/categories')]);
    const rows = normalizeRows(demoRows);
    const categories = normalizeRows(categoryRows);
    await loadMedia();
    const categoryOptions = [{ value: '', label: 'No category' }, ...categories.map((item) => ({ value: String(item.id), label: String(item.name) }))];
    const content = `<section class="admin-card">
      <div class="admin-card__head"><div><h3>Add a demo site</h3><p>Demo sites are listed for reference. Creating the subdomain itself happens in the Cloudflare dashboard.</p></div></div>
      <form class="admin-form" data-demo-form data-id="" novalidate>
        <div class="admin-split">${DEMO_FIELDS.map((field) => demoFieldMarkup(field, null)).join('')}</div>
        ${fieldSelect({ name: 'category_id', label: 'Category', value: '', options: categoryOptions })}
        <div class="admin-actions"><button class="admin-button" type="submit">${icon('plus', 16)} Add demo</button></div>
      </form>
    </section>
    ${rows.length ? `<div class="admin-stack">${rows.map((row) => demoCardMarkup(row, categoryOptions)).join('')}</div>` : '<p class="admin-empty">No demo sites yet. Add the first one above.</p>'}`;
    const reload = () => demosPage();
    root.innerHTML = layout(content, '/admin/demos', 'Demo sites', { subtitle: 'Live examples you can share with clients.' });
    bindChrome();
    bindPickers(root);
    root.querySelectorAll('[data-demo-form]').forEach((form) => {
      const id = form.dataset.id;
      const isNew = !id;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!requireFields(form, [['name', 'Demo name'], ['slug', 'Short name'], ['subdomain', 'Subdomain']])) return;
        const button = form.querySelector('button[type="submit"]');
        await busy(button, async () => {
          try {
            const payload = demoPayload(form);
            if (!isNew) payload.id = id;
            await request('/api/admin/demos', { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(payload) });
            say(isNew ? 'Demo added.' : 'Demo saved.');
            await reload();
          } catch (error) { say(error.message, true); }
        });
      });
      form.querySelector('[data-demo-cancel]')?.addEventListener('click', () => {
        form.hidden = true;
        form.closest('[data-demo]')?.querySelector('[data-demo-edit]')?.setAttribute('aria-expanded', 'false');
      });
    });
    root.querySelectorAll('[data-demo]').forEach((card) => {
      const form = card.querySelector('[data-demo-form]');
      const edit = card.querySelector('[data-demo-edit]');
      edit?.addEventListener('click', () => {
        form.hidden = !form.hidden;
        edit.setAttribute('aria-expanded', form.hidden ? 'false' : 'true');
        if (!form.hidden) form.scrollIntoView({ block: 'nearest' });
      });
      card.querySelector('[data-demo-active]')?.addEventListener('click', async (event) => {
        const confirmed = await confirmDialog({ title: 'Mark this demo live?', text: 'Confirm that its Worker deployment succeeded and its public URL is resolving correctly over HTTPS. This panel does not deploy or attach domains.', confirmLabel: 'Yes, deployment and URL verified', danger: false });
        if (!confirmed) return;
        await busy(event.currentTarget, async () => {
          try {
            await request('/api/admin/demos', { method: 'PUT', body: JSON.stringify({ id: card.dataset.demo, status: 'active' }) });
            notify('Demo marked live.');
            await reload();
          } catch (error) { say(error.message, true); }
        });
      });
      card.querySelector('[data-demo-delete]')?.addEventListener('click', async (event) => {
        const confirmed = await confirmDialog({ title: 'Delete this demo?', text: 'The listing is removed from this panel. Any Cloudflare setup you created stays as it is.', confirmLabel: 'Delete demo' });
        if (!confirmed) return;
        await busy(event.currentTarget, async () => {
          try {
            await request('/api/admin/demos', { method: 'DELETE', body: JSON.stringify({ id: card.dataset.demo }) });
            notify('Demo deleted.');
            await reload();
          } catch (error) { say(error.message, true); }
        });
      });
    });
  };
  /* ----------------------------------------------------- BrightSmile site */
  const dentalState = { active: 'home', editor: null, slots: [], media: [] };
  const DENTAL_API = '/api/admin/sites/brightsmile';
  const dentalPreviewUrl = (section) => {
    const paths = {
      home: '/', about: '/about/', services: '/services/', team: '/team/',
      'patient-info': '/patient-info/', contact: '/contact/', appointment: '/book/', footer: '/contact/',
    };
    const path = section === 'images' ? '/' : (paths[section] || '/');
    return `https://dental.xilveno.shop${path}?admin-preview=${Date.now()}`;
  };
  const loadDentalData = async () => {
    const [editor, slots, media] = await Promise.all([
      request(`${DENTAL_API}/content`),
      request(`${DENTAL_API}/slots`),
      request(`${DENTAL_API}/media`),
    ]);
    dentalState.editor = editor;
    dentalState.slots = normalizeRows(slots);
    dentalState.media = normalizeRows(media);
  };
  const dentalFieldMarkup = (field) => {
    const value = dentalState.editor.values[field.key] || '';
    if (field.type === 'text') return fieldText({
      name: field.key, label: field.label, value, hint: field.hint,
      placeholder: 'Leave blank to keep the approved content',
    });
    return fieldArea({
      name: field.key, label: field.label, value, hint: field.hint,
      rows: field.type === 'hours' ? 6 : 5,
    });
  };
  const dentalSlotMarkup = (slot) => `<article class="admin-card admin-card--tight" data-dental-slot="${esc(slot.slot)}">
    <div class="admin-card__head"><div><h3>${esc(slot.label)}</h3><p>${esc(slot.section)} · ${esc(slot.dimensions)}</p></div></div>
    ${slot.preview
      ? `<img src="${esc(slot.preview)}" alt="${esc(slot.alt_text)}" style="display:block;width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin:12px 0">`
      : '<div class="admin-empty" style="margin:12px 0">Approved artwork fallback is currently shown on the website.</div>'}
    <label class="admin-label">Alt text<input class="admin-input" data-slot-alt value="${esc(slot.alt_text || '')}" placeholder="Describe the image briefly"></label>
    <div class="admin-actions" style="margin-top:12px">
      <button type="button" class="admin-button secondary admin-button--sm" data-slot-choose>Choose from media</button>
      <button type="button" class="admin-button secondary admin-button--sm" data-slot-upload>Upload new image</button>
      <input type="file" accept="image/jpeg,image/png,image/webp" data-slot-file hidden>
      ${slot.is_custom ? '<button type="button" class="admin-button ghost admin-button--sm" data-slot-alt-save>Save alt text</button><button type="button" class="admin-button danger admin-button--sm" data-slot-remove>Remove</button>' : ''}
    </div>
  </article>`;
  const dentalMediaMarkup = (row) => `<article class="admin-card admin-card--tight" data-dental-media="${esc(row.id)}">
    <img src="${esc(row.preview)}" alt="${esc(row.alt_text || '')}" style="display:block;width:100%;height:180px;object-fit:cover;border-radius:12px">
    <p style="margin:10px 0 4px"><strong>${esc(row.filename)}</strong></p>
    <p class="admin-hint">${esc(humanSize(row.byte_size))}${row.used_in.length ? ` · Used in ${esc(row.used_in.length)} location(s)` : ' · Not assigned'}</p>
    <label class="admin-label">Alt text<input class="admin-input" data-media-alt value="${esc(row.alt_text || '')}" placeholder="Describe the image briefly"></label>
    <div class="admin-actions" style="margin-top:10px">
      <button type="button" class="admin-button secondary admin-button--sm" data-media-alt-save>Save alt text</button>
      <button type="button" class="admin-button secondary admin-button--sm" data-media-replace>Replace image</button>
      <input type="file" accept="image/jpeg,image/png,image/webp" data-media-file hidden>
      <button type="button" class="admin-button danger admin-button--sm" data-media-delete>Delete</button>
    </div>
  </article>`;
  const dentalEditorPage = async () => {
    await loadDentalData();
    const requestedSection = new URLSearchParams(window.location.search).get('section');
    if (requestedSection && [...dentalState.editor.sections.map((item) => item.id), 'images'].includes(requestedSection)) dentalState.active = requestedSection;
    renderDentalEditor();
  };
  const renderDentalEditor = () => {
    const section = dentalState.active === 'images'
      ? { id: 'images', label: 'Images', fields: [], imageSlots: dentalState.slots.map((slot) => slot.slot) }
      : dentalState.editor.sections.find((item) => item.id === dentalState.active) || dentalState.editor.sections[0];
    const slots = dentalState.slots.filter((slot) => section.id === 'images' || section.imageSlots.includes(slot.slot));
    const isMediaLibrary = section.id === 'images';
    const content = `<div class="admin-card">
      <div class="admin-card__head"><div><h3>BrightSmile Dental</h3><p>Changes here are stored with BrightSmile and appear on its public website. The preview is the live site, not a duplicate mock-up.</p></div>
        <a class="admin-button secondary" href="https://dental.xilveno.shop/" target="_blank" rel="noopener">${icon('external', 15)} Open live site</a>
      </div>
      <nav class="admin-tabs" aria-label="BrightSmile sections">${[...dentalState.editor.sections.map((item) => item.id), 'images'].map((id) => {
        const label = id === 'images' ? 'Images' : dentalState.editor.sections.find((item) => item.id === id)?.label;
        return `<button type="button" data-dental-section="${esc(id)}" aria-pressed="${id === section.id ? 'true' : 'false'}">${esc(label)}</button>`;
      }).join('')}</nav>
    </div>
    <div class="admin-grid" style="grid-template-columns:minmax(0,1fr);gap:18px">
      <div class="admin-card admin-card--tight">
        <h3 style="margin-top:0">Live BrightSmile preview</h3>
        <iframe title="Live BrightSmile ${esc(section.label)} preview" src="${esc(dentalPreviewUrl(section.id))}" loading="lazy" style="display:block;width:100%;height:min(65vh,680px);min-height:420px;border:1px solid var(--admin-border,#d9dee8);border-radius:12px;background:white"></iframe>
      </div>
      ${isMediaLibrary
        ? `<section class="admin-card"><div class="admin-card__head"><div><h3>Approved image locations</h3><p>Only the 17 locations from the BrightSmile image manifest are listed. Removing an image restores the site's approved artwork fallback.</p></div></div><div class="admin-grid">${slots.map(dentalSlotMarkup).join('')}</div></section>`
        : `<section class="admin-card"><div class="admin-card__head"><div><h3>${esc(section.label)} content</h3><p>Only content fields used by this BrightSmile section are shown. Blank fields keep the approved published copy.</p></div></div>
          ${section.fields.length
            ? `<form class="admin-stack" data-dental-content-form>${section.fields.map(dentalFieldMarkup).join('')}<div class="admin-actions"><button class="admin-button" type="submit">Save changes</button><button class="admin-button secondary" type="button" data-dental-cancel>Cancel</button></div></form>`
            : '<p class="admin-empty">This section currently has no editable text fields.</p>'}
          ${slots.length ? `<hr><div class="admin-card__head"><div><h3>Images used in ${esc(section.label)}</h3><p>Image locations are defined by the approved BrightSmile manifest.</p></div></div><div class="admin-grid">${slots.map(dentalSlotMarkup).join('')}</div>` : ''}
        </section>`}
      ${isMediaLibrary ? `<section class="admin-card">
        <div class="admin-card__head"><div><h3>BrightSmile media library</h3><p>Images uploaded here are stored only in BrightSmile's dedicated media bucket.</p></div>
          <button type="button" class="admin-button" data-library-upload>${icon('upload', 15)} Upload new image</button>
          <input type="file" accept="image/jpeg,image/png,image/webp" data-library-file hidden>
        </div>
        <label class="admin-label" style="max-width:520px">Alt text for the new image<input class="admin-input" type="text" data-library-new-alt maxlength="500" placeholder="Describe the image briefly"></label>
        <label class="admin-label" style="max-width:420px">Search images<input class="admin-input" type="search" data-library-search placeholder="Search by file name"></label>
        <div class="admin-grid" data-library-grid>${dentalState.media.map(dentalMediaMarkup).join('') || '<p class="admin-empty">No BrightSmile images uploaded yet. The approved fallback artwork remains in use.</p>'}</div>
      </section>` : ''}
    </div>`;
    root.innerHTML = layout(content, '/admin/sites/brightsmile', 'BrightSmile site editor', { subtitle: `${esc(section.label)} · Site-specific content and media` });
    bindChrome();
    root.querySelectorAll('[data-dental-section]').forEach((button) => button.addEventListener('click', () => {
      dentalState.active = button.dataset.dentalSection;
      const url = new URL(window.location.href);
      url.searchParams.set('section', dentalState.active);
      window.history.replaceState({}, '', url);
      renderDentalEditor();
    }));
    root.querySelector('[data-dental-content-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(section.fields.map((field) => [field.key, controlValue(getField(form, field.key), '')]));
      const button = form.querySelector('button[type="submit"]');
      await busy(button, async () => {
        try {
          await request(`${DENTAL_API}/content`, { method: 'PUT', body: JSON.stringify({ values }) });
          await loadDentalData();
          say('Saved. The BrightSmile public site now uses these changes.');
          renderDentalEditor();
        } catch (error) { say(error.message, true); }
      });
    });
    root.querySelector('[data-dental-cancel]')?.addEventListener('click', async () => {
      try { await loadDentalData(); renderDentalEditor(); say('Unsaved changes discarded.'); }
      catch (error) { say(error.message, true); }
    });
    slots.forEach((slot) => bindDentalSlot(slot));
    if (isMediaLibrary) bindDentalLibrary();
  };
  const uploadDentalMedia = async (file, altText, replaceId = '') => {
    const form = new FormData();
    form.append('file', file);
    form.append('alt_text', altText);
    if (replaceId) form.append('id', replaceId);
    await request(`${DENTAL_API}/media`, { method: replaceId ? 'PUT' : 'POST', body: form });
    await loadDentalData();
  };
  const assignDentalMedia = async (slot, mediaId, altText) => {
    await request(`${DENTAL_API}/slots/${encodeURIComponent(slot)}`, {
      method: 'PUT', body: JSON.stringify({ media_id: mediaId, alt_text: altText }),
    });
    await loadDentalData();
    renderDentalEditor();
    say('Image saved to this BrightSmile location.');
  };
  const bindDentalSlot = (slot) => {
    const card = root.querySelector(`[data-dental-slot="${CSS.escape(slot.slot)}"]`);
    if (!card) return;
    const altInput = card.querySelector('[data-slot-alt]');
    const remove = card.querySelector('[data-slot-remove]');
    card.querySelector('[data-slot-choose]')?.addEventListener('click', () => openDentalMediaPicker(slot, altInput.value));
    card.querySelector('[data-slot-upload]')?.addEventListener('click', () => card.querySelector('[data-slot-file]').click());
    card.querySelector('[data-slot-file]')?.addEventListener('change', async (event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      try {
        await uploadDentalMedia(file, altInput.value);
        const uploaded = dentalState.media[0];
        await assignDentalMedia(slot.slot, uploaded.id, altInput.value);
      } catch (error) { say(error.message, true); }
    });
    card.querySelector('[data-slot-alt-save]')?.addEventListener('click', async (event) => {
      await busy(event.currentTarget, async () => {
        try {
          await request(`${DENTAL_API}/slots/${encodeURIComponent(slot.slot)}`, { method: 'PUT', body: JSON.stringify({ alt_text: altInput.value }) });
          await loadDentalData(); renderDentalEditor(); say('Alt text saved.');
        } catch (error) { say(error.message, true); }
      });
    });
    remove?.addEventListener('click', async (event) => {
      const confirmed = await confirmDialog({ title: `Remove ${slot.label} image?`, text: 'The assigned image will be removed and the approved BrightSmile fallback restored.', confirmLabel: 'Remove image' });
      if (!confirmed) return;
      await busy(event.currentTarget, async () => {
        try {
          await request(`${DENTAL_API}/slots/${encodeURIComponent(slot.slot)}`, { method: 'DELETE', body: '{}' });
          await loadDentalData(); renderDentalEditor(); say('The approved fallback is restored.');
        } catch (error) { say(error.message, true); }
      });
    });
  };
  const openDentalMediaPicker = (slot, altText) => {
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = `<div class="admin-modal__panel" role="dialog" aria-modal="true" aria-label="Choose BrightSmile image">
      <div class="admin-modal__head"><h3>Choose an image for ${esc(slot.label)}</h3></div>
      <div class="admin-modal__body"><label class="admin-label">Search BrightSmile images<input class="admin-input" type="search" data-search></label><div data-grid></div>
        <label class="admin-label">Upload new image<input type="file" accept="image/jpeg,image/png,image/webp" data-upload></label>
      </div>
      <div class="admin-modal__foot"><button type="button" class="admin-button secondary" data-close>Cancel</button></div>
    </div>`;
    document.body.appendChild(modal);
    const grid = modal.querySelector('[data-grid]');
    const render = () => {
      const query = modal.querySelector('[data-search]').value.trim().toLowerCase();
      const rows = dentalState.media.filter((item) => String(item.filename).toLowerCase().includes(query));
      grid.innerHTML = rows.length ? `<div class="admin-media-grid">${rows.map((row) => `<button type="button" class="admin-media-card" data-choose-media="${esc(row.id)}">
        <img class="admin-media-card__thumb" src="${esc(row.preview)}" alt="${esc(row.alt_text || '')}" loading="lazy">
        <span class="admin-media-card__body"><span class="admin-media-card__name">${esc(row.filename)}</span><span class="admin-media-meta">${esc(humanSize(row.byte_size))}</span></span>
      </button>`).join('')}</div>` : '<p class="admin-empty">No matching BrightSmile image. Upload a new image here.</p>';
      grid.querySelectorAll('[data-choose-media]').forEach((button) => button.addEventListener('click', async () => {
        const media = dentalState.media.find((item) => String(item.id) === button.dataset.chooseMedia);
        if (!media) return;
        modal.remove();
        try { await assignDentalMedia(slot.slot, media.id, altText || media.alt_text || ''); }
        catch (error) { say(error.message, true); }
      }));
    };
    modal.querySelector('[data-search]').addEventListener('input', render);
    modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });
    modal.querySelector('[data-upload]').addEventListener('change', async (event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      try {
        await uploadDentalMedia(file, altText);
        modal.remove();
        await assignDentalMedia(slot.slot, dentalState.media[0].id, altText);
      } catch (error) { say(error.message, true); }
    });
    render();
    modal.querySelector('[data-search]').focus();
  };
  const bindDentalLibrary = () => {
    const search = root.querySelector('[data-library-search]');
    search?.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      root.querySelectorAll('[data-dental-media]').forEach((card) => { card.hidden = !card.textContent.toLowerCase().includes(query); });
    });
    root.querySelector('[data-library-upload]')?.addEventListener('click', () => root.querySelector('[data-library-file]').click());
    root.querySelector('[data-library-file]')?.addEventListener('change', async (event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      const altText = root.querySelector('[data-library-new-alt]').value;
      try { await uploadDentalMedia(file, altText); renderDentalEditor(); say('Image uploaded to BrightSmile media.'); }
      catch (error) { say(error.message, true); }
    });
    root.querySelectorAll('[data-dental-media]').forEach((card) => {
      const id = card.dataset.dentalMedia;
      const alt = card.querySelector('[data-media-alt]');
      card.querySelector('[data-media-alt-save]')?.addEventListener('click', async (event) => {
        await busy(event.currentTarget, async () => {
          try {
            await request(`${DENTAL_API}/media/${id}`, { method: 'PATCH', body: JSON.stringify({ alt_text: alt.value }) });
            await loadDentalData(); renderDentalEditor(); say('Alt text saved.');
          } catch (error) { say(error.message, true); }
        });
      });
      card.querySelector('[data-media-replace]')?.addEventListener('click', () => card.querySelector('[data-media-file]').click());
      card.querySelector('[data-media-file]')?.addEventListener('change', async (event) => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        try { await uploadDentalMedia(file, alt.value, id); renderDentalEditor(); say('Image replaced in BrightSmile media.'); }
        catch (error) { say(error.message, true); }
      });
      card.querySelector('[data-media-delete]')?.addEventListener('click', async (event) => {
        const confirmed = await confirmDialog({ title: 'Delete this BrightSmile image?', text: 'This image will be removed from every BrightSmile location that uses it. Those locations will return to their approved fallback.', confirmLabel: 'Delete image' });
        if (!confirmed) return;
        await busy(event.currentTarget, async () => {
          try {
            await request(`${DENTAL_API}/media/${id}`, { method: 'DELETE', body: '{}' });
            await loadDentalData(); renderDentalEditor(); say('Image deleted from BrightSmile media.');
          } catch (error) { say(error.message, true); }
        });
      });
    });
  };
  /* --------------------------------------------------------------- boot */
  const ROUTES = [
    [/^\/admin\/dashboard\/?$/, () => dashboardPage()],
    [/^\/admin\/home\/?$/, () => homeEditorPage()],
    [/^\/admin\/about\/?$/, () => aboutPage()],
    [/^\/admin\/services\/?$/, () => collectionPage('services')],
    [/^\/admin\/process\/?$/, () => collectionPage('process')],
    [/^\/admin\/skills\/?$/, () => collectionPage('skills')],
    [/^\/admin\/problems\/?$/, () => collectionPage('problems')],
    [/^\/admin\/faq\/?$/, () => collectionPage('faqs')],
    [/^\/admin\/categories\/?$/, () => collectionPage('categories')],
    [/^\/admin\/media\/?$/, () => mediaPage()],
    [/^\/admin\/projects\/new\/?$/, () => projectEditorPage(null)],
    [/^\/admin\/projects\/(\d+)\/?$/, (match) => projectEditorPage(Number(match[1]))],
    [/^\/admin\/projects\/?$/, () => projectsPage()],
    [/^\/admin\/settings\/?$/, () => settingsPage()],
    [/^\/admin\/seo\/?$/, () => seoPage()],
    [/^\/admin\/forms\/?$/, () => inquiriesPage()],
    [/^\/admin\/demos\/?$/, () => demosPage()],
    [/^\/admin\/sites\/brightsmile\/?$/, () => dentalEditorPage()],
  ];

  const fatal = (error) => {
    root.innerHTML = layout(`<div class="admin-card"><h3>Something went wrong</h3><p class="admin-hint">${esc(error && error.message ? error.message : 'Unexpected error.')}</p><p class="admin-actions" style="margin-top:14px"><a class="admin-button" href="/admin/dashboard">Back to dashboard</a></p></div>`, '/admin/dashboard', 'Admin panel');
    bindChrome();
  };

  const load = async () => {
    if (root.dataset.login === 'true') { renderLogin(); return; }
    let session;
    try {
      session = await request('/api/admin/session');
    } catch {
      window.location.href = '/admin/login';
      return;
    }
    store.csrf = session.csrfToken || '';
    const page = (root.dataset.page || '/admin/dashboard').replace(/\/+$/, '') || '/admin/dashboard';
    try {
      for (const [pattern, handler] of ROUTES) {
        const match = page.match(pattern);
        if (match) { await handler(match); return; }
      }
      await dashboardPage();
    } catch (error) {
      if (error && error.status === 401) { window.location.href = '/admin/login'; return; }
      fatal(error);
    }
  };

  load();
})();