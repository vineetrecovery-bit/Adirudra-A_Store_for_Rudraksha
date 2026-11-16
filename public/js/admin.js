// Admin panel: sign in, manage orders and products.
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const date = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const PAYMENT_STATUSES = ['unpaid', 'paid', 'cod', 'refunded'];
  const PAYMENT_LABEL = { upi: 'Online', cod: 'COD', whatsapp: 'WhatsApp' };
  const cap = (s) => (s === 'cod' ? 'COD' : s.charAt(0).toUpperCase() + s.slice(1));

  let orders = [];
  let products = [];
  let editingId = null;

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/admin${path}`, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Session expired. Please sign in again.'); }
    if (!res.ok) { const e = new Error(data.error || 'Request failed.'); e.fields = data.fields; throw e; }
    return data;
  }

  let toastTimer;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('is-visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2800);
  }

  // ---------- Views ----------
  function showLogin() {
    $('#loginView').hidden = false;
    $('#ordersView').hidden = $('#productsView').hidden = $('#siteView').hidden = $('#settingsView').hidden = $('#tabs').hidden = $('#logoutBtn').hidden = true;
    document.body.classList.remove('is-editing-site');
    $('#password').focus();
  }

  const TABS = ['orders', 'products', 'site', 'settings'];

  async function showApp() {
    $('#loginView').hidden = true;
    $('#tabs').hidden = $('#logoutBtn').hidden = false;
    await Promise.all([loadOrders(), loadProducts()]);
    const fromHash = location.hash.slice(1);
    switchTab(TABS.includes(fromHash) ? fromHash : 'orders');
  }

  function switchTab(tab) {
    $$('#tabs button').forEach((b) => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    TABS.forEach((t) => { $(`#${t}View`).hidden = t !== tab; });
    // The website editor uses the full window width.
    document.body.classList.toggle('is-editing-site', tab === 'site');
    if (tab === 'site' && window.AdminSite) window.AdminSite.open();
    if (tab === 'settings' && window.AdminSettings) window.AdminSettings.open();
    history.replaceState(null, '', `#${tab}`);
  }

  // ---------- Orders ----------
  async function loadOrders() { orders = await api('/orders'); renderOrders(); }

  function paymentPill(o) {
    const cls = o.status === 'cancelled' ? 'cancelled' : o.paymentStatus;
    return `<span class="pill pill--${esc(cls)}">${esc(cap(o.paymentStatus))}</span>`;
  }

  function renderOrders() {
    const live = orders.filter((o) => o.status !== 'cancelled');
    const revenue = live.filter((o) => o.paymentStatus === 'paid' || (o.paymentStatus === 'cod' && o.status === 'delivered')).reduce((s, o) => s + o.total, 0);
    $('#stats').innerHTML = [
      ['Orders', orders.length],
      ['To ship', live.filter((o) => o.status === 'confirmed').length],
      ['Awaiting payment', live.filter((o) => o.paymentStatus === 'unpaid').length],
      ['Revenue collected', money(revenue)]
    ].map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join('');

    const q = $('#orderSearch').value.trim().toLowerCase();
    const st = $('#statusFilter').value;
    const list = orders.filter((o) => (!st || o.status === st) && (!q || [o.id, o.customer.name, o.customer.phone, o.customer.email, o.customer.city].join(' ').toLowerCase().includes(q)));

    $('#ordersTable').innerHTML = `<thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Method</th><th>Payment</th><th>Status</th></tr></thead>
      <tbody>${list.length ? list.map((o) => `<tr>
        <td><button class="row-link" type="button" data-order="${esc(o.id)}">${esc(o.id)}</button></td>
        <td>${esc(date(o.createdAt))}</td>
        <td>${esc(o.customer.name)}<br><span class="muted">${esc(o.customer.city)}</span></td>
        <td>${o.items.reduce((s, i) => s + i.qty, 0)}</td>
        <td class="num">${money(o.total)}</td>
        <td>${esc(PAYMENT_LABEL[o.payment] || o.payment)}</td>
        <td>${paymentPill(o)}</td>
        <td><select class="select" data-status="${esc(o.id)}" aria-label="Status for ${esc(o.id)}"${o.status === 'cancelled' ? ' disabled' : ''}>${STATUSES.map((s) => `<option value="${s}"${s === o.status ? ' selected' : ''}>${cap(s)}</option>`).join('')}</select></td>
      </tr>`).join('') : `<tr><td class="empty" colspan="8">${orders.length ? 'No orders match.' : 'No orders yet. They will appear here as customers check out.'}</td></tr>`}</tbody>`;
  }

  async function updateOrder(id, changes) {
    const current = orders.find((o) => o.id === id);
    if (changes.status === 'cancelled' && current?.status !== 'cancelled' && !confirm(`Cancel order ${id}? Its items will be returned to stock. This can't be undone.`)) { renderOrders(); return null; }
    try {
      const updated = await api(`/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes });
      orders = orders.map((o) => (o.id === id ? updated : o));
      renderOrders();
      if (changes.status === 'cancelled') loadProducts();
      toast(`Order ${id} updated`);
      return updated;
    } catch (err) { toast(err.message); renderOrders(); return null; }
  }

  function openOrder(id) {
    const o = orders.find((x) => x.id === id); if (!o) return;
    const c = o.customer;
    const dlg = $('#orderDialog');
    dlg.innerHTML = `<div class="dialog-body">
      <div class="dialog-head"><h2 id="orderDialogTitle">${esc(o.id)}</h2><button class="icon-close" type="button" data-close aria-label="Close">×</button></div>
      <div class="detail-grid">
        <div><h3>Customer</h3>${esc(c.name)}<br><a href="tel:+91${esc(c.phone)}">+91 ${esc(c.phone)}</a><br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a><br><a class="text-link" href="https://wa.me/91${esc(c.phone)}" target="_blank" rel="noopener">WhatsApp customer</a></div>
        <div><h3>Ship to</h3>${esc(c.address)}<br>${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}${c.notes ? `<br><br><strong>Note:</strong> ${esc(c.notes)}` : ''}</div>
      </div>
      ${o.items.map((i) => `<div class="summary-row"><span>${esc(i.name)} <span class="muted">(${esc(i.id)})</span> × ${i.qty}</span><span>${money(i.total)}</span></div>`).join('')}
      ${o.discount ? `<div class="summary-row"><span>Discount (${esc(o.coupon)})</span><span class="discount">−${money(o.discount)}</span></div>` : ''}
      <div class="summary-row"><span>Shipping</span><span>${o.shipping ? money(o.shipping) : 'Free'}</span></div>
      ${o.codFee ? `<div class="summary-row"><span>COD fee</span><span>${money(o.codFee)}</span></div>` : ''}
      <div class="summary-row summary-row--total"><span>Total · ${esc(PAYMENT_LABEL[o.payment])}</span><span>${money(o.total)}</span></div>
      ${o.razorpayPaymentId ? `<p class="muted" style="font-size:12px">Razorpay payment: ${esc(o.razorpayPaymentId)}</p>` : ''}
      <form class="update-row" id="orderUpdate">
        <div class="field"><label for="uStatus">Status</label><select class="select" id="uStatus"${o.status === 'cancelled' ? ' disabled' : ''}>${STATUSES.map((s) => `<option value="${s}"${s === o.status ? ' selected' : ''}>${cap(s)}</option>`).join('')}</select></div>
        <div class="field"><label for="uPay">Payment</label><select class="select" id="uPay">${PAYMENT_STATUSES.map((s) => `<option value="${s}"${s === o.paymentStatus ? ' selected' : ''}>${cap(s)}</option>`).join('')}</select></div>
        <div class="field" style="flex:2"><label for="uNote">Note (e.g. tracking number)</label><input class="input" id="uNote" maxlength="300"></div>
        <button class="button button--dark" type="submit">Update</button>
      </form>
      <h3 class="kicker" style="margin-top:24px">History</h3>
      <ul class="history">${[...(o.history || [])].reverse().map((h) => `<li>${esc(date(h.at))} — <strong>${esc(cap(h.status))}</strong> · ${esc(h.note)}</li>`).join('')}</ul>
    </div>`;
    $('#orderUpdate', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const updated = await updateOrder(o.id, { status: $('#uStatus', dlg).value, paymentStatus: $('#uPay', dlg).value, note: $('#uNote', dlg).value });
      if (updated) openOrder(o.id);
    });
    if (!dlg.open) dlg.showModal();
  }

  // ---------- Products ----------
  async function loadProducts() { products = await api('/products'); renderProducts(); }

  function renderProducts() {
    $('#productsTable').innerHTML = `<thead><tr><th>ID</th><th>Product</th><th>Type</th><th class="num">Price (₹)</th><th class="num">Stock</th><th>Featured</th><th>Visible</th><th></th></tr></thead>
      <tbody>${products.map((p) => `<tr class="${p.active === false ? 'dim' : ''}" data-row="${esc(p.id)}">
        <td>${esc(p.id)}</td>
        <td><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.origin)} · ${esc(p.rarity)}</span></td>
        <td>${esc(p.type)}</td>
        <td class="num"><input class="input" type="number" min="1" value="${p.price}" data-field="price" aria-label="Price for ${esc(p.name)}"></td>
        <td class="num"><input class="input" type="number" min="0" value="${p.stock}" data-field="stock" aria-label="Stock for ${esc(p.name)}" style="width:70px${p.stock === 0 ? ';border-color:var(--danger)' : ''}"></td>
        <td><input type="checkbox" data-field="featured"${p.featured ? ' checked' : ''} aria-label="Featured"></td>
        <td><input type="checkbox" data-field="active"${p.active !== false ? ' checked' : ''} aria-label="Visible in store"></td>
        <td><div class="row-actions"><button class="row-link" type="button" data-edit="${esc(p.id)}">Edit</button><button class="row-link" type="button" data-delete="${esc(p.id)}" style="color:var(--danger)">Delete</button></div></td>
      </tr>`).join('')}</tbody>`;
  }

  async function patchProduct(id, changes) {
    try {
      const updated = await api(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes });
      products = products.map((p) => (p.id === id ? updated : p));
      renderProducts();
      toast(`${updated.name} saved`);
    } catch (err) { toast(err.message); renderProducts(); }
  }

  function openProductForm(p) {
    editingId = p ? p.id : null;
    const form = $('#productForm');
    form.reset();
    $$('.field', form).forEach((f) => f.classList.remove('has-error'));
    $$('.field__error', form).forEach((e) => { e.textContent = ''; });
    $('#productDialogTitle').textContent = p ? `Edit ${p.id}` : 'Add product';
    if (p) {
      for (const el of form.elements) {
        if (!el.name || !(el.name in p)) continue;
        if (el.type === 'checkbox') el.checked = p[el.name] !== false && Boolean(p[el.name] ?? true);
        else el.value = Array.isArray(p[el.name]) ? p[el.name].join(', ') : p[el.name];
      }
    }
    $('#productDialog').showModal();
    $('#pName').focus();
  }

  async function saveProduct(e) {
    e.preventDefault();
    const form = $('#productForm');
    const body = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      body[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    $$('.field', form).forEach((f) => f.classList.remove('has-error'));
    $$('.field__error', form).forEach((x) => { x.textContent = ''; });
    $('#productSave').disabled = true;
    try {
      const saved = editingId
        ? await api(`/products/${encodeURIComponent(editingId)}`, { method: 'PATCH', body })
        : await api('/products', { method: 'POST', body });
      products = editingId ? products.map((p) => (p.id === editingId ? saved : p)) : [...products, saved];
      renderProducts();
      $('#productDialog').close();
      toast(`${saved.name} saved`);
    } catch (err) {
      $('#productFormError').textContent = err.message;
      Object.entries(err.fields || {}).forEach(([name, msg]) => {
        const el = form.elements[name]; if (!el) return;
        const f = el.closest('.field'); f.classList.add('has-error'); $('.field__error', f).textContent = msg;
      });
    } finally { $('#productSave').disabled = false; }
  }

  async function deleteProduct(id) {
    const p = products.find((x) => x.id === id);
    if (!confirm(`Delete ${p.name}? If it appears in past orders it will be hidden from the store instead.`)) return;
    try {
      const r = await api(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadProducts();
      toast(r.archived ? `${p.name} hidden (it has past orders)` : `${p.name} deleted`);
    } catch (err) { toast(err.message); }
  }

  // ---------- Wire up ----------
  document.addEventListener('DOMContentLoaded', async () => {
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#loginError').textContent = '';
      try { await api('/login', { method: 'POST', body: { password: $('#password').value } }); $('#password').value = ''; showApp(); }
      catch (err) { $('#loginError').textContent = err.message; }
    });
    $('#logoutBtn').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); showLogin(); });
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });

    $('#orderSearch').addEventListener('input', renderOrders);
    $('#statusFilter').addEventListener('change', renderOrders);
    $('#ordersTable').addEventListener('click', (e) => { const b = e.target.closest('[data-order]'); if (b) openOrder(b.dataset.order); });
    $('#ordersTable').addEventListener('change', (e) => { const s = e.target.closest('[data-status]'); if (s) updateOrder(s.dataset.status, { status: s.value }); });

    $('#addProductBtn').addEventListener('click', () => openProductForm(null));
    $('#productForm').addEventListener('submit', saveProduct);
    $('#pImageFile').addEventListener('change', async (e) => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      toast('Uploading photo…');
      try {
        const res = await fetch('/api/admin/uploads', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed.');
        $('#pImage').value = data.url;
        toast('Photo uploaded. Save the product to use it.');
      } catch (err) { toast(err.message); }
    });
    $('#productsTable').addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) openProductForm(products.find((p) => p.id === ed.dataset.edit));
      const del = e.target.closest('[data-delete]'); if (del) deleteProduct(del.dataset.delete);
    });
    $('#productsTable').addEventListener('change', (e) => {
      const el = e.target.closest('[data-field]'); if (!el) return;
      const id = el.closest('[data-row]').dataset.row;
      patchProduct(id, { [el.dataset.field]: el.type === 'checkbox' ? el.checked : el.value });
    });

    document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) e.target.closest('dialog').close(); });

    try {
      const me = await fetch('/api/admin/me', { credentials: 'same-origin' }).then((r) => r.json());
      if (!me.enabled) { showLogin(); $('#loginError').textContent = 'Admin is disabled. Set ADMIN_PASSWORD in your .env file and restart the server.'; return; }
      me.admin ? showApp() : showLogin();
    } catch { showLogin(); $('#loginError').textContent = 'Could not reach the server.'; }
  });
})();
