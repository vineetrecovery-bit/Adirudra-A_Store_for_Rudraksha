// Checkout: validation, order creation via the API, Razorpay payment.
(function () {
  'use strict';
  const { Cart, MyOrders, api, quote, money, esc, $, $$, visual, whatsappLink, getCoupon } = Store;

  const MESSAGES = {
    name: 'Please enter your full name.',
    phone: 'Enter a valid 10-digit Indian mobile number.',
    email: 'Enter a valid email address.',
    address: 'Please enter your delivery address.',
    city: 'Please enter your city.',
    state: 'Please select your state.',
    pincode: 'Enter a valid 6-digit PIN code.'
  };

  const payment = () => ($('input[name=payment]:checked') || {}).value || 'upi';
  // In the admin's live preview, show the form even with an empty cart so its text can be edited.
  const isPreview = document.documentElement.classList.contains('is-preview');
  let submitting = false;

  async function renderSummary() {
    let t;
    try { t = await quote({ payment: payment() }); } catch (err) { $('#sumRows').innerHTML = `<p class="field__error">${esc(err.message)}</p>`; return; }
    if (!t.lines.length) { if (!isPreview) showEmpty(); return; }
    $('#miniItems').innerHTML = t.lines.map((l) => `
      <div class="mini-item">
        <div class="mini-item__thumb">${visual(l.product, true)}<span class="mini-item__qty">${l.qty}</span></div>
        <span>${esc(l.name)}</span>
        <strong>${money(l.total)}</strong>
      </div>`).join('');
    $('#sumRows').innerHTML = `
      ${t.issues.length ? `<p class="field__error" style="margin-bottom:10px">${t.issues.map((i) => esc(`${(Store.byId(i.id) || { name: 'An item' }).name}: ${i.message}`)).join('<br>')} — <a href="cart.html">update cart</a></p>` : ''}
      <div class="summary-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${t.discount ? `<div class="summary-row"><span>Discount (${esc(t.coupon)})</span><span class="discount">−${money(t.discount)}</span></div>` : ''}
      <div class="summary-row"><span>Shipping</span><span>${t.shipping ? money(t.shipping) : 'Free'}</span></div>
      ${t.codFee ? `<div class="summary-row"><span>COD fee</span><span>${money(t.codFee)}</span></div>` : ''}
      <div class="summary-row summary-row--total"><span>Total</span><span>${money(t.total)}</span></div>`;
    if (!submitting) $('#placeBtn').textContent = buttonLabel(t.total);
  }

  function buttonLabel(total) {
    const m = payment();
    if (m === 'whatsapp') return 'Send order on WhatsApp';
    if (m === 'upi' && Store.CONFIG.razorpay) return `Pay ${money(total)}`;
    return `Place order · ${money(total)}`;
  }

  function showEmpty() { $('#checkoutForm').hidden = true; $('#emptyCheckout').hidden = false; }

  function setFieldError(input, message) {
    const field = input.closest('.field'); if (!field) return;
    field.classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    $('.field__error', field).textContent = message || '';
  }

  function validateField(input) {
    if (input.name === 'phone') input.value = input.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (input.name === 'pincode') input.value = input.value.replace(/\D/g, '');
    const ok = input.value.trim() !== '' ? input.checkValidity() : !input.required;
    setFieldError(input, ok ? '' : (MESSAGES[input.name] || 'This field is required.'));
    return ok;
  }

  function whatsappText(order, customer, items) {
    const lines = items.map((l) => `• ${l.name} (${l.id}) × ${l.qty} — ${money(l.total)}`).join('\n');
    return `Namaste Adirudra, I've placed order ${order.id}:\n\n${lines}\n\nTotal: ${money(order.total)}\n\nName: ${customer.name}\nPhone: ${customer.phone}\nAddress: ${customer.address}, ${customer.city}, ${customer.state} ${customer.pincode}`;
  }

  function setBusy(busy, label) {
    submitting = busy;
    const btn = $('#placeBtn');
    btn.disabled = busy;
    if (label) btn.textContent = label;
  }

  Store.onReady(() => {
    if (!Cart.items().length && !isPreview) { showEmpty(); return; }

    $('#state').insertAdjacentHTML('beforeend', Store.CONFIG.states.map((s) => `<option>${esc(s)}</option>`).join(''));
    $('#upiDesc').dataset.site = Store.CONFIG.razorpay ? 'pages.checkout.onlineText' : 'pages.checkout.onlineTextNoGateway';
    if (window.Site) Site.apply($('#checkoutForm'));
    renderSummary();

    const form = $('#checkoutForm');
    form.addEventListener('change', (e) => { if (e.target.name === 'payment') renderSummary(); });
    $$('.field .input, .field .select', form).forEach((el) => {
      el.addEventListener('blur', () => validateField(el));
      ['input', 'change'].forEach((ev) => el.addEventListener(ev, () => { if (el.closest('.field').classList.contains('has-error')) validateField(el); }));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitting) return;
      const inputs = $$('.field .input[required], .field .select[required]', form);
      const results = inputs.map(validateField);
      if (results.includes(false)) { inputs[results.indexOf(false)].focus(); return; }

      const method = payment();
      const customer = Object.fromEntries(new FormData(form));
      delete customer.payment;
      // Open the WhatsApp tab during the click so pop-up blockers allow it; filled in after the order exists.
      const waTab = method === 'whatsapp' ? window.open('about:blank', '_blank') : null;

      setBusy(true, 'Placing order…');
      let order;
      try {
        const q = await quote({ payment: method });
        order = await api('/orders', { method: 'POST', body: { items: Cart.items(), coupon: getCoupon(), payment: method, customer } });
        MyOrders.add(order.id, order.token);
        Cart.clear();
        const goToOrder = () => { location.href = `order.html?id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.token)}`; };

        if (waTab) { waTab.location.href = whatsappLink(whatsappText(order, customer, q.lines)); }
        if (order.razorpay) {
          setBusy(true, 'Waiting for payment…');
          await Store.payWithRazorpay({ orderId: order.id, token: order.token, razorpay: order.razorpay, customer });
        }
        goToOrder();
      } catch (err) {
        if (waTab) waTab.close();
        if (order) {
          // Order exists but payment verification failed: show the order page, which explains next steps.
          location.href = `order.html?id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.token)}`;
          return;
        }
        setBusy(false);
        renderSummary();
        const fields = err.body && err.body.fields;
        if (fields) {
          Object.entries(fields).forEach(([name, msg]) => { const el = form.elements[name]; if (el) setFieldError(el, msg); });
          const first = Object.keys(fields).map((n) => form.elements[n]).find(Boolean);
          if (first) first.focus();
        }
        Store.toast(err.message, false);
      }
    });
  });
})();
