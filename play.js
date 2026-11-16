(function () {
  'use strict';
  var X = window.Xmas, el = X.el;
  var S = null, uid = null, room = '';
  var state = { players: {}, item: null, bids: {}, sold: {}, annAll: {}, annMe: {}, gifts: {}, hostUid: '' };
  var seen = {};

  function $(id) { return document.getElementById(id); }
  function fatal(e) {
    var f = $('fatal');
    f.textContent = (e && e.message) ? e.message : String(e);
    f.hidden = false;
  }
  function joinErr(t) { $('joinErr').textContent = t || ''; }

  /* ---------- boot ---------- */
  X.connect().then(function (store) {
    S = store; uid = S.uid; X.banner(S);
    var qs = new URLSearchParams(location.search);
    var r = X.cleanCode(qs.get('room') || X.ls.get('xmas-play-room') || '');
    $('roomIn').value = r;
    $('nameIn').value = X.ls.get('xmas-play-name') || '';
    if (r) {
      return S.get('rooms/' + r + '/players/' + uid).then(function (p) {
        if (p && p.name) start(r, p.name);
      });
    }
  }).catch(fatal);

  $('joinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!S) return;
    X.unlockAudio();
    var name = $('nameIn').value.trim().slice(0, 24), code = X.cleanCode($('roomIn').value);
    joinErr('');
    if (!name || !code) { joinErr('Enter your name and the room code.'); return; }
    S.get('rooms/' + code + '/meta').then(function (meta) {
      if (!meta) { joinErr('No party found with that code.'); return; }
      return S.get('rooms/' + code + '/players/' + uid).then(function (p) {
        if (p && p.name) { start(code, p.name); return; }
        return S.set('rooms/' + code + '/players/' + uid, { name: name, balance: 200, joined: Date.now() })
          .then(function () { start(code, name); });
      });
    }).catch(function (err) { joinErr('Could not join: ' + ((err && err.message) || err)); });
  });

  /* ---------- game ---------- */
  function sub(path, fn) { S.on('rooms/' + room + '/' + path, function (v) { fn(v || null); }); }

  function start(code, name) {
    room = code;
    X.ls.set('xmas-play-room', code);
    X.ls.set('xmas-play-name', name);
    $('whoami').textContent = name;
    $('joinBox').hidden = true;
    $('game').hidden = false;

    S.get('rooms/' + room + '/meta').then(function (m) { state.hostUid = (m && m.hostUid) || ''; renderGifts(); }).catch(function () {});
    sub('players', function (v) { state.players = v || {}; renderWallet(); renderItem(); renderGifts(); });
    sub('item', function (v) { state.item = v; renderItem(); });
    sub('bids', function (v) { state.bids = v || {}; renderItem(); });
    sub('sold', function (v) { state.sold = v || {}; renderWallet(); renderPile(); });
    sub('gifts', function (v) { state.gifts = v || {}; renderGifts(); });
    sub('announce/all', announceHandler('annAll', false));
    sub('announce/direct/' + uid, announceHandler('annMe', true));
  }

  function myBal() { var p = state.players[uid]; return p ? p.balance : 0; }
  function winCount() {
    var n = 0;
    Object.keys(state.sold).forEach(function (k) { if (state.sold[k].winnerUid === uid) n++; });
    return n;
  }
  function highBid() {
    var best = null;
    Object.keys(state.bids).forEach(function (u) {
      var b = state.bids[u];
      if (!b || !state.item || b.itemId !== state.item.id) return;
      if (!best || b.amount > best.amount || (b.amount === best.amount && b.ts < best.ts)) {
        best = { uid: u, amount: b.amount, ts: b.ts };
      }
    });
    return best;
  }
  function giftFrom(g) {
    if (g.ownerUid === state.hostUid) return 'Host';
    return state.players[g.ownerUid] ? state.players[g.ownerUid].name : 'a guest';
  }
  function nameOf(u) { var p = state.players[u]; return p ? p.name : 'someone'; }

  function renderWallet() {
    $('bal').textContent = X.money(myBal());
    $('wins').textContent = winCount();
  }

  function renderItem() {
    var it = state.item, ui = $('bidUI');
    if (!it) {
      $('itemName').textContent = 'Waiting for the host…';
      $('itemClue').textContent = ''; $('itemStatus').textContent = ''; ui.hidden = true;
      return;
    }
    $('itemName').textContent = it.name;
    $('itemClue').textContent = it.clue ? 'Clue: ' + it.clue : '';
    if (!it.open) {
      ui.hidden = true;
      $('itemStatus').textContent = it.soldTo
        ? 'SOLD to ' + it.soldTo + ' for ' + X.money(it.price) + '!'
        : 'Bidding is closed.';
      return;
    }
    $('itemStatus').textContent = 'Bidding is OPEN!';
    ui.hidden = false;
    var hb = highBid(), mine = state.bids[uid];
    $('highBid').textContent = hb ? X.money(hb.amount) + ' (' + (hb.uid === uid ? 'you!' : nameOf(hb.uid)) + ')' : 'none yet';
    $('myBid').textContent = (mine && mine.itemId === it.id) ? X.money(mine.amount) : 'none';
    var base = hb ? hb.amount : 0, bal = myBal();
    [['inc1', 1], ['inc5', 5], ['inc10', 10]].forEach(function (p) {
      var b = $(p[0]);
      b.disabled = (base + p[1]) > bal;
      b.dataset.amount = base + p[1];
    });
  }

  function bidMsg(t) { $('bidMsg').textContent = t || ''; }
  function placeBid(amount) {
    amount = Math.floor(Number(amount));
    bidMsg('');
    var it = state.item, hb = highBid(), min = hb ? hb.amount + 1 : 1, bal = myBal();
    if (!it || !it.open) return bidMsg('Bidding is closed.');
    if (!(amount >= min)) return bidMsg('Bid at least ' + X.money(min) + '.');
    if (amount > bal) return bidMsg('You only have ' + X.money(bal) + '.');
    S.set('rooms/' + room + '/bids/' + uid, { amount: amount, itemId: it.id, ts: Date.now() })
      .catch(function (e) { bidMsg('Bid failed: ' + ((e && e.message) || e)); });
  }
  ['inc1', 'inc5', 'inc10'].forEach(function (id) {
    $(id).addEventListener('click', function () { placeBid(this.dataset.amount); });
  });
  $('bidBtn').addEventListener('click', function () { placeBid($('customBid').value); $('customBid').value = ''; });
  $('customBid').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('bidBtn').click(); });


  /* ---------- my gifts ---------- */
  function giftMsg(t, ok) { var n = $('giftMsg'); n.textContent = t || ''; n.className = ok ? 'ok' : 'err'; }

  $('giftHidden').addEventListener('change', function () {
    var hid = this.checked;
    $('giftDesc').parentNode.hidden = hid;   // hidden gifts need no description
  });

  $('giftForm').addEventListener('submit', function (e) {
    e.preventDefault();
    giftMsg('');
    var hidden = $('giftHidden').checked, text = $('giftDesc').value.trim().slice(0, 60);
    if (!hidden && !text) return giftMsg('Describe the gift, or tick Hidden.');
    var gift = { ownerUid: uid, hidden: hidden, status: 'pool', ts: Date.now() };
    if (!hidden) gift.desc = text;
    S.push('rooms/' + room + '/gifts', gift).then(function () {
      $('giftDesc').value = '';
      giftMsg(hidden ? 'Added a hidden gift.' : 'Added!', true);
    }).catch(function (err) { giftMsg('Could not add: ' + ((err && err.message) || err)); });
  });

  // Every gift in the room (hidden ones show as mystery gifts). Yours are marked, and can be removed while waiting.
  function renderGifts() {
    var box = $('myGifts'); box.textContent = '';
    var keys = Object.keys(state.gifts).sort(function (a, b) {
      var sa = state.gifts[a].status === 'sold' ? 1 : 0, sb = state.gifts[b].status === 'sold' ? 1 : 0;
      return sa - sb || state.gifts[a].ts - state.gifts[b].ts;
    });
    var waiting = keys.filter(function (k) { return state.gifts[k].status === 'pool'; }).length;
    $('poolSummary').textContent = keys.length
      ? waiting + ' waiting, ' + (keys.length - waiting) + ' already up or sold.'
      : 'No gifts registered yet.';
    keys.forEach(function (k) {
      var g = state.gifts[k], mine = g.ownerUid === uid;
      var status = 'From ' + giftFrom(g) + (g.status === 'up' ? ' · Up for bid now!' : g.status === 'sold' ? ' · Sold' : '');
      var title = [el('strong', { text: g.hidden ? 'Mystery gift' : g.desc })];
      if (mine) title.push(' ', el('span', { class: 'pill', text: 'Yours' }));
      var info = el('div', {}, [el('div', {}, title), el('div', { class: 'small', text: status })]);
      var act = (mine && g.status === 'pool')
        ? el('button', { type: 'button', class: 'ghost', text: 'Remove', onclick: function () {
            S.remove('rooms/' + room + '/gifts/' + k).catch(function (err) { giftMsg('Could not remove: ' + ((err && err.message) || err)); });
          } })
        : null;
      box.appendChild(el('div', { class: 'cardchip' + (g.status === 'sold' ? ' sold' : '') }, [info, act]));
    });
  }

  function renderPile() {
    var list = $('pile'); list.textContent = '';
    var keys = Object.keys(state.sold).filter(function (k) { return state.sold[k].winnerUid === uid; })
      .sort(function (a, b) { return state.sold[a].ts - state.sold[b].ts; });
    if (!keys.length) { list.appendChild(el('li', { class: 'small', text: 'Nothing won yet.' })); return; }
    keys.forEach(function (k) {
      var s = state.sold[k];
      list.appendChild(el('li', {}, [el('strong', { text: s.item }), ' for ' + X.money(s.price)]));
    });
  }

  /* ---------- announcements ---------- */
  function announceHandler(stream, direct) {
    var first = true;
    return function (v) {
      v = v || {};
      Object.keys(v).forEach(function (k) {
        var id = (direct ? 'd_' : 'a_') + k;
        if (!seen[id]) { seen[id] = 1; if (!first) toast(v[k], direct); }
      });
      first = false;
      state[stream] = v;
      renderFeed();
    };
  }

  function kindLabel(a, direct) { return direct ? 'For you' : (a.kind === 'hint' ? 'Hint' : a.kind === 'info' ? 'Info' : 'Alert'); }
  function kindClass(a, direct) { return direct ? 'direct' : (a.kind || 'alert'); }

  function renderFeed() {
    var list = $('feed'); list.textContent = '';
    var all = [];
    Object.keys(state.annAll).forEach(function (k) { all.push({ a: state.annAll[k], direct: false }); });
    Object.keys(state.annMe).forEach(function (k) { all.push({ a: state.annMe[k], direct: true }); });
    all.sort(function (x, y) { return y.a.ts - x.a.ts; });
    if (!all.length) { list.appendChild(el('li', { class: 'small', text: 'Nothing yet.' })); return; }
    all.slice(0, 30).forEach(function (x) {
      list.appendChild(el('li', {}, [
        el('time', { text: X.fmtTime(x.a.ts) }),
        el('span', { class: 'kind ' + kindClass(x.a, x.direct), text: kindLabel(x.a, x.direct) }),
        x.a.text
      ]));
    });
  }

  function toast(a, direct) {
    var box = $('toasts');
    var t = el('div', { class: 'toast ' + kindClass(a, direct) });
    var gone = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    t.appendChild(el('div', {}, [el('span', { class: 'kind ' + kindClass(a, direct), text: kindLabel(a, direct) }), a.text]));
    t.appendChild(el('button', { type: 'button', class: 'x', 'aria-label': 'Dismiss', text: 'X', onclick: gone }));
    box.appendChild(t);
    setTimeout(gone, 20000);
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
    X.beep();
  }
})();
