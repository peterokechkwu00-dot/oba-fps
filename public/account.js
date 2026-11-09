// Menu: sign up / log in, profile, leaderboard, cosmetic shop.
import { ITEMS, getItem, formatNaira, isFree, itemsBySlot, DEFAULT_LOADOUT, XP_PER_LEVEL, levelFromXp, xpIntoLevel } from './shared/catalog.js';

const $ = id => document.getElementById(id);
let account = null;
let shopState = null;
let onLoadout = null;

export function currentAccount() { return account; }
export function currentLoadout() {
  if (account) return { camo: account.camo, rifle: account.rifle, tag: account.tag };
  return { ...DEFAULT_LOADOUT };
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(opts.headers || {}) },
    ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function setMsg(el, text, kind = '') {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'acct-msg' + (kind ? ' ' + kind : '');
}

function showTab(id) {
  for (const btn of document.querySelectorAll('.menu-tabs [data-tab]')) {
    btn.classList.toggle('on', btn.dataset.tab === id);
  }
  for (const pane of document.querySelectorAll('#menu .tabpane')) {
    pane.classList.toggle('hidden', pane.id !== 'tab-' + id);
  }
  if (id === 'profile' || id === 'shop') refreshMe().then(() => { renderProfile(); renderShop(); });
  if (id === 'board') refreshBoard();
}

function applyLoggedIn() {
  const name = $('name');
  const signed = $('acct-signed');
  if (account) {
    if (name) { name.value = account.username; name.readOnly = true; name.title = 'Signed in — your callsign is your username'; }
    if (signed) signed.textContent = `Signed in as ${account.username}  ·  Lv ${account.level}`;
    const lo = $('acct-logout'); if (lo) lo.classList.remove('hidden');
    const forms = $('acct-forms'); if (forms) forms.classList.add('hidden');
  } else {
    if (name) { name.readOnly = false; name.title = ''; const saved = localStorage.getItem('fps-name'); if (saved && !name.value) name.value = saved; }
    if (signed) signed.textContent = 'Play as a guest, or create an account to save progress and buy skins.';
    const lo = $('acct-logout'); if (lo) lo.classList.add('hidden');
    const forms = $('acct-forms'); if (forms) forms.classList.remove('hidden');
  }
  if (onLoadout) onLoadout(currentLoadout(), account);
}

async function refreshMe() {
  try {
    const data = await api('/api/auth/me');
    account = data.account || null;
  } catch {
    account = null;
  }
  applyLoggedIn();
  return account;
}

function renderProfile() {
  const box = $('profile-body');
  if (!box) return;
  if (!account) {
    box.innerHTML = '<p class="hint">Log in or sign up to track kills, XP and unlocks across matches.</p>';
    return;
  }
  const kd = (account.kills / Math.max(1, account.deaths)).toFixed(2);
  const into = xpIntoLevel(account.xp);
  const pct = Math.min(100, Math.round((into / XP_PER_LEVEL) * 100));
  const camo = getItem(account.camo);
  const rifle = getItem(account.rifle);
  const tag = getItem(account.tag);
  box.innerHTML = `
    <div class="profile-name">${escapeHtml(account.username)}</div>
    <div class="profile-level">Level ${account.level}</div>
    <div class="xpbar" aria-label="XP"><div class="xpfill" style="width:${pct}%"></div></div>
    <div class="xpmeta">${into} / ${XP_PER_LEVEL} XP this level · ${account.xp} total</div>
    <div class="stats">
      <div><b>${account.kills}</b><span>Kills</span></div>
      <div><b>${account.deaths}</b><span>Deaths</span></div>
      <div><b>${kd}</b><span>K/D</span></div>
      <div><b>${account.wins}</b><span>Wins</span></div>
      <div><b>${account.matches}</b><span>Matches</span></div>
    </div>
    <div class="loadout">Equipped: ${escapeHtml(camo?.name || '—')} · ${escapeHtml(rifle?.name || '—')} · ${escapeHtml(tag?.name || '—')}</div>
  `;
}

