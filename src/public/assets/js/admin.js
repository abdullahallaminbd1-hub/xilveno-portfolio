(() => {
  const root = document.querySelector('#admin-app');
  if (!root) return;
  let csrfToken = '';
  let mediaCache = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

  const request = async (path, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (csrfToken && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  };

  const message = (text, error = false) => `<div class="admin-message ${error ? 'admin-error' : 'admin-success'}" role="status">${esc(text)}</div>`;
  const say = (text, error = false) => {
    const target = document.querySelector('#admin-message');
    if (target) target.innerHTML = message(text, error);
  };

  const listOf = (value) => String(value ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const linesOf = (value) => {
    if (Array.isArray(value)) return value.map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : String(item))).join('\n');
    const text = String(value ?? '');
    if (text.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : String(item))).join('\n');
      } catch { /* keep raw text */ }
    }
    return text;
  };
  const normalizeRows = (data) => (Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []));

  const fieldText = (name, label, value = '', attrs = '') => `<label class="admin-label">${esc(label)}<input class="admin-input" name="${esc(name)}" value="${esc(value)}" ${attrs}></label>`;
  const fieldArea = (name, label, value = '', attrs = '') => `<label class="admin-label">${esc(label)}<textarea class="admin-textarea" name="${esc(name)}" ${attrs}>${esc(value)}</textarea></label>`;
  const fieldNumber = (name, label, value = 0) => `<label class="admin-label">${esc(label)}<input class="admin-input" type="number" name="${esc(name)}" value="${esc(value)}"></label>`;
  const fieldCheck = (name, label, checked = false) => `<label class="admin-check"><input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}> ${esc(label)}</label>`;
  const fieldSelect = (name, label, value, options) => `<label class="admin-label">${esc(label)}<select class="admin-select" name="${esc(name)}">${options.map((option) => `<option value="${esc(option.value)}"${String(option.value) === String(value) ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>`;

  const mediaUrl = (row) => `/media/${encodeURIComponent(row.object_key)}`;
  const loadMedia = async (force = false) => {
    if (!mediaCache || force) mediaCache = await request('/api/admin/media');
    return mediaCache;
  };
  const mediaById = (id) => (mediaCache || []).find((row) => String(row.id) === String(id));

  const pickerField = (name, label, value = '') => `<div class="admin-label">${esc(label)}<input type="hidden" name="${esc(name)}" value="${esc(value)}"><div class="admin-picker" data-picker><div class="admin-picker-preview" data-picker-preview></div><div class="admin-picker-actions"><button type="button" class="admin-button secondary" data-picker-choose>Choose image</button><button type="button" class="admin-button secondary" data-picker-clear>Clear</button></div></div></div>`;

  const paintPicker = (picker) => {
    const id = picker.querySelector('input[type="hidden"]').value;
    const preview = picker.querySelector('[data-picker-preview]');
    const row = id ? mediaById(id) : null;
    preview.innerHTML = row
      ? `<img src="${mediaUrl(row)}" alt="${esc(row.alt_text || row.filename)}">`
      : '<span class="admin-hint">No image selected</span>';
  };

  const openMediaModal = (onPick) => {
    const rows = mediaCache || [];
    const modal = document.createElement('div');
    modal.className = 'admin-modal';
    modal.innerHTML = `<div class="admin-modal__panel" role="dialog" aria-modal="true" aria-label="Choose an image"><div class="admin-modal__head"><strong>Choose an image</strong><button type="button" class="admin-button secondary" data-modal-close>Close</button></div>${rows.length ? `<div class="admin-media-grid">${rows.map((row) => `<button type="button" class="admin-media-card" data-modal-pick="${row.id}"><img src="${mediaUrl(row)}" alt=""><span class="admin-media-body">${esc(row.filename)}</span></button>`).join('')}</div>` : '<p class="admin-hint">No images yet. Upload some on the Media page.</p>'}</div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelector('[data-modal-close]').addEventListener('click', close);
    modal.querySelectorAll('[data-modal-pick]').forEach((button) => button.addEventListener('click', () => {
      const row = rows.find((item) => String(item.id) === button.dataset.modalPick);
      if (row) { onPick(row); close(); }
    }));
  };

  const bindPickers = (scope) => {
    scope.querySelectorAll('[data-picker]').forEach((picker) => {
      paintPicker(picker);
      picker.querySelector('[data-picker-choose]').addEventListener('click', async () => {
        try { await loadMedia(); } catch (error) { say(error.message, true); return; }
        openMediaModal((row) => {
          picker.querySelector('input[type="hidden"]').value = String(row.id);
          paintPicker(picker);
        });
      });
      picker.querySelector('[data-picker-clear]').addEventListener('click', () => {
        picker.querySelector('input[type="hidden"]').value = '';
        paintPicker(picker);
      });
    });
  };

  const layout = (content, active, title) => {
    const links = [
      ['/admin/dashboard', 'Dashboard'],
      ['/admin/home', 'Homepage'],
      ['/admin/about', 'About'],
      ['/admin/services', 'Services'],
      ['/admin/process', 'Process'],
      ['/admin/skills', 'Skills'],
      ['/admin/projects', 'Projects'],
      ['/admin/categories', 'Categories'],
      ['/admin/faq', 'FAQ'],
      ['/admin/media', 'Media'],
      ['/admin/settings', 'Settings'],
      ['/admin/seo', 'SEO'],
      ['/admin/forms', 'Inquiries'],
      ['/admin/demos', 'Demos'],
    ];
    const nav = links.map(([href, label]) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
    return `<div class="admin-layout"><aside class="admin-sidebar"><h1>Xilveno Portfolio</h1>${nav}<button id="logout-button" type="button">Log out</button></aside><section class="admin-main"><div class="admin-top"><h2>${esc(title)}</h2><a href="/" target="_blank" rel="noopener">View site</a></div><div id="admin-message"></div>${content}</section></div>`;
  };

  const bindLogout = () => {
    document.querySelector('#logout-button')?.addEventListener('click', async () => {
      try { await request('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* session may already be gone */ }
      window.location.href = '/admin/login';
    });
  };

  const renderLogin = () => {
    root.innerHTML = `<section class="admin-card admin-login"><h1>Portfolio admin</h1><p>Sign in to manage the site.</p><div id="admin-message"></div><form class="admin-form" id="login-form"><label class="admin-label">Email<input class="admin-input" name="email" type="email" value="admin@xilveno.shop" required></label><label class="admin-label">Password<input class="admin-input" name="password" type="password" required></label><button class="admin-button" type="submit">Sign in</button></form></section>`;
    document.querySelector('#login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
        csrfToken = data.csrfToken;
        window.location.href = '/admin/dashboard';
      } catch (error) {
        say(error.message, true);
      }
    });
  };

  const dashboardPage = async () => {
    const data = await request('/api/admin/dashboard');
    const recent = (data.recent || []).map((row) => `<tr><td>${esc(row.created_at)}</td><td>${esc(row.action)}</td><td>${esc(row.entity)}</td><td>${esc(row.entity_id)}</td></tr>`).join('');
    root.innerHTML = layout(`<div class="admin-grid"><div class="admin-card admin-stat"><strong>${data.projects}</strong><span>Total projects</span></div><div class="admin-card admin-stat"><strong>${data.featuredProjects}</strong><span>Featured projects</span></div><div class="admin-card admin-stat"><strong>${data.media}</strong><span>Media files</span></div><div class="admin-card admin-stat"><strong>${data.unreadInquiries}</strong><span>Unread inquiries</span></div></div><div class="admin-card" style="margin-top:24px"><h3>Quick actions</h3><p class="admin-actions"><a class="admin-button" href="/admin/projects/new">New project</a><a class="admin-button secondary" href="/admin/media">Upload media</a><a class="admin-button secondary" href="/admin/home">Edit homepage</a></p><h3>Recent changes</h3>${recent ? `<div style="overflow:auto"><table class="admin-table"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>ID</th></tr></thead><tbody>${recent}</tbody></table></div>` : '<p class="admin-hint">No activity yet.</p>'}</div>`, '/admin/dashboard', 'Dashboard');
    bindLogout();
  };

  const sectionSchemas = {
    hero: [
      ['eyebrow', 'Eyebrow'], ['title', 'Title', 'area'], ['subtitle', 'Subtitle', 'area'],
      ['cta_text', 'Primary button'], ['cta_url', 'Primary button URL'], ['cta2_text', 'Secondary button'], ['cta2_url', 'Secondary button URL'],
      ['panel_title', 'Panel title'], ['panel_points', 'Panel points (one per line)', 'list'], ['tech_strip', 'Tech strip (one per line)', 'list'],
    ],
    services_heading: [['eyebrow', 'Eyebrow'], ['title', 'Title'], ['text', 'Text', 'area']],
    problems_heading: [['eyebrow', 'Eyebrow'], ['title', 'Title'], ['text', 'Text', 'area']],
    work_heading: [['eyebrow', 'Eyebrow'], ['title', 'Title'], ['text', 'Text', 'area']],
    process_heading: [['eyebrow', 'Eyebrow'], ['title', 'Title'], ['text', 'Text', 'area']],
    skills_heading: [['eyebrow', 'Eyebrow'], ['title', 'Title'], ['text', 'Text', 'area']],
    faq_heading: [['eyebrow', 'Eyebrow'], ['title', 'Title'], ['text', 'Text', 'area']],
    cta: [['eyebrow', 'Eyebrow'], ['title', 'Title'], ['text', 'Text', 'area'], ['cta_text', 'Primary button'], ['cta_url', 'Primary button URL'], ['cta2_text', 'Secondary button'], ['cta2_url', 'Secondary button URL']],
    about: [
      ['intro_title', 'Intro heading'], ['intro_text', 'Intro paragraphs (one per line)', 'list'],
      ['profile_focus', 'Profile focus', 'text', 'profile.focus'], ['profile_working', 'Profile working with', 'text', 'profile.working'],
      ['values_title', 'Values heading'], ['values', 'Values (title :: description, one per line)', 'pairs'],
    ],
  };

  const sectionValue = (data, field) => {
    const path = field[3];
    if (path === 'profile.focus') return String(data.profile?.focus || '');
    if (path === 'profile.working') return String(data.profile?.working || '');
    const value = data[field[0]];
    if (field[2] === 'list' || field[2] === 'pairs') return linesOf(value);
    return value == null ? '' : String(value);
  };

  const sectionField = (key, field, data) => {
    const [name, label, type] = field;
    const value = sectionValue(data, field);
    if (type === 'area') return fieldArea(`${key}__${name}`, label, value);
    if (type === 'list') return fieldArea(`${key}__${name}`, label, value, 'rows="4"');
    if (type === 'pairs') {
      const items = (Array.isArray(value) ? value : []).map((item) => {
        if (item && typeof item === 'object') return item;
        try { return JSON.parse(String(item)); } catch { return { title: String(item), text: '' }; }
      });
      return fieldArea(`${key}__${name}`, label, items.map((item) => `${item.title || ''} :: ${item.text || ''}`).join('\n'), 'rows="5"');
    }
    return fieldText(`${key}__${name}`, label, value);
  };

  const homePage = async () => {
    const data = await request('/api/admin/home');
    const cards = Object.entries(sectionSchemas).map(([key, fields]) => {
      const source = data[key] || {};
      const body = fields.map((field) => sectionField(key, field, source)).join('');
      return `<div class="admin-card" style="margin-top:20px"><h3>${esc(key === 'cta' ? 'Call to action band' : key === 'about' ? 'About section' : key.replace(/_/g, ' '))}</h3><form class="admin-form" data-section="${esc(key)}">${body}<button class="admin-button" type="submit">Save section</button></form></div>`;
    }).join('');
    root.innerHTML = layout(cards, '/admin/home', 'Homepage editor');
    bindLogout();
    root.querySelectorAll('[data-section]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveSectionForm(form);
    }));
  };

  const collectionConfigs = {
    services: {
      title: 'Services',
      fields: [
        ['slug', 'Slug'], ['title', 'Title'], ['icon', 'Icon'], ['description', 'Short description', 'area'],
        ['overview', 'Overview', 'area'], ['audience', 'Audience', 'area'],
        ['includes_json', 'What is included (one per line)', 'list'], ['workflow_json', 'Workflow (one per line)', 'list'],
        ['sort_order', 'Sort order', 'number'], ['active', 'Active', 'check'],
      ],
      required: ['slug', 'title'],
    },
    process: {
      title: 'Process steps',
      fields: [['title', 'Title'], ['description', 'Description', 'area'], ['sort_order', 'Sort order', 'number'], ['active', 'Active', 'check']],
      required: ['title'],
    },
    skills: {
      title: 'Skills',
      fields: [['title', 'Title'], ['description', 'Description', 'area'], ['icon', 'Icon'], ['sort_order', 'Sort order', 'number'], ['active', 'Active', 'check']],
      required: ['title'],
    },
    faqs: {
      title: 'FAQs',
      fields: [['question', 'Question'], ['answer', 'Answer', 'area'], ['sort_order', 'Sort order', 'number'], ['active', 'Active', 'check']],
      required: ['question', 'answer'],
    },
    categories: {
      title: 'Categories',
      fields: [['name', 'Name'], ['slug', 'Slug'], ['description', 'Description', 'area'], ['sort_order', 'Sort order', 'number']],
      required: ['name', 'slug'],
    },
  };

  const configField = (config, field, row) => {
    const [name, label, type] = field;
    const value = row ? row[name] : (type === 'number' ? 0 : type === 'check' ? true : '');
    if (type === 'area') return fieldArea(name, label, value ?? '');
    if (type === 'list') return fieldArea(name, label, linesOf(value ?? '[]'), 'rows="4"');
    if (type === 'number') return fieldNumber(name, label, value ?? 0);
    if (type === 'check') return fieldCheck(name, label, Boolean(value));
    return fieldText(name, label, value ?? '');
  };

  let currentCollection = 'services';

  const collectionRow = (config, row, isNew) => `<form class="admin-card admin-repeater" data-row-form data-id="${row ? row.id : ''}" style="margin-top:16px">${config.fields.map((field) => configField(config, field, row)).join('')}<p class="admin-actions"><button class="admin-button" type="submit">${isNew ? 'Create' : 'Save'}</button>${isNew ? '' : '<button class="admin-button danger" type="button" data-row-delete>Delete</button>'}</p></form>`;

  const bindRows = (config, reload) => {
    root.querySelectorAll('[data-row-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = form.dataset.id;
        const payload = {};
        for (const [name, , type] of config.fields) {
          const control = form.elements[name];
          if (type === 'check') payload[name] = control.checked ? 'true' : 'false';
          else if (type === 'list') payload[name] = JSON.stringify(listOf(control.value));
          else payload[name] = control.value;
        }
        for (const key of config.required) if (!String(payload[key] || '').trim()) return say(`${key} is required.`, true);
        if (id) payload.id = id;
        try {
          await request(`/api/admin/${currentCollection}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
          say('Saved.');
          await reload();
        } catch (error) { say(error.message, true); }
      });
      form.querySelector('[data-row-delete]')?.addEventListener('click', async () => {
        if (!confirm('Delete this item?')) return;
        try {
          await request(`/api/admin/${currentCollection}`, { method: 'DELETE', body: JSON.stringify({ id: form.dataset.id }) });
          await reload();
        } catch (error) { say(error.message, true); }
      });
    });
  };

  const collectionPage = async (resource) => {
    currentCollection = resource;
    const config = collectionConfigs[resource];
    const list = normalizeRows(await request(`/api/admin/${resource}`));
    const active = resource === 'faqs' ? '/admin/faq' : `/admin/${resource}`;
    const reload = () => collectionPage(resource);
    root.innerHTML = layout(`<div class="admin-card" style="margin-top:20px"><h3>Add ${esc(config.title.toLowerCase().replace(/s$/, ''))}</h3>${collectionRow(config, null, true)}</div>${list.map((row) => collectionRow(config, row, false)).join('')}`, active, config.title);
    bindLogout();
    bindRows(config, reload);
  };

  const saveSectionForm = async (form) => {
    const key = form.dataset.section;
    const payload = {};
    for (const field of sectionSchemas[key]) {
      const raw = form.elements[`${key}__${field[0]}`].value;
      if (field[3]) {
        payload.profile = { ...(payload.profile || {}) };
        payload.profile[field[3].endsWith('focus') ? 'focus' : 'working'] = raw.trim();
      } else if (field[2] === 'list') payload[field[0]] = listOf(raw);
      else if (field[2] === 'pairs') {
        payload[field[0]] = listOf(raw).map((line) => {
          const [title, ...rest] = line.split('::');
          return { title: (title || '').trim(), text: rest.join('::').trim() };
        }).filter((item) => item.title || item.text);
      } else payload[field[0]] = raw;
    }
    try {
      await request('/api/admin/home', { method: 'POST', body: JSON.stringify({ [key]: payload }) });
      say('Section saved.');
    } catch (error) { say(error.message, true); }
  };

  const aboutPage = async () => {
    const data = await request('/api/admin/home');
    const fields = sectionSchemas.about;
    root.innerHTML = layout(`<div class="admin-card" style="margin-top:20px"><h3>About section</h3><form class="admin-form" data-section="about">${fields.map((field) => sectionField('about', field, data.about || {})).join('')}<button class="admin-button" type="submit">Save about section</button></form></div><div class="admin-card" style="margin-top:20px"><h3>Related content</h3><p class="admin-actions"><a class="admin-button secondary" href="/admin/skills">Manage skills</a><a class="admin-button secondary" href="/admin/settings">Site settings</a></p></div>`, '/admin/about', 'About');
    bindLogout();
    root.querySelector('[data-section]').addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveSectionForm(event.currentTarget);
    });
  };

  const projectFields = [
    ['title', 'Title'], ['slug', 'Slug'], ['short_description', 'Short description', 'area'], ['full_description', 'Full description', 'area'],
    ['project_type', 'Project type'], ['platform', 'Platform'], ['role', 'Role'], ['focus', 'Focus'], ['status', 'Status'],
    ['live_demo_url', 'Live demo URL'], ['case_study_url', 'Case study URL'],
    ['challenge', 'Challenge', 'area'], ['approach', 'Approach', 'area'], ['solution', 'Solution', 'area'],
    ['key_features_json', 'Key features (one per line)', 'list'], ['technologies_json', 'Technologies (one per line)', 'list'],
    ['sort_order', 'Sort order', 'number'], ['featured', 'Featured', 'check'], ['published', 'Published', 'check'],
  ];

  const projectValue = (row, name, type) => {
    const value = row ? row[name] : (type === 'number' ? 0 : type === 'check' ? name === 'published' : '');
    if (type === 'list') return linesOf(value ?? '[]');
    if (type === 'area') return value ?? '';
    if (type === 'number') return value ?? 0;
    if (type === 'check') return Boolean(value);
    return value == null ? '' : String(value);
  };

  const projectsPage = async () => {
    const list = normalizeRows(await request('/api/admin/projects'));
    const rows = list.map((row) => `<tr><td><strong>${esc(row.title)}</strong><br><span class="admin-hint">/${esc(row.slug)}</span></td><td>${esc(row.category_name || '—')}</td><td>${esc(row.project_type)}</td><td>${row.featured ? 'Yes' : 'No'}</td><td>${row.published ? 'Yes' : 'No'}</td><td><a class="admin-button secondary" href="/admin/projects/${row.id}">Edit</a> <button class="admin-button danger" data-project-delete="${row.id}">Delete</button></td></tr>`).join('');
    root.innerHTML = layout(`<p class="admin-actions"><a class="admin-button" href="/admin/projects/new">New project</a></p><div class="admin-card" style="overflow:auto"><table class="admin-table"><thead><tr><th>Project</th><th>Category</th><th>Type</th><th>Featured</th><th>Published</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">No projects yet.</td></tr>'}</tbody></table></div>`, '/admin/projects', 'Projects');
    bindLogout();
    root.querySelectorAll('[data-project-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Delete this project?')) return;
      try {
        await request('/api/admin/projects', { method: 'DELETE', body: JSON.stringify({ id: button.dataset.projectDelete }) });
        await projectsPage();
      } catch (error) { say(error.message, true); }
    }));
  };

  const projectFormPage = async (id) => {
    const [projects, categories] = await Promise.all([request('/api/admin/projects'), request('/api/admin/categories')]);
    const list = normalizeRows(projects);
    const row = id ? list.find((item) => String(item.id) === String(id)) : null;
    if (id && !row) {
      root.innerHTML = layout('<div class="admin-card">Project not found.</div>', '/admin/projects', 'Projects');
      bindLogout();
      return;
    }
    const categoryOptions = [{ value: '', label: 'No category' }, ...normalizeRows(categories).map((item) => ({ value: String(item.id), label: item.name }))];
    const fieldHtml = projectFields.map(([name, label, type]) => {
      const value = projectValue(row, name, type);
      if (type === 'area') return fieldArea(name, label, value);
      if (type === 'list') return fieldArea(name, label, value, 'rows="4"');
      if (type === 'number') return fieldNumber(name, label, value);
      if (type === 'check') return fieldCheck(name, label, value);
      return fieldText(name, label, value);
    }).join('');
    const galleryBlock = id ? `<div class="admin-card" style="margin-top:20px"><h3>Case study gallery</h3><div class="admin-media-grid" id="gallery-grid"></div><p class="admin-actions" style="margin-top:12px"><button class="admin-button secondary" type="button" id="gallery-add">Add image</button><button class="admin-button" type="button" id="gallery-save">Save gallery</button></p></div>` : '';
    root.innerHTML = layout(`<form class="admin-card admin-form" id="project-form" style="margin-top:20px">${fieldHtml}<div class="admin-row">${fieldSelect('category_id', 'Category', row ? (row.category_id ?? '') : '', categoryOptions)}${pickerField('featured_image_id', 'Featured image', row ? (row.featured_image_id ?? '') : '')}</div>${pickerField('case_study_media_id', 'Case study image', row ? (row.case_study_media_id ?? '') : '')}<p class="admin-actions"><button class="admin-button" type="submit">${id ? 'Save project' : 'Create project'}</button><a class="admin-button secondary" href="/admin/projects">Back</a></p></form>${galleryBlock}`, '/admin/projects', id ? 'Edit project' : 'New project');
    bindLogout();
    await loadMedia();
    bindPickers(root);
    document.querySelector('#project-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = {};
      for (const [name, , type] of projectFields) {
        const control = form.elements[name];
        if (type === 'check') payload[name] = control.checked ? 'true' : 'false';
        else if (type === 'list') payload[name] = JSON.stringify(listOf(control.value));
        else payload[name] = control.value;
      }
      payload.category_id = form.elements.category_id.value;
      payload.featured_image_id = form.elements.featured_image_id.value;
      payload.case_study_media_id = form.elements.case_study_media_id.value;
      if (id) payload.id = id;
      if (!payload.title.trim() || !payload.slug.trim()) return say('Title and slug are required.', true);
      try {
        const result = await request('/api/admin/projects', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        say('Saved.');
        if (!id && result.id) window.location.href = `/admin/projects/${result.id}`;
      } catch (error) { say(error.message, true); }
    });
    if (id) await bindGallery(id);
  };

  const bindGallery = async (projectId) => {
    const grid = document.querySelector('#gallery-grid');
    let items = [];
    const paint = () => {
      grid.innerHTML = items.length ? items.map((row, index) => `<div class="admin-media-card"><img src="${mediaUrl(row)}" alt=""><span class="admin-media-body">${esc(row.filename)}</span><span class="admin-actions"><button type="button" class="admin-button secondary" data-gal-up="${index}"${index === 0 ? ' disabled' : ''}>Up</button><button type="button" class="admin-button secondary" data-gal-down="${index}"${index === items.length - 1 ? ' disabled' : ''}>Down</button><button type="button" class="admin-button danger" data-gal-remove="${index}">Remove</button></span></div>`).join('') : '<p class="admin-hint">No gallery images yet.</p>';
      grid.querySelectorAll('[data-gal-up]').forEach((button) => button.addEventListener('click', () => {
        const index = Number(button.dataset.galUp);
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
        paint();
      }));
      grid.querySelectorAll('[data-gal-down]').forEach((button) => button.addEventListener('click', () => {
        const index = Number(button.dataset.galDown);
        [items[index + 1], items[index]] = [items[index], items[index + 1]];
        paint();
      }));
      grid.querySelectorAll('[data-gal-remove]').forEach((button) => button.addEventListener('click', () => {
        items.splice(Number(button.dataset.galRemove), 1);
        paint();
      }));
    };
    const refresh = async () => {
      items = normalizeRows(await request(`/api/admin/project-gallery?project_id=${projectId}`));
      paint();
    };
    await refresh();
    document.querySelector('#gallery-add').addEventListener('click', async () => {
      try { await loadMedia(true); } catch (error) { say(error.message, true); return; }
      openMediaModal((row) => {
        if (!items.some((item) => String(item.id) === String(row.id))) items.push(row);
        paint();
      });
    });
    document.querySelector('#gallery-save').addEventListener('click', async () => {
      try {
        await request('/api/admin/project-gallery', { method: 'PUT', body: JSON.stringify({ project_id: projectId, media_ids: items.map((item) => item.id) }) });
        say('Gallery saved.');
        await refresh();
      } catch (error) { say(error.message, true); }
    });
  };

  const mediaCard = (row) => `<div class="admin-media-card"><img src="${mediaUrl(row)}" alt="${esc(row.alt_text || '')}"><span class="admin-media-body"><span>${esc(row.filename)}</span><span class="admin-hint">${esc(row.width || '?')}×${esc(row.height || '?')} · ${esc(row.mime_type)}</span><label class="admin-label">Alt text<input class="admin-input" data-alt="${row.id}" value="${esc(row.alt_text || '')}"></label><span class="admin-actions"><button type="button" class="admin-button secondary" data-alt-save="${row.id}">Save alt</button><button type="button" class="admin-button secondary" data-media-replace="${row.id}">Replace</button><button type="button" class="admin-button danger" data-media-delete="${row.id}">Delete</button></span></span></div>`;

  const mediaPage = async (query = '') => {
    const rows = normalizeRows(await request(query ? `/api/admin/media?q=${encodeURIComponent(query)}` : '/api/admin/media'));
    mediaCache = rows;
    const content = `<div class="admin-card" style="margin-top:20px"><form class="admin-form" id="upload-form"><div class="admin-row"><label class="admin-label">Image file<input class="admin-input" type="file" name="files" accept="image/jpeg,image/png,image/webp,image/svg+xml" multiple required></label><label class="admin-label">Alt text<input class="admin-input" name="alt_text"></label></div><p class="admin-actions"><button class="admin-button" type="submit">Upload</button></p></form><form class="admin-row" id="media-search" style="margin-top:8px"><label class="admin-label">Search<input class="admin-input" name="q" type="search" value="${esc(query)}" placeholder="filename…"></label><p class="admin-actions" style="align-self:end"><button class="admin-button secondary" type="submit">Search</button></p></form></div><div class="admin-media-grid" style="margin-top:20px">${rows.map(mediaCard).join('') || '<p class="admin-hint">No media yet.</p>'}</div>`;
    root.innerHTML = layout(content, '/admin/media', 'Media library');
    bindLogout();
    document.querySelector('#upload-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await request('/api/admin/media', { method: 'POST', body: new FormData(event.currentTarget) });
        say('Uploaded.');
        await mediaPage(query);
      } catch (error) { say(error.message, true); }
    });
    document.querySelector('#media-search').addEventListener('submit', async (event) => {
      event.preventDefault();
      await mediaPage(new FormData(event.currentTarget).get('q').trim());
    });
    root.querySelectorAll('[data-alt-save]').forEach((button) => button.addEventListener('click', async () => {
      const id = button.dataset.altSave;
      try {
        await request('/api/admin/media', { method: 'PATCH', body: JSON.stringify({ id, alt_text: root.querySelector(`[data-alt="${id}"]`).value }) });
        say('Alt text saved.');
      } catch (error) { say(error.message, true); }
    }));
    root.querySelectorAll('[data-media-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Delete this media object? References to it may break.')) return;
      try {
        await request('/api/admin/media', { method: 'DELETE', body: JSON.stringify({ id: button.dataset.mediaDelete }) });
        await mediaPage(query);
      } catch (error) { say(error.message, true); }
    }));
    root.querySelectorAll('[data-media-replace]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.mediaReplace;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/svg+xml';
      input.addEventListener('change', async () => {
        if (!input.files.length) return;
        const form = new FormData();
        form.set('id', id);
        form.set('alt_text', root.querySelector(`[data-alt="${id}"]`).value);
        form.append('files', input.files[0]);
        try {
          await request('/api/admin/media', { method: 'PUT', body: form });
          say('File replaced.');
          await mediaPage(query);
        } catch (error) { say(error.message, true); }
      });
      input.click();
    }));
  };

  const settingsPage = async () => {
    const data = await request('/api/admin/settings');
    let social = {};
    try { social = JSON.parse(data.social_links || '{}'); } catch { social = {}; }
    const basics = ['site_name', 'tagline', 'email', 'phone', 'whatsapp', 'location'].map((name) => fieldText(name, name.replace(/_/g, ' '), data[name] || '')).join('');
    const socialFields = ['facebook', 'instagram', 'linkedin', 'behance', 'dribbble', 'other'].map((name) => fieldText(name, name, social[name] || '')).join('');
    const imagePickers = [
      pickerField('logo_media_id', 'Logo image', data.logo_media_id || ''),
      pickerField('favicon_media_id', 'Favicon image', data.favicon_media_id || ''),
      pickerField('hero_image_media_id', 'Hero image', data.hero_image_media_id || ''),
      pickerField('about_image_media_id', 'About image', data.about_image_media_id || ''),
      pickerField('cta_image_media_id', 'CTA image', data.cta_image_media_id || ''),
    ].join('');
    root.innerHTML = layout(`<form class="admin-card admin-form" id="settings-form" style="margin-top:20px"><h3>Identity & contact</h3><div class="admin-row">${basics}</div><h3>Branding images</h3><div class="admin-row">${imagePickers}</div><h3>Social links</h3><div class="admin-row">${socialFields}</div><p class="admin-actions"><button class="admin-button" type="submit">Save settings</button></p></form>`, '/admin/settings', 'Settings');
    bindLogout();
    await loadMedia();
    bindPickers(root);
    document.querySelector('#settings-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = {};
      for (const name of ['site_name', 'tagline', 'email', 'phone', 'whatsapp', 'location', 'logo_media_id', 'favicon_media_id', 'hero_image_media_id', 'about_image_media_id', 'cta_image_media_id']) payload[name] = form.elements[name].value;
      for (const name of ['facebook', 'instagram', 'linkedin', 'behance', 'dribbble', 'other']) payload[name] = form.elements[name].value;
      try {
        await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
        say('Settings saved.');
      } catch (error) { say(error.message, true); }
    });
  };

  const seoPage = async () => {
    const data = await request('/api/admin/settings');
    const fields = ['seo_title', 'seo_home_description', 'default_og_image', 'canonical_base', 'robots_mode', 'privacy_url', 'terms_url'];
    const html = fields.map((name) => ['seo_home_description'].includes(name)
      ? fieldArea(name, name.replace(/_/g, ' '), data[name] || '')
      : fieldText(name, name.replace(/_/g, ' '), data[name] || '')).join('');
    root.innerHTML = layout(`<form class="admin-card admin-form" id="seo-form" style="margin-top:20px">${html}<p class="admin-actions"><button class="admin-button" type="submit">Save SEO settings</button></p></form>`, '/admin/seo', 'SEO');
    bindLogout();
    document.querySelector('#seo-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {};
      for (const name of fields) payload[name] = event.currentTarget.elements[name].value;
      try {
        await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
        say('SEO settings saved.');
      } catch (error) { say(error.message, true); }
    });
  };

  const inquiriesPage = async () => {
    const rows = normalizeRows(await request('/api/admin/inquiries'));
    const table = rows.map((row) => `<tr><td>${esc(row.created_at)}</td><td><strong>${esc(row.name)}</strong><br><a href="mailto:${esc(row.email)}">${esc(row.email)}</a></td><td>${esc(row.project_type)}<br>${esc(row.budget)}<br>${esc(row.timeline)}</td><td>${esc(row.message)}</td><td><select class="admin-select" data-status="${row.id}">${['unread', 'read', 'archived'].map((status) => `<option value="${status}"${row.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select></td><td><button class="admin-button secondary" data-status-save="${row.id}">Save</button> <button class="admin-button danger" data-inquiry-delete="${row.id}">Delete</button></td></tr>`).join('');
    root.innerHTML = layout(`<div class="admin-card" style="margin-top:20px;overflow:auto"><table class="admin-table"><thead><tr><th>Received</th><th>Contact</th><th>Project</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>${table || '<tr><td colspan="6">No inquiries yet.</td></tr>'}</tbody></table></div>`, '/admin/forms', 'Inquiries');
    bindLogout();
    root.querySelectorAll('[data-status-save]').forEach((button) => button.addEventListener('click', async () => {
      const id = button.dataset.statusSave;
      try {
        await request('/api/admin/inquiries', { method: 'PATCH', body: JSON.stringify({ id, status: root.querySelector(`[data-status="${id}"]`).value }) });
        say('Status updated.');
      } catch (error) { say(error.message, true); }
    }));
    root.querySelectorAll('[data-inquiry-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Delete this inquiry?')) return;
      try {
        await request('/api/admin/inquiries', { method: 'DELETE', body: JSON.stringify({ id: button.dataset.inquiryDelete }) });
        await inquiriesPage();
      } catch (error) { say(error.message, true); }
    }));
  };

  const demosPage = async () => {
    const rows = normalizeRows(await request('/api/admin/demos'));
    const table = rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.subdomain)}</td><td>${esc(row.status)}</td><td>${esc(row.live_url)}</td><td><button class="admin-button danger" data-demo-delete="${row.id}">Delete</button></td></tr>`).join('');
    root.innerHTML = layout(`<div class="admin-card" style="margin-top:20px"><form class="admin-form" id="demo-form"><div class="admin-row">${fieldText('name', 'Name')}${fieldText('slug', 'Slug', '', 'placeholder="dental"')}</div><div class="admin-row">${fieldText('subdomain', 'Subdomain', '', 'placeholder="dental.xilveno.shop"')}${fieldText('live_url', 'Live URL')}</div>${fieldArea('description', 'Description')}${fieldSelect('status', 'Status', 'draft', [{ value: 'draft', label: 'draft' }, { value: 'active', label: 'active' }, { value: 'archived', label: 'archived' }])}<p class="admin-actions"><button class="admin-button" type="submit">Create demo</button></p></form></div><div class="admin-card" style="margin-top:20px;overflow:auto"><table class="admin-table"><thead><tr><th>Name</th><th>Subdomain</th><th>Status</th><th>Live URL</th><th></th></tr></thead><tbody>${table || '<tr><td colspan="5">No demos yet.</td></tr>'}</tbody></table></div>`, '/admin/demos', 'Demo sites');
    bindLogout();
    document.querySelector('#demo-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await request('/api/admin/demos', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
        say('Demo created.');
        await demosPage();
      } catch (error) { say(error.message, true); }
    });
    root.querySelectorAll('[data-demo-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Delete this demo?')) return;
      try {
        await request('/api/admin/demos', { method: 'DELETE', body: JSON.stringify({ id: button.dataset.demoDelete }) });
        await demosPage();
      } catch (error) { say(error.message, true); }
    }));
  };

  const load = async () => {
    if (root.dataset.login === 'true') return renderLogin();
    let session;
    try {
      session = await request('/api/admin/session');
    } catch {
      window.location.href = '/admin/login';
      return;
    }
    csrfToken = session.csrfToken || '';
    const page = root.dataset.page || '/admin/dashboard';
    try {
      if (page === '/admin/home') return await homePage();
      if (page === '/admin/about') return await aboutPage();
      if (page === '/admin/services') return await collectionPage('services');
      if (page === '/admin/process') return await collectionPage('process');
      if (page === '/admin/skills') return await collectionPage('skills');
      if (page === '/admin/faq') return await collectionPage('faqs');
      if (page === '/admin/categories') return await collectionPage('categories');
      if (page === '/admin/media') return await mediaPage();
      if (page === '/admin/projects') return await projectsPage();
      if (page === '/admin/projects/new') return await projectFormPage(null);
      const projectMatch = page.match(/^\/admin\/projects\/(\d+)$/);
      if (projectMatch) return await projectFormPage(Number(projectMatch[1]));
      if (page === '/admin/settings') return await settingsPage();
      if (page === '/admin/seo') return await seoPage();
      if (page === '/admin/forms') return await inquiriesPage();
      if (page === '/admin/demos') return await demosPage();
      return await dashboardPage();
    } catch (error) {
      root.innerHTML = layout(`<div class="admin-card">${message(error.message, true)}</div>`, '/admin/dashboard', 'Portfolio admin');
      bindLogout();
    }
  };

  load();
})();
