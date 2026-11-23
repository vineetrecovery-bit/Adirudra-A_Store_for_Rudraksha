// My account: the signed-in customer's details and order history.
(function () {
  'use strict';
  const { api, Auth, money, esc, $ } = Store;

  const STATUS = { pending: 'Awaiting payment', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
  const date = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

  function renderOrders(orders) {
    if (!orders.length) {
      $('#orderList').innerHTML = `<div class="empty-state"><h3>No orders yet</h3><p>When you place an order it will show up here.</p><a class="button button--dark" href="shop.html">Go to the shop</a></div>`;
      return;
    }
    $('#orderList').innerHTML = `<ul class="account-orders">${orders.map((o) => {
      const items = o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join(', ');
      const href = `order.html?id=${encodeURIComponent(o.id)}&token=${encodeURIComponent(o.token)}`;
      return `<li class="account-order">
        <div class="account-order__head">
          <a class="account-order__id" href="${href}">${esc(o.id)}</a>
          <span class="account-order__status account-order__status--${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span>
        </div>
        <p class="muted">${date(o.createdAt)} · ${items}</p>
        <div class="account-order__foot"><strong>${money(o.total)}</strong><a class="text-link" href="${href}">View order</a></div>
      </li>`;
    }).join('')}</ul>`;
  }

  Store.onReady(async () => {
    const user = Store.user;
    if (!user) { location.replace(Auth.loginUrl('account.html')); return; }

    $('#accountView').hidden = false;
    $('#accountTitle').textContent = `Namaste, ${user.name.split(' ')[0]}`;
    $('#accountName').textContent = user.name;
    $('#accountPhone').textContent = `+91 ${user.phone}`;
    $('#adminLink').hidden = user.role !== 'admin';
    $('#logoutBtn').addEventListener('click', () => Auth.logout());

    try { renderOrders(await api('/account/orders')); }
    catch (err) { $('#orderList').innerHTML = `<p class="field__error">${esc(err.message)}</p>`; }
  });
})();
