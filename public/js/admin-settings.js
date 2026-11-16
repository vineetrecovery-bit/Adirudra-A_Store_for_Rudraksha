// Admin > Settings: shipping and COD fees, contact details, order limits and coupon codes.
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const FIELDS = ['freeShippingOver', 'shippingFee', 'codFee', 'maxQtyPerItem', 'whatsappNumber', 'email'];
  let saved = null;     // last saved settings (JSON string, for change detection)
  let coupons = [];
  let wired = false;

  async function api(method, body) {
    const res = await fetch('/api/admin/settings', {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
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

  // ---------- Read / write the form ----------
  function collect() {
    const form = $('#settingsForm');
    const out = {};
    FIELDS.forEach((k) => { out[k] = form.elements[k].value.trim(); });
    ['freeShippingOver', 'shippingFee', 'codFee', 'maxQtyPerItem'].forEach((k) => { if (out[k] !== '') out[k] = Number(out[k]); });
    out.coupons = coupons.map((c) => ({ ...c, code: c.code.trim().toUpperCase(), value: c.value === '' ? '' : Number(c.value), min: c.min === '' ? 0 : Number(c.min) }));
    return out;
  }

  function fill(s) {
    const form = $('#settingsForm');
    FIELDS.forEach((k) => { form.elements[k].value = s[k] ?? ''; });
    coupons = s.coupons.map((c) => ({ ...c }));
    renderCoupons();
    saved = JSON.stringify(collect());
    updateStatus();
  }

  function renderCoupons() {
    $('#couponsTable').innerHTML = `<thead><tr><th>Code</th><th>Discount</th><th class="num">Amount</th><th class="num">Min. order (₹)</th><th>Description shown to customer</th><th>Active</th><th></th></tr></thead>
      <tbody>${coupons.length ? coupons.map((c, i) => `<tr data-i="${i}">
        <td data-f="code"><input class="input c-code" data-k="code" value="${esc(c.code)}" maxlength="20" aria-label="Coupon code" spellcheck="false"><span class="field__error"></span></td>
        <td data-f="type"><select class="select" data-k="type" aria-label="Discount type"><option value="percent"${c.type === 'percent' ? ' selected' : ''}>% off</option><option value="flat"${c.type === 'flat' ? ' selected' : ''}>₹ off</option></select><span class="field__error"></span></td>
        <td class="num" data-f="value"><input class="input" type="number" min="1" step="1" data-k="value" value="${esc(c.value)}" aria-label="Discount amount"><span class="field__error"></span></td>
        <td class="num" data-f="min"><input class="input" type="number" min="0" step="1" data-k="min" value="${esc(c.min || '')}" placeholder="None" aria-label="Minimum order"><span class="field__error"></span></td>
        <td data-f="label"><input class="input c-label" data-k="label" value="${esc(c.label)}" maxlength="80" aria-label="Description"><span class="field__error"></span></td>
        <td><input type="checkbox" data-k="active"${c.active !== false ? ' checked' : ''} aria-label="Active"></td>
        <td><button class="row-link" type="button" data-remove="${i}" style="color:var(--danger)">Remove</button></td>
      </tr>`).join('') : '<tr><td class="empty" colspan="7">No coupon codes. Add one to offer a discount.</td></tr>'}</tbody>`;
  }

  const isDirty = () => saved !== null && JSON.stringify(collect()) !== saved;
  function updateStatus() {
    const dirty = isDirty();
    $('#setStatus').textContent = dirty ? 'Unsaved changes' : saved ? 'All changes saved' : '';
    $('#setStatus').classList.toggle('is-dirty', dirty);
    $('#setSave').disabled = !dirty;
  }

  function clearErrors() {
    $('#settingsError').textContent = '';
    $$('#settingsView .has-error').forEach((el) => el.classList.remove('has-error'));
    $$('#settingsView .field__error').forEach((el) => { if (el.id !== 'settingsError') el.textContent = ''; });
  }

  function showError(field, message) {
    $('#settingsError').textContent = message;
    if (!field) return;
    let box;
    const m = /^coupons\.(\d+)\.(\w+)$/.exec(field);
    if (m) box = $(`#couponsTable tr[data-i="${m[1]}"] td[data-f="${m[2]}"]`);
    else { const el = $('#settingsForm').elements[field]; box = el && el.closest('.field'); }
    if (!box) return;
    box.classList.add('has-error');
    const err = $('.field__error', box); if (err) err.textContent = message;
    const input = $('input, select', box);
    if (input) { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); input.focus({ preventScroll: true }); }
  }

  // ---------- Actions ----------
  async function save(e) {
    e.preventDefault();
    clearErrors();
    $('#setSave').disabled = true;
    $('#setSave').textContent = 'Saving…';
    try {
      fill(await api('PUT', collect()));
      toast('Settings saved. They apply to new orders straight away.');
    } catch (err) {
      showError(err.field, err.message);
      updateStatus();
    } finally { $('#setSave').textContent = 'Save settings'; }
  }

  function wire() {
    const form = $('#settingsForm');
    form.addEventListener('submit', save);
    form.addEventListener('input', (e) => {
      const row = e.target.closest('tr[data-i]');
      if (row && e.target.dataset.k) {
        const c = coupons[Number(row.dataset.i)];
        c[e.target.dataset.k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      }
      const box = e.target.closest('.has-error');
      if (box) { box.classList.remove('has-error'); const er = $('.field__error', box); if (er) er.textContent = ''; }
      updateStatus();
    });
    $('#addCoupon').addEventListener('click', () => {
      coupons.push({ code: '', type: 'percent', value: 10, min: 0, label: '', active: true });
      renderCoupons(); updateStatus();
      const inputs = $$('#couponsTable .c-code'); inputs[inputs.length - 1].focus();
    });
    $('#couponsTable').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]'); if (!b) return;
      const c = coupons[Number(b.dataset.remove)];
      if (c.code && !confirm(`Remove coupon ${c.code.toUpperCase()}? Customers will no longer be able to use it.`)) return;
      coupons.splice(Number(b.dataset.remove), 1);
      clearErrors(); renderCoupons(); updateStatus();
    });
    window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  }

  async function open() {
    if (!wired) { wire(); wired = true; }
    if (isDirty()) return; // keep unsaved edits when switching tabs
    clearErrors();
    try { fill(await api('GET')); }
    catch (err) {
      $('#settingsError').textContent = err.status === 404
        ? 'Settings are not available on the server yet. Restart the server (Ctrl+C, then npm start) and reload this page.'
        : err.message;
    }
  }

  window.AdminSettings = { open, isDirty };
})();
