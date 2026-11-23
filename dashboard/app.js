// Token Radar dashboard: board, detail, live market and method views.
//
// The page renders from window.RADAR, written by main.ts from the sealed
// snapshot. It fetches nothing and calls no network: every byte it shows
// is in data.js beside it.
//
// Three addresses, one page — these are the three screenshots:
//   board    dashboard/index.html
//   detail   dashboard/index.html#/protocol/<slug>   (a protocol's detail view)
//   filtered dashboard/index.html#/filter/category=Dexs

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) {
    document.getElementById('main').innerHTML = '<p class="empty">No radar data found: data.js did not load.</p>';
    return;
  }

  var rows = R.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });
  var watchlist = {};
  (R.watchlist || []).forEach(function (s) { watchlist[s] = true; });

  var state = { view: 'board', slug: null, q: '', category: '', chain: '', minTvl: 0, watchlistOnly: false, sort: 'rank', dir: 1 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    if (n == null || !isFinite(n)) return '—';
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pct(v) {
    if (v == null || !isFinite(v)) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v > 0 ? 'up' : v < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  function ageText(d) {
    if (d == null) return '—';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function catName(c) { return c == null ? 'Uncategorised' : c; }

  // ---- headline ------------------------------------------------------------
  var top = rows[0];
  document.getElementById('headline').innerHTML =
    '<div><dt>Watchlist</dt><dd>' + R.watchlist_size + ' protocols</dd></div>' +
    '<div><dt>Board</dt><dd>' + R.board_size + ' ranked</dd></div>' +
    '<div><dt>Snapshot</dt><dd>' + esc(R.as_of) + '</dd></div>' +
    '<div><dt>Top implied value</dt><dd>' + (top ? money(top.implied_value_usd) : '—') + '</dd></div>';

  document.getElementById('sourceLine').textContent =
    'Snapshot: DefiLlama protocols, as of ' + R.as_of + '. Floor for the watchlist: ' + moneyFull(R.floor_usd) + ' of TVL.';

  // ---- filter controls -----------------------------------------------------
  var catSel = document.getElementById('category');
  var chainSel = document.getElementById('chain');
  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (cats.indexOf(catName(r.category)) < 0) cats.push(catName(r.category));
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort().forEach(function (c) { catSel.add(new Option(c, c)); });
  chains.sort().forEach(function (c) { chainSel.add(new Option(c, c)); });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (state.category && catName(r.category) !== state.category) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.watchlistOnly && !watchlist[r.slug]) return false;
      return true;
    });
  }

  function sorted(list) {
    var key = state.sort;
    var dir = state.dir;
    var val = function (r) {
      if (key === 'rank') return r.rank;
      if (key === 'implied') return r.implied_value_usd;
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d == null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days == null ? -1 : r.age_days;
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'category') return catName(r.category).toLowerCase();
      return r.rank;
    };
    return list.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function renderBoard() {
    var list = sorted(filtered());
    var body = document.getElementById('boardBody');
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' protocols';
    document.getElementById('boardEmpty').hidden = list.length > 0;
    body.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(catName(r.category)) + (watchlist[r.slug] ? ' <span class="pill watch">watchlist</span>' : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong><span class="sub">×' + r.category_multiple.toFixed(2) + ' multiple</span></td>' +
        '<td><span class="pill">' + r.farm_steps.length + ' steps</span></td>' +
        '</tr>';
    }).join('');
    body.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/protocol/' + tr.getAttribute('data-slug'); });
    });
    document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
      var k = th.getAttribute('data-sort');
      th.textContent = th.textContent.replace(/ [▲▼]$/, '');
      if (state.sort === k) th.textContent += state.dir === 1 ? ' ▲' : ' ▼';
    });
  }

  // ---- detail view ---------------------------------------------------------
  function renderDetail(slug) {
    var r = bySlug[slug];
    var el = document.getElementById('detailView');
    if (!r) {
      el.innerHTML = '<p class="empty">No protocol with that slug is on this board.</p><button type="button" class="back" data-back>← Back to the board</button>';
    } else {
      var multiple = r.category_multiple;
      var base = r.tvl_usd * multiple;
      var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
      el.innerHTML =
        '<div class="detail">' +
        '<button type="button" class="back" data-back>← Back to the board</button>' +
        '<h2>' + esc(r.name) + '</h2>' +
        '<p class="meta">Rank #' + r.rank + ' · ' + esc(catName(r.category)) + ' · ' + esc((r.chains || []).join(', ') || 'no chain listed') +
        (watchlist[r.slug] ? ' · <span class="pill watch">on the watchlist</span>' : ' · below the watchlist floor') +
        ' · records no token</p>' +
        '<div class="stats">' +
        '<div class="stat"><div class="k">Implied value</div><div class="v">' + money(r.implied_value_usd) + '</div><div class="s">' + moneyFull(r.implied_value_usd) + '</div></div>' +
        '<div class="stat"><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div><div class="s">' + moneyFull(r.tvl_usd) + '</div></div>' +
        '<div class="stat"><div class="k">7-day change</div><div class="v">' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</div><div class="s">growth ×' + r.growth_multiplier.toFixed(2) + '</div></div>' +
        '<div class="stat"><div class="k">Age</div><div class="v">' + ageText(r.age_days) + '</div><div class="s">maturity ×' + r.maturity_multiplier.toFixed(2) + '</div></div>' +
        '<div class="stat"><div class="k">Category multiple</div><div class="v">×' + multiple.toFixed(2) + '</div><div class="s">' + esc(catName(r.category)) + ' median, shrunk</div></div>' +
        '</div>' +
        '<h3>How the implied value is worked out</h3>' +
        '<div class="table-wrap"><table class="breakdown"><tbody>' +
        '<tr><td>TVL</td><td class="num">' + moneyFull(r.tvl_usd) + '</td></tr>' +
        '<tr><td>× ' + esc(catName(r.category)) + ' multiple (median mcap / TVL of live ' + esc(catName(r.category)) + ' protocols, shrunk toward the market median)</td><td class="num">×' + multiple.toFixed(4) + '</td></tr>' +
        '<tr><td>Base value</td><td class="num">' + moneyFull(base) + '</td></tr>' +
        '<tr><td>× growth multiplier (7d ' + (r.change_7d == null ? 'unreported' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + ')</td><td class="num">×' + r.growth_multiplier.toFixed(4) + '</td></tr>' +
        '<tr><td>× maturity multiplier (' + (r.age_days == null ? 'listing date unreported' : r.age_days + ' days listed') + ')</td><td class="num">×' + r.maturity_multiplier.toFixed(4) + '</td></tr>' +
        '<tr><td><strong>Implied value</strong></td><td class="num"><strong>' + moneyFull(r.implied_value_usd) + '</strong></td></tr>' +
        '</tbody></table></div>' +
        '<h3>Farm plan — six steps</h3>' +
        '<ol class="steps">' + steps + '</ol>' +
        '<p class="note" style="margin-top:16px">This plan is a starting point, not advice. ' + esc(r.name) +
        ' records no token in the snapshot; that is a fact about the record, not proof it has none, and not a promise it will issue one.</p>' +
        '</div>';
    }
    el.querySelectorAll('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () { location.hash = '#/'; });
    });
  }

  // ---- live market view ----------------------------------------------------
  function renderLive() {
    document.getElementById('liveBody').innerHTML = R.live.map(function (p) {
      return '<tr><td><strong>' + esc(p.name) + '</strong><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(catName(p.category)) + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td>' +
        '<td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.mcap_per_tvl == null ? '—' : '×' + p.mcap_per_tvl.toFixed(2)) + '</td>' +
        '<td class="num">' + pct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  // ---- method view ---------------------------------------------------------
  function renderMethod() {
    document.getElementById('calibBody').innerHTML = R.calibration.by_category.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.n + '</td><td class="num">×' + c.median.toFixed(2) + '</td><td class="num">×' + c.multiple.toFixed(2) + '</td></tr>';
    }).join('');
    document.getElementById('calibBody').innerHTML += '<tr><td><strong>Market-wide</strong></td><td class="num">' + R.calibration.live_count + '</td><td class="num">×' + R.calibration.global_median.toFixed(2) + '</td><td class="num">×' + R.calibration.global_median.toFixed(2) + '</td></tr>';
    var below = R.board_size - R.watchlist_size;
    document.getElementById('coverageText').textContent =
      'The board ranks ' + R.board_size + ' protocols: all ' + R.watchlist_size + ' on the watchlist, plus ' + below +
      ' more pre-token protocols the watchlist leaves out — below its $50M floor, or kept off it by the wrapped, staked and bridged-product rule. ' +
      'The snapshot holds ' + (R.rows.length + R.live.length) + ' protocols at or above $5M of TVL; the ' + R.live.length +
      ' with a token that already trades are shown separately, as the market the model is fitted on, and are never ranked as if they were still to come.';
  }

  // ---- routing -------------------------------------------------------------
  function route() {
    var hash = location.hash || '#/';
    var m;
    if ((m = hash.match(/^#\/protocol\/([A-Za-z0-9._-]+)$/))) {
      show('detail');
      renderDetail(m[1]);
      return;
    }
    if (hash.indexOf('#/filter/') === 0) {
      var params = new URLSearchParams(hash.slice(9));
      if (params.get('category')) { state.category = params.get('category'); catSel.value = state.category; }
      if (params.get('chain')) { state.chain = params.get('chain'); chainSel.value = state.chain; }
      if (params.get('q')) { state.q = params.get('q'); document.getElementById('q').value = state.q; }
      if (params.get('minTvl')) { state.minTvl = Number(params.get('minTvl')) || 0; document.getElementById('minTvl').value = String(state.minTvl); }
      if (params.get('watchlist') === '1') { state.watchlistOnly = true; document.getElementById('watchlistOnly').checked = true; }
      if (params.get('sort')) { state.sort = params.get('sort'); document.getElementById('sort').value = state.sort; }
      show('board');
      renderBoard();
      return;
    }
    if (hash === '#/live') { show('live'); renderLive(); return; }
    if (hash === '#/method') { show('method'); renderMethod(); return; }
    show('board');
    renderBoard();
  }

  function show(view) {
    state.view = view;
    document.getElementById('boardView').hidden = view !== 'board';
    document.getElementById('controls').style.display = view === 'board' ? '' : 'none';
    document.getElementById('detailView').hidden = view !== 'detail';
    document.getElementById('liveView').hidden = view !== 'live';
    document.getElementById('methodView').hidden = view !== 'method';
    document.querySelectorAll('.view-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view || (view === 'detail' && b.getAttribute('data-view') === 'board'));
    });
  }

  // ---- events --------------------------------------------------------------
  document.querySelectorAll('.view-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-view');
      location.hash = v === 'board' ? '#/' : '#/' + v;
    });
  });
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  catSel.addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  document.getElementById('minTvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); renderBoard(); });
  document.getElementById('watchlistOnly').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; renderBoard(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; state.dir = 1; renderBoard(); });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === 'name' || k === 'category' ? 1 : -1; }
      renderBoard();
    });
  });
  window.addEventListener('hashchange', route);

  route();
})();
