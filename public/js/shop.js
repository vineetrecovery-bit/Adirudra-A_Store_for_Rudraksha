// Shop listing: filters, search, sort. Filter state is mirrored in the URL so links are shareable.
(function () {
  'use strict';
  const { productCard, esc, $, $$ } = Store;
  let products = [];
  const params = new URLSearchParams(location.search);
  const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Extremely Rare'];
  // Editable text from Admin > Website; data-site lets the live preview update it in place.
  const T = (key, vars) => (window.Site ? Site.t(`pages.${key}`, vars) : '');
  const txt = (tag, key, attrs = '') => `<${tag} data-site="pages.${key}"${attrs}>${esc(T(key))}</${tag}>`;

  const state = {
    q: params.get('q') || '',
    type: params.getAll('type'),
    origin: params.getAll('origin'),
    rarity: params.getAll('rarity'),
    min: params.get('min') || '',
    max: params.get('max') || '',
    sort: params.get('sort') || 'featured'
  };

  // Highlight the matching nav item when arriving from "Malas" / "Bracelets".
  if (state.type.length === 1 && ['Mala', 'Bracelet'].includes(state.type[0])) document.body.dataset.page = state.type[0].toLowerCase();

  const unique = (key, order) => {
    const vals = [...new Set(products.map((p) => p[key]))];
    return order ? vals.sort((a, b) => order.indexOf(a) - order.indexOf(b)) : vals.sort();
  };

  function checkboxes(mountId, key, values) {
    $(mountId).innerHTML = values.map((v) => {
      const n = products.filter((p) => p[key] === v).length;
      return `<label class="check"><input type="checkbox" data-key="${key}" value="${esc(v)}"${state[key].includes(v) ? ' checked' : ''}> ${esc(v)} <em>${n}</em></label>`;
    }).join('');
  }

  function matches(p) {
    if (state.type.length && !state.type.includes(p.type)) return false;
    if (state.origin.length && !state.origin.includes(p.origin)) return false;
    if (state.rarity.length && !state.rarity.includes(p.rarity)) return false;
    if (state.min !== '' && p.price < Number(state.min)) return false;
    if (state.max !== '' && p.price > Number(state.max)) return false;
    if (state.q) {
      const hay = [p.name, p.type, p.origin, p.rarity, `${p.mukhi} mukhi`, ...p.keywords].join(' ').toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t))) return false;
    }
    return true;
  }

  const sorters = {
    featured: (a, b) => (b.featured - a.featured) || (RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity)),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    mukhi: (a, b) => a.mukhi - b.mukhi,
    name: (a, b) => a.name.localeCompare(b.name)
  };

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    ['type', 'origin', 'rarity'].forEach((k) => state[k].forEach((v) => p.append(k, v)));
    if (state.min) p.set('min', state.min);
    if (state.max) p.set('max', state.max);
    if (state.sort !== 'featured') p.set('sort', state.sort);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  function render() {
    const list = products.filter(matches).sort(sorters[state.sort] || sorters.featured);
    $('#count').textContent = `${list.length} of ${products.length} products`;
    $('#grid').innerHTML = list.length
      ? list.map(productCard).join('')
      : `<div class="empty-state">${txt('h3', 'shop.emptyTitle')}${txt('p', 'shop.emptyText')}<button class="button button--dark" type="button" data-reset>Clear filters</button></div>`;
    // One type selected: use that category's name (Website > Shop-by-category labels) as the heading.
    const typeKey = state.type.length === 1 ? { 'Loose Bead': 'looseBead', Mala: 'mala', Bracelet: 'bracelet', Pendant: 'pendant' }[state.type[0]] : null;
    const key = typeKey ? `categories.labels.${typeKey}` : 'pages.shop.title';
    const title = Site.t(key) || T('shop.title');
    for (const el of [$('#shopTitle'), $('#crumb')]) { el.dataset.site = key; el.textContent = title; }
    if (!typeKey) { $('#crumb').removeAttribute('data-site'); $('#crumb').textContent = 'Shop'; }
    syncUrl();
  }

  function reset() {
    Object.assign(state, { q: '', type: [], origin: [], rarity: [], min: '', max: '' });
    $('#q').value = ''; $('#minPrice').value = ''; $('#maxPrice').value = '';
    $$('#filters input[type=checkbox]').forEach((c) => { c.checked = false; });
    render();
  }

  Store.onReady(() => {
    products = Store.products;
    checkboxes('#fType', 'type', unique('type'));
    checkboxes('#fOrigin', 'origin', unique('origin'));
    checkboxes('#fRarity', 'rarity', unique('rarity', RARITY_ORDER));
    $('#q').value = state.q; $('#minPrice').value = state.min; $('#maxPrice').value = state.max; $('#sort').value = state.sort;

    $('#filters').addEventListener('change', (e) => {
      const c = e.target; if (c.type !== 'checkbox') return;
      const k = c.dataset.key;
      state[k] = c.checked ? [...state[k], c.value] : state[k].filter((v) => v !== c.value);
      render();
    });
    $('#q').addEventListener('input', (e) => { state.q = e.target.value.trim(); render(); });
    $('#minPrice').addEventListener('input', (e) => { state.min = e.target.value; render(); });
    $('#maxPrice').addEventListener('input', (e) => { state.max = e.target.value; render(); });
    $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
    $('#reset').addEventListener('click', reset);
    $('#grid').addEventListener('click', (e) => { if (e.target.closest('[data-reset]')) reset(); });
    $('#filterToggle').addEventListener('click', (e) => {
      const open = $('#filters').classList.toggle('is-open');
      e.currentTarget.setAttribute('aria-expanded', open);
    });
    render();
  });
})();
