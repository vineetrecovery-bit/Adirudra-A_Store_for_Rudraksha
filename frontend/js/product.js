// Product detail page: product.html?id=AR-001
(function () {
  'use strict';
  const { byId, Cart, money, esc, $, visual, productCard, toast, whatsappLink } = Store;
  // Editable text from Admin > Website; data-site lets the live preview update it in place.
  const T = (key, vars) => (window.Site ? Site.t(`pages.${key}`, vars) : '');
  const txt = (tag, key, attrs = '') => `<${tag} data-site="pages.${key}"${attrs}>${esc(T(key))}</${tag}>`;

  Store.onReady(() => {
    const id = new URLSearchParams(location.search).get('id');
    const p = byId(id);

    if (!p) {
      $('#crumb').textContent = 'Not found';
      $('#pdp').innerHTML = `<div class="empty-state" style="margin-bottom:80px">${txt('h3', 'product.notFoundTitle')}${txt('p', 'product.notFoundText')}<a class="button button--dark" href="shop.html">Back to the shop</a></div>`;
      $('#relatedSection').hidden = true;
      return;
    }

    document.title = `${p.name} — Adirudra`;
    $('#crumb').textContent = p.name;
    const inCart = Cart.qtyOf(p.id);
    const freeOver = Store.CONFIG.freeShippingOver;

    $('#pdp').innerHTML = `<div class="pdp">
      <div class="pdp__visual">${visual(p)}${p.rarity !== 'Common' ? `<span class="badge${p.rarity.includes('Rare') ? ' badge--dark' : ''}">${esc(p.rarity)}</span>` : ''}</div>
      <div class="pdp__info">
        <p class="kicker">${esc(p.type)} · ${esc(p.origin)}</p>
        <h1>${esc(p.name)}</h1>
        <p class="pdp__price">${money(p.price)}</p>
        <p class="pdp__tax">${txt('span', 'product.taxNote')} · ${p.price >= freeOver ? 'Free shipping' : `Free shipping over ${money(freeOver)}`}</p>
        <p class="pdp__desc">${esc(p.description)}</p>
        <dl class="specs">
          <div><dt>Mukhi</dt><dd>${esc(p.mukhi)}</dd></div>
          <div><dt>Origin</dt><dd>${esc(p.origin)}</dd></div>
          <div><dt>Size</dt><dd>${esc(p.size)}</dd></div>
          <div><dt>Weight</dt><dd>${esc(p.weight)}</dd></div>
          <div><dt>Rarity</dt><dd>${esc(p.rarity)}</dd></div>
          <div><dt>Verification ID</dt><dd>${esc(p.verification)}</dd></div>
        </dl>
        ${p.inStock ? `<div class="buy-row">
          <div class="qty" role="group" aria-label="Quantity">
            <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
            <input id="qty" type="number" min="1" max="${p.maxQty}" value="1" aria-label="Quantity">
            <button type="button" data-step="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="button button--dark" type="button" id="addBtn">Add to cart</button>
          <button class="button button--outline" type="button" id="buyBtn">Buy now</button>
        </div>
        ${p.maxQty <= 3 ? `<p style="font-size:12px;color:var(--danger);margin:-10px 0 14px">Only ${p.maxQty} left in stock.</p>` : ''}` : `<div class="buy-row"><button class="button button--dark" type="button" disabled>Sold out</button><a class="button button--outline" href="${whatsappLink(`Namaste, please let me know when ${p.name} (${p.id}) is back in stock.`)}" target="_blank" rel="noopener">Notify me on WhatsApp</a></div>`}
        <p class="muted" id="inCartNote" style="font-size:12px;margin-bottom:20px"${inCart ? '' : ' hidden'}>${inCart} already in your cart.</p>
        <div class="assurance">
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>${txt('span', p.certified ? 'product.certified' : 'product.inspected')}</div>
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>${txt('span', 'product.shipping')}</div>
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>${txt('span', 'product.returns')}</div>
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12Z"/></svg><a class="text-link" href="${whatsappLink(`Namaste, I have a question about ${p.name} (${p.id}).`)}" target="_blank" rel="noopener" data-site="pages.product.askLabel">${esc(T('product.askLabel'))}</a></div>
        </div>
      </div>
    </div>`;

    const related = Store.products.filter((x) => x.id !== p.id && (x.type === p.type || x.origin === p.origin)).slice(0, 3);
    if (related.length) $('#related').innerHTML = related.map(productCard).join('');
    else $('#relatedSection').hidden = true;

    if (!p.inStock) return;
    const qtyInput = $('#qty');
    const clampQty = () => { qtyInput.value = Math.max(1, Math.min(p.maxQty, parseInt(qtyInput.value, 10) || 1)); };
    $('#pdp').addEventListener('click', (e) => {
      const step = e.target.closest('[data-step]');
      if (step) { qtyInput.value = (parseInt(qtyInput.value, 10) || 1) + Number(step.dataset.step); clampQty(); }
    });
    qtyInput.addEventListener('change', clampQty);
    const addToCart = () => {
      clampQty();
      const before = Cart.qtyOf(p.id);
      const n = Cart.add(p.id, Number(qtyInput.value));
      const note = $('#inCartNote'); note.hidden = false; note.textContent = `${n} in your cart.`;
      return n > before;
    };
    $('#addBtn').addEventListener('click', () => {
      toast(addToCart() ? `${p.name} added to cart` : `You already have the maximum available of ${p.name}.`);
    });
    $('#buyBtn').addEventListener('click', () => { addToCart(); location.href = 'checkout.html'; });
  });
})();