async function refreshBoard() {
  const box = $('board-body');
  if (!box) return;
  box.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const data = await api('/api/leaderboard');
    if (!data.db) {
      box.innerHTML = '<p class="hint">Leaderboard is unavailable until the database is connected.</p>';
      return;
    }
    if (!data.list.length) {
      box.innerHTML = '<p class="hint">No soldiers on the board yet. Sign up and get some kills.</p>';
      return;
    }
    const mine = account?.username;
    box.innerHTML = `<table class="board"><thead><tr><th>#</th><th>Player</th><th>Lv</th><th>XP</th><th>K</th><th>D</th><th>W</th></tr></thead><tbody>` +
      data.list.map(r => `<tr class="${r.username === mine ? 'me' : ''}"><td>${r.rank}</td><td>${escapeHtml(r.username)}</td><td>${r.level}</td><td>${r.xp}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.wins}</td></tr>`).join('') +
      `</tbody></table>`;
  } catch (err) {
    box.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
  }
}

function swatch(item) {
  if (item.slot === 'camo') {
    const bg = item.pattern === 'ankara'
      ? 'conic-gradient(from 30deg, #c62828, #f9a825, #1b7a3a, #1565c0, #c62828)'
      : (item.color || '#666');
    return `<span class="swatch" style="background:${bg}"></span>`;
  }
  if (item.slot === 'tag') return `<span class="swatch tag" style="background:${item.color || '#ff5a4f'}"></span>`;
  if (item.id === 'rifle_gold') return '<span class="swatch" style="background:#d4b44a"></span>';
  if (item.id === 'rifle_carbon') return '<span class="swatch" style="background:#222"></span>';
  if (item.id === 'rifle_gwg') return '<span class="swatch" style="background:linear-gradient(#1b7a3a 33%,#f2f2f2 33% 66%,#1b7a3a 66%)"></span>';
  return '<span class="swatch" style="background:#6a6e73"></span>';
}

function renderShop() {
  const box = $('shop-body');
  if (!box) return;
  const owned = new Set(account?.owned || shopState?.owned || []);
  const equipped = account ? { camo: account.camo, rifle: account.rifle, tag: account.tag } : (shopState?.equipped || DEFAULT_LOADOUT);
  const payments = !!(shopState && shopState.paymentsEnabled);
  const guest = !account;
  const banner = guest
    ? '<div class="shop-banner">Log in to buy and equip cosmetics. Guests can play, but cannot buy.</div>'
    : (!payments
      ? '<div class="shop-banner soon">Payments coming soon — Paystack test keys are not on this server yet. You can still equip free starter items.</div>'
      : '<div class="shop-banner">Pay with Paystack (test or live, depending on the keys). Amounts are in naira.</div>');
  const sections = [
    ['camo', 'Soldier camo'],
    ['rifle', 'Rifle skins'],
    ['tag', 'Name-tag colours'],
  ].map(([slot, title]) => {
    const cards = itemsBySlot(slot).map(item => {
      const has = isFree(item) || owned.has(item.id);
      const eq = equipped[slot] === item.id;
      const price = isFree(item) ? 'Free' : formatNaira(item.priceKobo);
      let action = '';
      if (guest && !isFree(item)) action = `<button type="button" disabled>Log in to buy</button>`;
      else if (eq) action = `<button type="button" class="eq" disabled>Equipped</button>`;
      else if (has) action = `<button type="button" data-act="equip" data-id="${item.id}">Equip</button>`;
      else if (!payments) action = `<button type="button" disabled>Coming soon · ${price}</button>`;
      else action = `<button type="button" class="buy" data-act="buy" data-id="${item.id}">Buy ${price}</button>`;
      return `<article class="item-card ${eq ? 'equipped' : ''} ${item.pattern || ''}" data-id="${item.id}">
        ${swatch(item)}
        <div class="meta"><div class="iname">${escapeHtml(item.name)}</div><div class="iprice">${price}</div></div>
        ${action}
      </article>`;
    }).join('');
    return `<h3>${title}</h3><div class="item-grid">${cards}</div>`;
  }).join('');
  box.innerHTML = banner + sections;
}

