// Cart page: quantities, coupon, server-priced totals.
(function () {
  'use strict';
  const { Cart, quote, money, esc, $, visual, getCoupon, setCoupon } = Store;
  let couponMsg = { text: '', ok: true };
  let renderSeq = 0;
  // Editable text from Admin > Website; data-site lets the live preview update it in place.
  const T = (key, vars) => (window.Site ? Site.t(`pages.${key}`, vars) : '');
  const txt = (tag, key, attrs = '') => `<${tag} data-site="pages.${key}"${attrs}>${esc(T(key))}</${tag}>`;

  function summaryHtml(t) {
    const toFree = Store.CONFIG.freeShippingOver - (t.subtotal - t.discount);
    const applied = Boolean(t.coupon);
    return `<aside class="summary" aria-labelledby="sumHeading">
      ${txt('h2', 'cart.summaryTitle', ' id="sumHeading"')}
      <div class="summary-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${t.discount ? `<div class="summary-row"><span>Discount (${esc(t.coupon)})</span><span class="discount">−${money(t.discount)}</span></div>` : ''}
      <div class="summary-row"><span>Shipping</span><span>${t.shipping ? money(t.shipping) : 'Free'}</span></div>
      <div class="summary-row summary-row--total"><span>Total</span><span>${money(t.total)}</span></div>
      <form class="coupon" id="couponForm">
        <input class="input" id="couponInput" placeholder="Coupon code" aria-label="Coupon code" value="${esc(getCoupon())}" autocomplete="off"${applied ? ' readonly' : ''}>
        ${applied ? '<button class="button button--outline" type="button" id="removeCoupon">Remove</button>' : '<button class="button button--outline" type="submit">Apply</button>'}
      </form>
      <p class="coupon-msg ${couponMsg.ok ? 'ok' : 'err'}" aria-live="polite">${esc(couponMsg.text)}</p>
      <p class="ship-note">${toFree > 0 ? `Add ${money(toFree)} more for free shipping.` : txt('span', 'cart.freeShippingNote')}</p>
      <a class="button button--dark button--block" href="checkout.html" data-site="pages.cart.checkoutButton">${esc(T('cart.checkoutButton'))}</a>
      <a class="text-link" href="shop.html">Continue shopping</a>
    </aside>`;
  }

  async function render() {
    const seq = ++renderSeq;
    const root = $('#cartRoot');
    if (!Cart.items().length) {
      root.innerHTML = `<div class="empty-state" style="margin-bottom:100px">${txt('h3', 'cart.emptyTitle')}${txt('p', 'cart.emptyText')}<a class="button button--dark" href="shop.html" data-site="pages.cart.emptyButton">${esc(T('cart.emptyButton'))}</a></div>`;
      return;
    }
    let t;
    try { t = await quote(); } catch (err) {
      root.innerHTML = `<div class="empty-state" style="margin-bottom:100px"><h3>Couldn't load your cart</h3><p>${esc(err.message)}</p><button class="button button--dark" type="button" onclick="location.reload()">Try again</button></div>`;
      return;
    }
    if (seq !== renderSeq) return; // a newer render started

    // Sync the stored cart with what the server allowed (sold-out items, stock limits).
    if (t.issues.length) {
      Cart.save(t.lines.map((l) => ({ id: l.id, qty: l.qty })));
      Store.toast(t.issues.map((i) => `${(Store.byId(i.id) || { name: 'An item' }).name}: ${i.message}`).join(' · '), false);
    }
    if (getCoupon() && t.couponError) couponMsg = { text: t.couponError, ok: false };
    if (!t.lines.length) { render(); return; }

    root.innerHTML = `<div class="cart-layout">
      <div class="cart-list">${t.lines.map((l) => `
        <div class="cart-item">
          <a class="cart-item__thumb" href="product.html?id=${encodeURIComponent(l.id)}" tabindex="-1" aria-hidden="true">${visual(l.product, true)}</a>
          <div>
            <a class="cart-item__name" href="product.html?id=${encodeURIComponent(l.id)}">${esc(l.name)}</a>
            <div class="cart-item__meta">${esc(l.product.type || '')} · ${esc(l.product.size || '')} · ${money(l.price)} each</div>
            <div class="cart-item__controls">
              <div class="qty qty--sm" role="group" aria-label="Quantity for ${esc(l.name)}">
                <button type="button" data-dec="${esc(l.id)}" aria-label="Decrease">−</button>
                <input type="number" min="1" max="${l.maxQty}" value="${l.qty}" data-qty="${esc(l.id)}" aria-label="Quantity">
                <button type="button" data-inc="${esc(l.id)}" aria-label="Increase"${l.qty >= l.maxQty ? ' disabled' : ''}>+</button>
              </div>
              <button class="remove-btn" type="button" data-remove="${esc(l.id)}">Remove</button>
            </div>
          </div>
          <div class="cart-item__total">${money(l.total)}</div>
        </div>`).join('')}
      </div>
      ${summaryHtml(t)}
    </div>`;
  }

  Store.onReady(() => {
    const root = $('#cartRoot');
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.inc) { Cart.setQty(t.dataset.inc, Cart.qtyOf(t.dataset.inc) + 1); render(); }
      else if (t.dataset.dec) { Cart.setQty(t.dataset.dec, Cart.qtyOf(t.dataset.dec) - 1); render(); }
      else if (t.dataset.remove) { Cart.remove(t.dataset.remove); render(); }
      else if (t.id === 'removeCoupon') { setCoupon(''); couponMsg = { text: '', ok: true }; render(); }
    });
    root.addEventListener('change', (e) => {
      const id = e.target.dataset.qty; if (!id) return;
      Cart.setQty(id, Math.max(1, parseInt(e.target.value, 10) || 1)); render();
    });
    root.addEventListener('submit', async (e) => {
      if (e.target.id !== 'couponForm') return;
      e.preventDefault();
      const code = $('#couponInput').value.trim().toUpperCase();
      if (!code) return;
      try {
        const q = await quote({ coupon: code });
        if (q.coupon) { setCoupon(q.coupon); couponMsg = { text: `Applied: ${q.couponLabel}`, ok: true }; }
        else couponMsg = { text: q.couponError, ok: false };
      } catch (err) { couponMsg = { text: err.message, ok: false }; }
      render();
    });
    render();
  });
})();
