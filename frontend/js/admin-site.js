// Admin > Website: visual editor for the storefront's colours, fonts and content,
// with a live preview. Edits are kept in a draft until "Publish" saves them.
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function set(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
  }

  let saved = null;      // last published settings
  let draft = null;      // what the editor shows
  let defaults = null;
  let options = { headingFonts: [], bodyFonts: [], icons: [] };
  let history = [];
  let initialised = false;
  const openGroups = new Set(['theme']);

  async function api(path, { method = 'GET', body, raw, type } = {}) {
    const res = await fetch(`/api/admin${path}`, {
      method, credentials: 'same-origin',
      headers: raw ? { 'Content-Type': type } : body ? { 'Content-Type': 'application/json' } : undefined,
      body: raw || (body ? JSON.stringify(body) : undefined)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { location.reload(); throw new Error('Please sign in again.'); }
    if (!res.ok) { const e = new Error(data.error || 'Request failed.'); e.field = data.field; e.status = res.status; throw e; }
    return data;
  }

  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('is-visible');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('is-visible'), 2800);
  }

  // ---------- Presets ----------
  const PRESETS = [
    { name: 'Adirudra (original)', colors: null },
    { name: 'Sandalwood', colors: { paper: '#fbf7f0', surface: '#ffffff', ink: '#2b2118', muted: '#75675a', line: '#eadfce', walnut: '#6b4423', bronze: '#9a6a35', gold: '#e0b77a', dark: '#2a1d14', onPrimary: '#ffffff' } },
    { name: 'Saffron & maroon', colors: { paper: '#fdf6ec', surface: '#fffaf3', ink: '#2a1414', muted: '#7a5c55', line: '#f0dcc6', walnut: '#7a1f1f', bronze: '#b4501a', gold: '#f2a541', dark: '#2b0f0f', onPrimary: '#ffffff' } },
    { name: 'Forest sage', colors: { paper: '#f4f5ef', surface: '#fbfcf8', ink: '#1d2419', muted: '#5f6a58', line: '#dde3d2', walnut: '#2f4a34', bronze: '#5f7032', gold: '#c9b26b', dark: '#17221a', onPrimary: '#ffffff' } },
    { name: 'Temple stone', colors: { paper: '#f5f4f2', surface: '#ffffff', ink: '#1f1f22', muted: '#66656b', line: '#e2e0dc', walnut: '#26262b', bronze: '#8a6d3b', gold: '#cfae6d', dark: '#18181b', onPrimary: '#ffffff' } }
  ];

  // ---------- Editor schema ----------
  const text = (path, label, extra = {}) => ({ type: 'text', path, label, ...extra });
  const area = (path, label, extra = {}) => ({ type: 'textarea', path, label, ...extra });
  const color = (key, label, hint) => ({ type: 'color', path: `theme.colors.${key}`, label, hint });

  const GROUPS = () => [
    { id: 'theme', title: 'Colours & fonts', fields: [
      { type: 'presets' },
      color('paper', 'Page background'),
      color('surface', 'Cards & inputs'),
      color('ink', 'Main text'),
      color('muted', 'Secondary text'),
      color('line', 'Borders & dividers'),
      color('walnut', 'Primary colour', 'Buttons, cart badge, dark band'),
      color('onPrimary', 'Text on primary colour'),
      color('bronze', 'Accent', 'Small headings, links, prices highlights'),
      color('gold', 'Accent on dark', 'Highlights on the hero, band and footer'),
      color('dark', 'Hero & footer background'),
      { type: 'contrast' },
      { type: 'select', path: 'theme.fonts.heading', label: 'Heading font', options: options.headingFonts },
      { type: 'select', path: 'theme.fonts.body', label: 'Body font', options: options.bodyFonts },
      { type: 'range', path: 'theme.radius', label: 'Corner rounding', min: 0, max: 24, unit: 'px' }
    ] },
    { id: 'brand', title: 'Brand & announcement bar', fields: [
      { type: 'note', text: 'Tip: in any text you can write {freeShippingOver}, {shippingFee} or {codFee} to show the current amount from Settings.' },
      text('brand.name', 'Store name (header & footer)'),
      { type: 'image', path: 'brand.logo', label: 'Logo' },
      { type: 'toggle', path: 'announcement.enabled', label: 'Show announcement bar at the top of every page' },
      text('announcement.text', 'Announcement text'),
      text('announcement.link', 'Announcement link (optional)', { placeholder: 'shop.html' })
    ] },
    { id: 'nav', title: 'Header menu', fields: [
      { type: 'note', text: 'Leave a label empty to hide that link.' },
      text('nav.home', 'Home link'), text('nav.shop', 'Shop link'), text('nav.malas', 'Malas link'),
      text('nav.bracelets', 'Bracelets link'), text('nav.authenticity', 'Authenticity link'),
      text('nav.searchPlaceholder', 'Search box hint')
    ] },
    { id: 'hero', title: 'Hero banner', fields: [
      { type: 'image', path: 'hero.image', label: 'Background image', hint: 'Wide photo, at least 1600px across. The left side sits behind the text.' },
      text('hero.eyebrow', 'Small line above the headline'),
      area('hero.title', 'Headline', { rows: 2 }),
      area('hero.lead', 'Intro paragraph'),
      text('hero.primaryLabel', 'Main button text'),
      text('hero.primaryLink', 'Main button link'),
      text('hero.secondaryLabel', 'Second link text'),
      text('hero.secondaryLink', 'Second link target')
    ] },
    { id: 'sections', title: 'Homepage sections (order & visibility)', fields: [{ type: 'sections' }] },
    { id: 'trust', title: 'Trust badges', fields: [
      { type: 'list', path: 'trust.items', min: 1, max: 6, addLabel: 'Add badge', newItem: { icon: 'star', title: 'New badge', text: 'Short description' }, itemLabel: (it) => it.title,
        item: [{ type: 'select', key: 'icon', label: 'Icon', options: () => options.icons }, { type: 'text', key: 'title', label: 'Title' }, { type: 'text', key: 'text', label: 'Text' }] }
    ] },
    { id: 'categories', title: 'Shop-by-category section', fields: [
      text('categories.kicker', 'Small heading'), text('categories.title', 'Heading'), area('categories.intro', 'Intro'),
      text('categories.labels.looseBead', 'Loose beads tile'), text('categories.labels.mala', 'Malas tile'),
      text('categories.labels.bracelet', 'Bracelets tile'), text('categories.labels.pendant', 'Pendants tile')
    ] },
    { id: 'featured', title: 'Featured products section', fields: [
      text('featured.kicker', 'Small heading'), text('featured.title', 'Heading'), area('featured.intro', 'Intro'),
      text('featured.linkLabel', '"View all" link text'), text('featured.link', '"View all" link target', { placeholder: 'shop.html' }),
      { type: 'range', path: 'featured.count', label: 'Products shown', min: 3, max: 12, unit: '' }
    ] },
    { id: 'authenticity', title: 'Authenticity section', fields: [
      text('authenticity.kicker', 'Small heading'), area('authenticity.title', 'Heading', { rows: 2 }), area('authenticity.text', 'Paragraph'),
      text('authenticity.linkLabel', 'Link text'), text('authenticity.link', 'Link target', { placeholder: 'shop.html' }),
      { type: 'list', path: 'authenticity.steps', min: 1, max: 6, addLabel: 'Add step', newItem: { title: 'New step', text: '' }, itemLabel: (it, i) => `${String(i + 1).padStart(2, '0')} · ${it.title}`,
        item: [{ type: 'text', key: 'title', label: 'Title' }, { type: 'textarea', key: 'text', label: 'Text' }] }
    ] },
    { id: 'faq', title: 'FAQ section', fields: [
      text('faq.kicker', 'Small heading'), text('faq.title', 'Heading'),
      { type: 'list', path: 'faq.items', min: 0, max: 12, addLabel: 'Add question', newItem: { q: 'New question?', a: '' }, itemLabel: (it) => it.q,
        item: [{ type: 'text', key: 'q', label: 'Question' }, { type: 'textarea', key: 'a', label: 'Answer' }] }
    ] },
    { id: 'footer', title: 'Footer', fields: [
      area('footer.about', 'About text'), text('footer.copyright', 'Copyright line (after © year)'), text('footer.note', 'Small note (right side)'),
      { type: 'note', text: 'Column headings and links. The Shop column uses the category names from "Shop-by-category section". Leave a link label empty to hide it.' },
      text('footer.shopTitle', 'Shop column heading'), text('footer.helpTitle', 'Help column heading'), text('footer.contactTitle', 'Contact column heading'),
      text('footer.cartLabel', '"Your cart" link'), text('footer.authenticityLabel', '"Authenticity" link'), text('footer.faqLabel', '"Shipping & returns" link'),
      text('footer.whatsappLabel', '"WhatsApp us" link')
    ] },
    { id: 'pageShop', title: 'Shop page', fields: [
      text('pages.shop.title', 'Heading'), area('pages.shop.intro', 'Intro'), text('pages.shop.searchPlaceholder', 'Search box hint'),
      text('pages.shop.emptyTitle', 'No results: heading'), area('pages.shop.emptyText', 'No results: text', { rows: 2 })
    ] },
    { id: 'pageProduct', title: 'Product page', fields: [
      text('pages.product.taxNote', 'Note under the price'),
      text('pages.product.certified', 'Assurance: certified products'), text('pages.product.inspected', 'Assurance: other products'),
      text('pages.product.shipping', 'Assurance: shipping'), text('pages.product.returns', 'Assurance: returns'), text('pages.product.askLabel', 'WhatsApp question link'),
      text('pages.product.relatedKicker', 'Related: small heading'), text('pages.product.relatedTitle', 'Related: heading'),
      text('pages.product.notFoundTitle', 'Not found: heading'), area('pages.product.notFoundText', 'Not found: text', { rows: 2 })
    ] },
    { id: 'pageCart', title: 'Cart page', fields: [
      text('pages.cart.title', 'Heading'), text('pages.cart.summaryTitle', 'Summary heading'), text('pages.cart.checkoutButton', 'Checkout button'),
      text('pages.cart.freeShippingNote', 'Note when shipping is free'),
      text('pages.cart.emptyTitle', 'Empty cart: heading'), area('pages.cart.emptyText', 'Empty cart: text', { rows: 2 }), text('pages.cart.emptyButton', 'Empty cart: button')
    ] },
    { id: 'pageCheckout', title: 'Checkout page', fields: [
      text('pages.checkout.title', 'Heading'), text('pages.checkout.contactHeading', 'Step 1 heading'), text('pages.checkout.addressHeading', 'Step 2 heading'),
      text('pages.checkout.paymentHeading', 'Step 3 heading'), text('pages.checkout.summaryTitle', 'Summary heading'),
      text('pages.checkout.onlineTitle', 'Online payment: title'), area('pages.checkout.onlineText', 'Online payment: text (Razorpay on)', { rows: 2 }),
      area('pages.checkout.onlineTextNoGateway', 'Online payment: text (Razorpay off)', { rows: 2 }),
      text('pages.checkout.codTitle', 'Cash on delivery: title'), area('pages.checkout.codText', 'Cash on delivery: text', { rows: 2 }),
      text('pages.checkout.whatsappTitle', 'WhatsApp: title'), area('pages.checkout.whatsappText', 'WhatsApp: text', { rows: 2 })
    ] },
    { id: 'pageOrder', title: 'Order confirmation page', fields: [
      { type: 'note', text: 'You can also use {name} (first name), {email}, {phone} and {total} here.' },
      text('pages.order.thanks', 'Small heading'),
      text('pages.order.placedTitle', 'Heading: order placed'), text('pages.order.reservedTitle', 'Heading: awaiting online payment'), text('pages.order.cancelledTitle', 'Heading: cancelled'),
      area('pages.order.paidText', 'Text: paid online', { rows: 2 }), area('pages.order.codText', 'Text: cash on delivery', { rows: 2 }),
      area('pages.order.whatsappText', 'Text: WhatsApp order', { rows: 2 }), area('pages.order.payNowText', 'Text: payment not finished', { rows: 2 }),
      area('pages.order.payLinkText', 'Text: payment link will be sent', { rows: 2 }), area('pages.order.cancelledText', 'Text: cancelled', { rows: 2 }),
      text('pages.order.notFoundTitle', 'Not found: heading'), area('pages.order.notFoundText', 'Not found: text', { rows: 2 })
    ] },
    { id: 'page404', title: 'Page-not-found (404) page', fields: [
      text('pages.notFound.kicker', 'Small heading'), text('pages.notFound.title', 'Heading'), area('pages.notFound.text', 'Text', { rows: 2 }),
      text('pages.notFound.primaryLabel', 'Shop button'), text('pages.notFound.secondaryLabel', 'Home button')
    ] },
    { id: 'seo', title: 'Search engines (SEO)', fields: [
      text('seo.title', 'Page title (browser tab & Google)'), area('seo.description', 'Description (shown under the title in Google)')
    ] },
    { id: 'history', title: 'Version history', fields: [{ type: 'history' }] }
  ];

  const SECTION_NAMES = { trust: 'Trust badges', categories: 'Shop by category', featured: 'Featured products', authenticity: 'Authenticity', faq: 'FAQ' };

  // ---------- Field rendering ----------
  function fieldHtml(f, path = f.path) {
    const v = path ? get(draft, path) : undefined; // presets/contrast/sections/history have no single value
    const id = path ? `f-${path.replace(/\./g, '-')}` : '';
    const hint = f.hint ? `<small class="ed-hint">${esc(f.hint)}</small>` : '';
    switch (f.type) {
      case 'text':
        return `<div class="field ed-field"><label for="${id}">${esc(f.label)}</label><input class="input" id="${id}" data-path="${path}" value="${esc(v)}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>${hint}<span class="field__error"></span></div>`;
      case 'textarea':
        return `<div class="field ed-field"><label for="${id}">${esc(f.label)}</label><textarea class="textarea" id="${id}" data-path="${path}" rows="${f.rows || 3}">${esc(v)}</textarea>${hint}<span class="field__error"></span></div>`;
      case 'color':
        return `<div class="ed-color"><input type="color" id="${id}" data-path="${path}" value="${esc(v)}" aria-label="${esc(f.label)}"><div><label for="${id}-hex">${esc(f.label)}</label>${hint}</div><input class="input ed-hex" id="${id}-hex" data-path="${path}" data-kind="hex" value="${esc(v)}" maxlength="7" spellcheck="false"><span class="field__error"></span></div>`;
      case 'select': {
        const opts = typeof f.options === 'function' ? f.options() : f.options;
        return `<div class="field ed-field"><label for="${id}">${esc(f.label)}</label><select class="select" id="${id}" data-path="${path}">${opts.map((o) => `<option${o === v ? ' selected' : ''}${f.path && f.path.startsWith('theme.fonts') ? ` style="font-family:'${esc(o)}'"` : ''}>${esc(o)}</option>`).join('')}</select><span class="field__error"></span></div>`;
      }
      case 'range':
        return `<div class="field ed-field"><label for="${id}">${esc(f.label)} <output id="${id}-out">${v}${f.unit}</output></label><input type="range" id="${id}" data-path="${path}" data-kind="number" data-unit="${f.unit}" min="${f.min}" max="${f.max}" value="${v}"></div>`;
      case 'toggle':
        return `<label class="check ed-toggle"><input type="checkbox" data-path="${path}" data-kind="bool"${v ? ' checked' : ''}> ${esc(f.label)}</label>`;
      case 'image':
        return `<div class="field ed-field ed-image"><span class="label">${esc(f.label)}</span>
          <div class="ed-image__row"><img class="ed-image__thumb" src="${esc(v)}" alt="" data-thumb="${path}"><div class="ed-image__actions">
            <label class="button button--outline ed-small">Upload image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-upload="${path}" hidden></label>
            <input class="input" id="${id}" data-path="${path}" value="${esc(v)}" aria-label="${esc(f.label)} URL"></div></div>${hint}<span class="field__error"></span></div>`;
      case 'presets':
        return `<div class="ed-presets">${PRESETS.map((p, i) => {
          const c = p.colors || defaults.theme.colors;
          return `<button type="button" class="ed-preset" data-preset="${i}"><span class="ed-swatches">${['paper', 'walnut', 'bronze', 'gold', 'dark'].map((k) => `<i style="background:${c[k]}"></i>`).join('')}</span>${esc(p.name)}</button>`;
        }).join('')}</div>`;
      case 'contrast':
        return `<div class="ed-contrast" id="contrastReport">${contrastHtml()}</div>`;
      case 'sections':
        return `<ol class="ed-sections">${draft.sections.map((s, i) => `<li>
          <label class="check"><input type="checkbox" data-section-toggle="${i}"${s.enabled ? ' checked' : ''}> ${esc(SECTION_NAMES[s.id])}</label>
          <span class="ed-order"><button type="button" class="ed-icon" data-section-move="${i}" data-dir="-1" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ed-icon" data-section-move="${i}" data-dir="1" aria-label="Move down"${i === draft.sections.length - 1 ? ' disabled' : ''}>↓</button></span>
        </li>`).join('')}</ol><small class="ed-hint">The hero banner always comes first.</small>`;
      case 'list': {
        const items = get(draft, f.path);
        return `<div class="ed-list">${items.map((it, i) => `<div class="ed-item">
            <div class="ed-item__head"><strong>${esc(f.itemLabel(it, i) || `Item ${i + 1}`)}</strong><span class="ed-order">
              <button type="button" class="ed-icon" data-list-move="${f.path}" data-index="${i}" data-dir="-1" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
              <button type="button" class="ed-icon" data-list-move="${f.path}" data-index="${i}" data-dir="1" aria-label="Move down"${i === items.length - 1 ? ' disabled' : ''}>↓</button>
              <button type="button" class="ed-icon ed-icon--danger" data-list-remove="${f.path}" data-index="${i}" aria-label="Remove"${items.length <= f.min ? ' disabled' : ''}>×</button></span></div>
            ${f.item.map((sub) => fieldHtml(sub, `${f.path}.${i}.${sub.key}`)).join('')}
          </div>`).join('')}
          ${items.length < f.max ? `<button type="button" class="button button--outline ed-small" data-list-add="${f.path}">+ ${esc(f.addLabel)}</button>` : `<small class="ed-hint">Maximum of ${f.max} reached.</small>`}</div>`;
      }
      case 'note':
        return `<p class="ed-hint ed-note">${esc(f.text)}</p>`;
      case 'history':
        return `<div class="ed-history">${history.length ? `<ul>${history.map((h) => `<li><span>${esc(new Date(h.savedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}<br><small class="muted">${esc(h.label)}</small></span><button type="button" class="text-link" data-restore="${esc(h.id)}">Restore</button></li>`).join('')}</ul>` : '<p class="muted">No earlier versions yet. Each time you publish, the previous version is kept here (up to 15).</p>'}
          <button type="button" class="text-link ed-reset" id="resetSite">Reset everything to the original design</button></div>`;
      default: return '';
    }
  }

  // List items render with their own field defs; patch them so fieldHtml gets type + label.
  function renderPanel() {
    const panel = $('#edPanel');
    const scroll = panel.scrollTop;
    panel.innerHTML = GROUPS().map((g) => `<details class="ed-group" data-group="${g.id}"${openGroups.has(g.id) ? ' open' : ''}>
        <summary>${esc(g.title)}</summary>
        <div class="ed-body">${g.fields.map((f) => fieldHtml(f)).join('')}</div>
      </details>`).join('');
    panel.scrollTop = scroll;
    updateStatus();
  }

  // ---------- Contrast check (WCAG) ----------
  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  function contrastHtml() {
    const c = draft.theme.colors;
    const checks = [
      ['Main text on background', c.ink, c.paper, 4.5],
      ['Secondary text on background', c.muted, c.paper, 4.5],
      ['Button text on primary', c.onPrimary, c.walnut, 4.5],
      ['Accent on background', c.bronze, c.paper, 4.5],
      ['Light text on hero/footer', c.paper, c.dark, 4.5]
    ].map(([label, fg, bg, min]) => ({ label, r: ratio(fg, bg), min }));
    const bad = checks.filter((x) => x.r < x.min);
    return bad.length
      ? `<strong>⚠ Hard to read</strong><ul>${bad.map((x) => `<li>${esc(x.label)}: ${x.r.toFixed(1)}:1 (needs ${x.min}:1)</li>`).join('')}</ul>`
      : '<span class="ed-ok">✓ All text colours are easy to read.</span>';
  }

  // ---------- State ----------
  const isDirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
  function updateStatus() {
    const dirty = isDirty();
    $('#edStatus').textContent = dirty ? 'Unpublished changes' : 'All changes published';
    $('#edStatus').classList.toggle('is-dirty', dirty);
    $('#edPublish').disabled = !dirty;
    $('#edDiscard').disabled = !dirty;
  }

  let previewTimer;
  function pushPreview(now) {
    clearTimeout(previewTimer);
    const send = () => {
      const frame = $('#edPreview');
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'adr-site-preview', site: draft }, location.origin);
    };
    now ? send() : (previewTimer = setTimeout(send, 90));
  }

  function changed({ rerender = false } = {}) {
    if (rerender) renderPanel(); else updateStatus();
    const report = $('#contrastReport');
    if (report) report.innerHTML = contrastHtml();
    pushPreview();
  }

  function clearErrors() {
    $$('#edPanel .has-error').forEach((el) => el.classList.remove('has-error'));
    $$('#edPanel .field__error').forEach((el) => { el.textContent = ''; });
  }

  function showFieldError(path, message) {
    const input = $(`#edPanel [data-path="${CSS.escape(path)}"]`);
    if (!input) { toast(message); return; }
    const group = input.closest('details');
    if (group) { group.open = true; openGroups.add(group.dataset.group); }
    const field = input.closest('.field, .ed-color');
    if (field) { field.classList.add('has-error'); const e = $('.field__error', field); if (e) e.textContent = message; }
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input.focus({ preventScroll: true });
  }

  // ---------- Actions ----------
  async function publish() {
    clearErrors();
    $('#edPublish').disabled = true;
    $('#edPublish').textContent = 'Publishing…';
    try {
      const r = await api('/site', { method: 'PUT', body: draft });
      saved = clone(r.site); draft = clone(r.site); history = r.history;
      renderPanel();
      pushPreview(true);
      toast('Published — your website is updated.');
    } catch (err) {
      if (err.field) showFieldError(err.field, err.message); else toast(err.message);
      updateStatus();
    } finally { $('#edPublish').textContent = 'Publish'; }
  }

  function discard() {
    if (!confirm('Discard all unpublished changes?')) return;
    draft = clone(saved); clearErrors(); renderPanel(); pushPreview(true);
  }

  async function restore(id) {
    if (!confirm(isDirty() ? 'Restore this version? Your unpublished changes will be lost. The current live version is kept in the history.' : 'Restore this version? The current live version is kept in the history.')) return;
    try {
      const r = await api('/site/restore', { method: 'POST', body: { id } });
      saved = clone(r.site); draft = clone(r.site); history = r.history;
      renderPanel(); pushPreview(true); toast('Version restored and published.');
    } catch (err) { toast(err.message); }
  }

  async function resetAll() {
    if (!confirm('Reset the whole website to the original Adirudra design and text? The current version is kept in the history so you can undo this.')) return;
    try {
      const r = await api('/site/reset', { method: 'POST' });
      saved = clone(r.site); draft = clone(r.site); history = r.history;
      renderPanel(); pushPreview(true); toast('Website reset to the original design.');
    } catch (err) { toast(err.message); }
  }

  async function upload(path, file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showFieldError(path, 'That image is larger than 5 MB.'); return; }
    toast('Uploading…');
    try {
      const r = await api('/uploads', { method: 'POST', raw: file, type: file.type || 'application/octet-stream' });
      set(draft, path, r.url);
      $$(`#edPanel [data-path="${CSS.escape(path)}"]`).forEach((el) => { el.value = r.url; });
      const thumb = $(`#edPanel [data-thumb="${CSS.escape(path)}"]`); if (thumb) thumb.src = r.url;
      changed();
      toast('Image uploaded. Publish to make it live.');
    } catch (err) { showFieldError(path, err.message); }
  }

  // ---------- Events ----------
  function onInput(e) {
    const el = e.target;
    const path = el.dataset.path;
    if (!path) return;
    let value = el.value;
    if (el.dataset.kind === 'bool') value = el.checked;
    if (el.dataset.kind === 'number') {
      value = Number(el.value);
      const out = $(`#${el.id}-out`); if (out) out.textContent = `${value}${el.dataset.unit || ''}`;
    }
    if (el.type === 'color' || el.dataset.kind === 'hex') {
      if (el.dataset.kind === 'hex') {
        if (!/^#[0-9a-f]{6}$/i.test(value)) { el.closest('.ed-color').classList.add('has-error'); return; }
        value = value.toLowerCase();
      }
      el.closest('.ed-color').classList.remove('has-error');
      $$(`#edPanel [data-path="${CSS.escape(path)}"]`).forEach((other) => { if (other !== el) other.value = value; });
    }
    if (el.dataset.thumb === undefined) {
      const thumb = $(`#edPanel [data-thumb="${CSS.escape(path)}"]`); if (thumb) thumb.src = value;
    }
    const field = el.closest('.has-error'); if (field && el.dataset.kind !== 'hex') { field.classList.remove('has-error'); const er = $('.field__error', field); if (er) er.textContent = ''; }
    set(draft, path, value);
    // List item titles shown in the header follow edits on blur (avoid re-rendering while typing).
    changed();
  }

  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.preset !== undefined) {
      const p = PRESETS[Number(t.dataset.preset)];
      draft.theme.colors = clone(p.colors || defaults.theme.colors);
      changed({ rerender: true });
    } else if (t.dataset.sectionMove !== undefined) {
      const i = Number(t.dataset.sectionMove); const j = i + Number(t.dataset.dir);
      [draft.sections[i], draft.sections[j]] = [draft.sections[j], draft.sections[i]];
      changed({ rerender: true });
    } else if (t.dataset.listAdd) {
      const f = GROUPS().flatMap((g) => g.fields).find((x) => x.path === t.dataset.listAdd);
      get(draft, f.path).push(clone(f.newItem));
      changed({ rerender: true });
    } else if (t.dataset.listMove) {
      const list = get(draft, t.dataset.listMove); const i = Number(t.dataset.index); const j = i + Number(t.dataset.dir);
      [list[i], list[j]] = [list[j], list[i]];
      changed({ rerender: true });
    } else if (t.dataset.listRemove) {
      get(draft, t.dataset.listRemove).splice(Number(t.dataset.index), 1);
      changed({ rerender: true });
    } else if (t.dataset.restore) restore(t.dataset.restore);
    else if (t.id === 'resetSite') resetAll();
  }

  // Point the "Product page" preview at a product that is actually in the store.
  async function pickPreviewProduct() {
    try {
      const list = await fetch('/api/products').then((r) => r.json());
      const opt = $('#edPage option[data-product]');
      if (opt && list.length) opt.value = `/product.html?id=${encodeURIComponent(list[0].id)}&preview=1`;
    } catch { /* keep the default */ }
  }

  function setPreviewPage(url) {
    $('#edPreview').src = url;
  }

  async function init() {
    if (initialised) return;
    initialised = true;
    const panel = $('#edPanel');
    panel.innerHTML = '<p class="muted" style="padding:20px">Loading…</p>';
    try {
      const r = await api('/site');
      saved = clone(r.site); draft = clone(r.site); defaults = r.defaults; history = r.history; options = r.options;
    } catch (err) {
      const msg = err.status === 404
        ? '<strong>The website editor is not running on the server yet.</strong><br>Restart the server so it loads the latest code: in the terminal running it, press <kbd>Ctrl</kbd>+<kbd>C</kbd>, run <code>npm start</code>, then reload this page.'
        : esc(err.message);
      panel.innerHTML = `<p class="ed-contrast" style="margin:20px">${msg}</p>`;
      initialised = false;
      return;
    }
    renderPanel();

    panel.addEventListener('input', onInput);
    panel.addEventListener('change', (e) => {
      if (e.target.dataset.upload) { upload(e.target.dataset.upload, e.target.files[0]); e.target.value = ''; return; }
      if (e.target.dataset.sectionToggle !== undefined) { draft.sections[Number(e.target.dataset.sectionToggle)].enabled = e.target.checked; changed(); return; }
      // Selects and checkboxes fire change, not always input.
      if (e.target.matches('select, input[type=checkbox]')) onInput(e);
      // Keep a list item's heading in sync with its title (updated in place so focus isn't lost).
      const m = /^(.+)\.(\d+)\.(title|q)$/.exec(e.target.dataset.path || '');
      if (m) {
        const head = e.target.closest('.ed-item') && $('.ed-item__head strong', e.target.closest('.ed-item'));
        if (head) head.textContent = m[1] === 'authenticity.steps' ? `${String(Number(m[2]) + 1).padStart(2, '0')} · ${e.target.value}` : e.target.value;
      }
    });
    panel.addEventListener('click', onClick);
    panel.addEventListener('toggle', (e) => {
      const d = e.target; if (!d.dataset || !d.dataset.group) return;
      d.open ? openGroups.add(d.dataset.group) : openGroups.delete(d.dataset.group);
    }, true);

    $('#edPublish').addEventListener('click', publish);
    $('#edDiscard').addEventListener('click', discard);
    $('#edPage').addEventListener('change', (e) => setPreviewPage(e.target.value));
    $$('[data-device]').forEach((b) => b.addEventListener('click', () => {
      $$('[data-device]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#edFrameWrap').dataset.device = b.dataset.device;
    }));
    $('#edOpen').addEventListener('click', () => window.open($('#edPage').value.replace(/[?&]preview=1/, ''), '_blank', 'noopener'));

    // The preview page asks for the draft once it has loaded (also after navigating inside it).
    window.addEventListener('message', (e) => {
      if (e.origin === location.origin && e.data && e.data.type === 'adr-preview-ready') pushPreview(true);
    });
    window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
    await pickPreviewProduct();
    setPreviewPage($('#edPage').value);
  }

  window.AdminSite = { open: init, isDirty: () => Boolean(draft) && isDirty() };
})();