async function refreshShop() {
  try { shopState = await api('/api/shop'); }
  catch { shopState = { items: ITEMS, owned: [], paymentsEnabled: false, guest: !account }; }
  if (shopState.owned && account) account.owned = shopState.owned;
  renderShop();
}

async function equipItem(itemId) {
  const data = await api('/api/shop/equip', { method: 'POST', body: { itemId } });
  account = data.account;
  applyLoggedIn();
  renderProfile();
  renderShop();
}

async function buyItem(itemId) {
  const email = ($('pay-email')?.value || account?.email || '').trim();
  const data = await api('/api/shop/pay', { method: 'POST', body: { itemId, email } });
  if (data.authorization_url) {
    window.location.href = data.authorization_url;
    return;
  }
  throw new Error('No payment URL returned.');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function initAccount({ onLoadoutChange } = {}) {
  onLoadout = onLoadoutChange || null;
  document.querySelectorAll('.menu-tabs [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
  $('acct-signup')?.addEventListener('submit', async e => {
    e.preventDefault();
    setMsg($('acct-signup-msg'), '');
    try {
      const data = await api('/api/auth/signup', {
        method: 'POST',
        body: {
          username: $('su-user').value,
          password: $('su-pass').value,
          email: $('su-email').value,
        },
      });
      account = data.account;
      applyLoggedIn();
      setMsg($('acct-signup-msg'), 'Account created. You are signed in.', 'ok');
      showTab('profile');
      renderProfile();
      refreshShop();
    } catch (err) { setMsg($('acct-signup-msg'), err.message, 'err'); }
  });
  $('acct-login')?.addEventListener('submit', async e => {
    e.preventDefault();
    setMsg($('acct-login-msg'), '');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { username: $('li-user').value, password: $('li-pass').value },
      });
      account = data.account;
      applyLoggedIn();
      setMsg($('acct-login-msg'), 'Welcome back.', 'ok');
      showTab('profile');
      renderProfile();
      refreshShop();
    } catch (err) { setMsg($('acct-login-msg'), err.message, 'err'); }
  });
  $('acct-logout')?.addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    account = null;
    applyLoggedIn();
    renderProfile();
    renderShop();
    showTab('account');
  });
  $('shop-body')?.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    btn.disabled = true;
    try {
      if (btn.dataset.act === 'equip') await equipItem(btn.dataset.id);
      if (btn.dataset.act === 'buy') await buyItem(btn.dataset.id);
    } catch (err) {
      const note = $('shop-note');
      if (note) { note.textContent = err.message; note.classList.add('err'); }
      else alert(err.message);
    } finally { btn.disabled = false; renderShop(); }
  });

  await refreshMe();
  await refreshShop();
  renderProfile();

  const params = new URLSearchParams(location.search);
  const ref = params.get('reference') || params.get('trxref');
  if (params.get('shop') === '1' || params.get('tab') === 'shop') showTab('shop');
  if (params.get('tab') === 'profile') showTab('profile');
  if (ref && account) {
    showTab('shop');
    const note = $('shop-note');
    try {
      const data = await api('/api/shop/verify?reference=' + encodeURIComponent(ref));
      account = data.account;
      applyLoggedIn();
      renderShop();
      if (note) { note.textContent = data.already ? 'That item was already on your account.' : 'Payment confirmed — item unlocked.'; note.classList.add('ok'); }
      history.replaceState({}, '', location.pathname);
    } catch (err) {
      if (note) { note.textContent = err.message; note.classList.add('err'); }
    }
  }
}
