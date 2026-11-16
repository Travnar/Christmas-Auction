(function () {
  'use strict';
  var X = window.Xmas, el = X.el;
  var S = null, uid = null, room = '';
  var state = { players: {}, item: null, bids: {}, sold: {}, cards: {}, events: {}, annAll: {}, gifts: {} };
  var doubled = {};          // uid -> true when a Double Bid is counted on the current item
  var queue = [];            // scheduled announcements (this page only)
  var playerKey = '';
  var eventsPrimed = false, eventsSeen = {};

  var CARD_PRESETS = [
    ['Steal', 'Take a gift from another player’s pile.'],
    ['Shield', 'Protects your pile from one Steal.'],
    ['Double Bid', 'Your bid on one gift counts double against other bids.'],
    ['Block', 'Cancel one other player’s bid in a single round.'],
    ['Peek', 'Look inside one wrapped mystery gift before bidding.'],
    ['Bank Heist', 'Take $15 from another player.'],
    ['Hidden Idol: Steal', 'Play any time. Take a gift from another player’s pile.'],
    ['Hidden Idol: Shield', 'Play any time. Protects your pile from one Steal.'],
    ['Dud', 'Does nothing. Better luck next time.']
  ];
  var QUICK = [
    'Saran Wrap Ball time! Gather round.',
    'Christmas Trivia starts in 2 minutes!',
    'Last Call: spend it all, money is worthless after tonight!',
    'The steal phase is open!'
  ];

  function $(id) { return document.getElementById(id); }
  function fatal(e) { var f = $('fatal'); f.textContent = (e && e.message) ? e.message : String(e); f.hidden = false; }
  function say(id, t, ok) { var n = $(id); n.textContent = t || ''; n.className = ok ? 'ok' : 'err'; }

  /* ---------- boot ---------- */
  X.connect().then(function (store) {
    S = store; uid = S.uid; X.banner(S);
    var saved = X.cleanCode(X.ls.get('xmas-host-room') || '');
    if (saved) {
      $('resumeIn').value = saved;
      return S.get('rooms/' + saved + '/meta').then(function (m) {
        if (m && m.hostUid === uid) startHost(saved);
      });
    }
  }).catch(fatal);

  $('createBtn').addEventListener('click', function () {
    if (!S) return;
    X.unlockAudio(); say('setupErr', '');
    (function attempt(n) {
      var code = X.genCode();
      S.get('rooms/' + code + '/meta').then(function (m) {
        if (m) { if (n < 6) return attempt(n + 1); throw new Error('Could not find a free room code. Try again.'); }
        return S.set('rooms/' + code + '/meta', { hostUid: uid, created: Date.now() }).then(function () { startHost(code); });
      }).catch(function (e) { say('setupErr', (e && e.message) || String(e)); });
    })(0);
  });

  $('resumeBtn').addEventListener('click', function () {
    if (!S) return;
    X.unlockAudio(); say('setupErr', '');
    var code = X.cleanCode($('resumeIn').value);
    if (!code) return say('setupErr', 'Enter a room code.');
    S.get('rooms/' + code + '/meta').then(function (m) {
      if (!m) return say('setupErr', 'No room with that code.');
      if (m.hostUid !== uid) return say('setupErr', 'That room was created by a different device or browser, so you can’t host it from here.');
      startHost(code);
    }).catch(function (e) { say('setupErr', (e && e.message) || String(e)); });
  });

  function sub(path, fn) { S.on('rooms/' + room + '/' + path, function (v) { fn(v || null); }); }
  function base() { return 'rooms/' + room; }

  function startHost(code) {
    room = code;
    X.ls.set('xmas-host-room', code);
    $('setup').hidden = true; $('dash').hidden = false;
    $('roomCode').textContent = code;
    $('joinLink').value = new URL('play.html?room=' + code, location.href).href;

    $('cardType').appendChild(el('option', { value: '', text: 'Choose a card…' }));
    CARD_PRESETS.forEach(function (c, i) { $('cardType').appendChild(el('option', { value: String(i), text: c[0] })); });
    QUICK.forEach(function (q) {
      $('quick').appendChild(el('button', { type: 'button', class: 'alt', text: q, onclick: function () { send(q, 'all', 'alert'); } }));
    });
    $('ladder').value = X.ls.get('xmas-host-ladder') || '';
    renderLadder();

    sub('players', function (v) { state.players = v || {}; renderPlayers(); renderBids(); renderPool(); });
    sub('item', function (v) { state.item = v; renderItem(); renderBids(); });
    sub('bids', function (v) { state.bids = v || {}; renderPlayers(); renderBids(); });
    sub('sold', function (v) { state.sold = v || {}; renderPlayers(); });
    sub('cards', function (v) { state.cards = v || {}; renderPlayers(); });
    sub('announce/all', function (v) { state.annAll = v || {}; renderSent(); });
    sub('gifts', function (v) { state.gifts = v || {}; renderPool(); renderBids(); });
    sub('events', function (v) {
      v = v || {};
      Object.keys(v).forEach(function (k) {
        if (!eventsSeen[k]) { eventsSeen[k] = 1; if (eventsPrimed) X.beep(); }
      });
      eventsPrimed = true; state.events = v; renderEvents();
    });
  }

  /* ---------- room link ---------- */
  $('copyLink').addEventListener('click', function () {
    var inp = $('joinLink');
    var done = function () { $('copyMsg').textContent = 'Copied!'; setTimeout(function () { $('copyMsg').textContent = ''; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); });
    else { inp.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
  });

  /* ---------- players ---------- */
  function winsOf(u) {
    var n = 0;
    Object.keys(state.sold).forEach(function (k) { if (state.sold[k].winnerUid === u) n++; });
    return n;
  }
  function cardCounts(u) {
    var c = state.cards[u] || {}, total = 0, unused = 0;
    Object.keys(c).forEach(function (k) { total++; if (!c[k].used) unused++; });
    return unused + '/' + total;
  }
  function currentBid(u) {
    var b = state.bids[u];
    return (b && state.item && b.itemId === state.item.id) ? b : null;
  }
  function playerIds() {
    return Object.keys(state.players).sort(function (a, b) {
      return state.players[a].name.toLowerCase() < state.players[b].name.toLowerCase() ? -1 : 1;
    });
  }

  function renderPlayers() {
    var ids = playerIds(), body = $('playersBody');
    body.textContent = '';
    if (!ids.length) {
      body.appendChild(el('tr', {}, [el('td', { colspan: '5', class: 'small', text: 'Waiting for players to join…' })]));
    }
    ids.forEach(function (u) {
      var p = state.players[u], b = currentBid(u);
      body.appendChild(el('tr', {}, [
        el('td', { text: p.name }), el('td', { text: X.money(p.balance) }),
        el('td', { text: String(winsOf(u)) }), el('td', { text: cardCounts(u) }),
        el('td', { text: b ? X.money(b.amount) : '-' })
      ]));
    });
    // Rebuild the player drop-downs only when the set of players changes, so typing isn't interrupted.
    var key = ids.map(function (u) { return u + ':' + state.players[u].name; }).join('|');
    if (key !== playerKey) {
      playerKey = key;
      fillSelect($('selPlayer'), ids.map(function (u) { return [u, state.players[u].name]; }), null);
      fillSelect($('annTo'), [['all', 'Everyone']].concat(ids.map(function (u) { return [u, state.players[u].name]; })), 'all');
    }
  }
  function fillSelect(sel, opts, fallback) {
    var prev = sel.value;
    sel.textContent = '';
    opts.forEach(function (o) { sel.appendChild(el('option', { value: o[0], text: o[1] })); });
    var has = opts.some(function (o) { return o[0] === prev; });
    if (has) sel.value = prev; else if (fallback) sel.value = fallback;
  }

  function adjust(sign) {
    say('walletErr', '');
    var u = $('selPlayer').value, n = Math.floor(Number($('amtIn').value));
    if (!u || !state.players[u]) return say('walletErr', 'Pick a player.');
    if (!(n >= 1)) return say('walletErr', 'Enter a whole dollar amount.');
    var nb = state.players[u].balance + sign * n;
    if (nb < 0) return say('walletErr', state.players[u].name + ' only has ' + X.money(state.players[u].balance) + '.');
    S.set(base() + '/players/' + u + '/balance', nb).then(function () { $('amtIn').value = ''; })
      .catch(function (e) { say('walletErr', (e && e.message) || String(e)); });
  }
  $('payBtn').addEventListener('click', function () { adjust(1); });
  $('chargeBtn').addEventListener('click', function () { adjust(-1); });

  $('giveBtn').addEventListener('click', function () {
    var u = $('selPlayer').value, idx = $('cardType').value, custom = $('cardCustom').value.trim();
    if (!u) return say('giveMsg', 'Pick a player first.');
    var card;
    if (custom) card = { name: custom.slice(0, 30), desc: '' };
    else if (idx !== '') card = { name: CARD_PRESETS[idx][0], desc: CARD_PRESETS[idx][1] };
    else return say('giveMsg', 'Choose a card or type a custom name.');
    card.used = false; card.ts = Date.now();
    S.push(base() + '/cards/' + u, card).then(function () {
      say('giveMsg', 'Gave ' + card.name + ' to ' + state.players[u].name + '.', true);
      $('cardCustom').value = '';
    }).catch(function (e) { say('giveMsg', (e && e.message) || String(e)); });
  });

  /* ---------- auction ---------- */
  function renderItem() {
    var it = state.item, s = $('itemState');
    if (!it) { s.textContent = 'No item up.'; return; }
    s.textContent = (it.open ? 'OPEN: ' : 'CLOSED: ') + it.name +
      (it.soldTo ? ' (sold to ' + it.soldTo + ' for ' + X.money(it.price) + ')' : '');
  }

  function renderBids() {
    var box = $('bidList'); box.textContent = '';
    var it = state.item;
    if (!it) return;
    var rows = Object.keys(state.bids).filter(function (u) {
      return state.bids[u] && state.bids[u].itemId === it.id && state.players[u];
    }).map(function (u) {
      var b = state.bids[u];
      return { u: u, amount: b.amount, ts: b.ts, eff: b.amount * (doubled[u] ? 2 : 1) };
    }).sort(function (a, b) { return b.eff - a.eff || a.ts - b.ts; });
    if (!rows.length) { box.appendChild(el('p', { class: 'small', text: it.open ? 'No bids yet.' : 'No bids were placed.' })); return; }
    rows.forEach(function (r, i) {
      var p = state.players[r.u], wins = winsOf(r.u), afford = p.balance >= r.amount;
      var label = [el('strong', { text: p.name }), ' ' + X.money(r.amount)];
      if (doubled[r.u]) label.push(el('span', { class: 'pill', text: 'counts ' + X.money(r.eff) }));
      var gf = it.giftId && state.gifts[it.giftId];
      if (gf && gf.ownerUid === r.u) label.push(el('span', { class: 'pill warn', text: 'own gift' }));
      if (wins >= 3) label.push(el('span', { class: 'pill warn', text: '3-win cap' }));
      if (!afford) label.push(el('span', { class: 'pill warn', text: 'can’t afford' }));
      var sellBtn = el('button', { type: 'button', class: 'alt', text: 'Sell', onclick: function () { sell(r.u, r.amount); } });
      if (!afford) sellBtn.disabled = true;
      var btns = el('div', { class: 'formrow' }, [
        el('button', { type: 'button', class: 'ghost', text: '\u00d72', onclick: function () { doubled[r.u] = !doubled[r.u]; renderBids(); } }),
        sellBtn
      ]);
      box.appendChild(el('div', { class: 'bidrow' + (i === 0 ? ' top' : '') }, [el('div', {}, label), btns]));
    });
  }

  $('putUpBtn').addEventListener('click', function () {
    say('auctionErr', '');
    var name = $('itemNameIn').value.trim();
    if (!name) return say('auctionErr', 'Give the item a name.');
    doubled = {};
    var upd = { item: { id: S.newKey(), name: name.slice(0, 60), clue: $('itemClueIn').value.trim().slice(0, 80), open: true, ts: Date.now() }, bids: null };
    releasePrev(upd);
    S.update(base(), upd).then(function () { $('itemNameIn').value = ''; $('itemClueIn').value = ''; })
      .catch(function (e) { say('auctionErr', (e && e.message) || String(e)); });
  });
  $('closeBtn').addEventListener('click', function () {
    if (!state.item) return;
    S.set(base() + '/item/open', false).catch(function (e) { say('auctionErr', (e && e.message) || String(e)); });
  });
  $('noSaleBtn').addEventListener('click', function () {
    if (!state.item) return;
    var upd = { 'item/open': false, bids: null };
    releasePrev(upd);
    S.update(base(), upd).catch(function (e) { say('auctionErr', (e && e.message) || String(e)); });
  });

  function sell(winner, price) {
    say('auctionErr', '');
    var p = state.players[winner], it = state.item;
    if (!p || !it) return;
    if (p.balance < price) return say('auctionErr', p.name + ' can’t afford that.');
    var upd = {};
    upd['players/' + winner + '/balance'] = p.balance - price;
    var sale = { item: it.name, winnerUid: winner, winnerName: p.name, price: price, ts: Date.now() };
    if (it.giftId) { sale.giftId = it.giftId; upd['gifts/' + it.giftId + '/status'] = 'sold'; }
    upd['sold/' + S.newKey()] = sale;
    upd['item/open'] = false;
    upd['item/soldTo'] = p.name;
    upd['item/price'] = price;
    upd['bids'] = null;
    S.update(base(), upd).catch(function (e) { say('auctionErr', (e && e.message) || String(e)); });
  }


  /* ---------- gift pool ---------- */
  function ownerName(g) {
    if (g.ownerUid === uid) return 'Host';
    return state.players[g.ownerUid] ? state.players[g.ownerUid].name : 'a guest';
  }
  function poolKeys() {
    return Object.keys(state.gifts).filter(function (k) { return state.gifts[k].status === 'pool'; })
      .sort(function (a, b) { return state.gifts[a].ts - state.gifts[b].ts; });
  }
  function renderPool() {
    var box = $('giftPool'); box.textContent = '';
    var keys = poolKeys(), total = Object.keys(state.gifts).length;
    $('poolSummary').textContent = total
      ? keys.length + ' waiting, ' + (total - keys.length) + ' already up or sold.'
      : 'No gifts registered yet. Guests add theirs on their phones.';
    $('randomGift').disabled = !keys.length;
    keys.forEach(function (k) {
      var g = state.gifts[k];
      var lines = [el('strong', { text: g.hidden ? 'Hidden gift' : g.desc }),
        el('div', { class: 'small', text: 'from ' + ownerName(g) })];
      box.appendChild(el('div', { class: 'bidrow' }, [
        el('div', {}, lines),
        el('button', { type: 'button', text: 'Put up', onclick: function () { putUpGift(k); } })
      ]));
    });
  }

  // Gift that was up but never sold goes back in the pool.
  function releasePrev(upd) {
    var prev = state.item;
    if (prev && prev.giftId && !prev.soldTo && state.gifts[prev.giftId] && state.gifts[prev.giftId].status === 'up') {
      upd['gifts/' + prev.giftId + '/status'] = 'pool';
    }
  }

  function putUpGift(key) {
    say('auctionErr', '');
    var g = state.gifts[key];
    if (!g || g.status !== 'pool') return;
    var released = state.item && state.item.giftId && !state.item.soldTo ? state.item.giftId : null;
    var name = g.desc;
    if (g.hidden) {
      var n = Object.keys(state.gifts).filter(function (k) {
        return state.gifts[k].hidden && state.gifts[k].status !== 'pool' && k !== key && k !== released;
      }).length + 1;
      name = 'Mystery gift #' + n;
    }
    doubled = {};
    var upd = {
      item: { id: S.newKey(), name: name, clue: $('itemClueIn').value.trim().slice(0, 80), open: true, ts: Date.now(), giftId: key, hidden: !!g.hidden },
      bids: null
    };
    releasePrev(upd);
    upd['gifts/' + key + '/status'] = 'up';
    S.update(base(), upd).then(function () { $('itemClueIn').value = ''; })
      .catch(function (e) { say('auctionErr', (e && e.message) || String(e)); });
  }

  $('randomGift').addEventListener('click', function () {
    var keys = poolKeys();
    if (keys.length) putUpGift(keys[Math.floor(Math.random() * keys.length)]);
  });

  $('hostGiftHidden').addEventListener('change', function () {
    $('hostGiftDesc').parentNode.hidden = this.checked;   // hidden gifts need no description
  });
  $('hostGiftAdd').addEventListener('click', function () {
    var hidden = $('hostGiftHidden').checked, text = $('hostGiftDesc').value.trim().slice(0, 60);
    if (!hidden && !text) return say('hostGiftMsg', 'Describe the gift, or tick Hidden.');
    var gift = { ownerUid: uid, hidden: hidden, status: 'pool', ts: Date.now() };
    if (!hidden) gift.desc = text;
    S.push(base() + '/gifts', gift).then(function () { $('hostGiftDesc').value = ''; say('hostGiftMsg', 'Added to the pool.', true); })
      .catch(function (e) { say('hostGiftMsg', (e && e.message) || String(e)); });
  });

  /* ---------- announcements ---------- */
  function send(text, to, kind) {
    text = String(text || '').trim();
    if (!text) return Promise.resolve();
    var path = to === 'all' ? '/announce/all' : '/announce/direct/' + to;
    return S.push(base() + path, { text: text.slice(0, 200), kind: kind || 'alert', ts: Date.now() });
  }

  $('annSend').addEventListener('click', function () {
    say('annErr', '');
    var text = $('annText').value.trim(), to = $('annTo').value, kind = $('annKind').value;
    var delay = Math.max(0, Math.floor(Number($('annDelay').value) || 0));
    if (!text) return say('annErr', 'Type a message first.');
    if (delay === 0) {
      send(text, to, kind).then(function () { $('annText').value = ''; say('annErr', 'Sent!', true); })
        .catch(function (e) { say('annErr', (e && e.message) || String(e)); });
    } else {
      schedule(text, to, kind, delay);
      $('annText').value = ''; $('annDelay').value = '0';
      say('annErr', 'Scheduled for ' + delay + ' min from now. Keep this page open.', true);
    }
  });

  function schedule(text, to, kind, minutes) {
    var q = { id: Math.random().toString(36).slice(2), text: text, to: to, kind: kind, at: Date.now() + minutes * 60000 };
    q.timer = setTimeout(function () {
      queue = queue.filter(function (x) { return x.id !== q.id; });
      renderQueue();
      send(q.text, q.to, q.kind);
    }, minutes * 60000);
    queue.push(q); renderQueue();
  }
  function renderQueue() {
    var list = $('queue'); list.textContent = '';
    if (!queue.length) {
      list.appendChild(el('li', { class: 'small', text: 'Nothing scheduled. Scheduled messages only send while this page stays open.' }));
      return;
    }
    queue.forEach(function (q) {
      var who = q.to === 'all' ? 'Everyone' : (state.players[q.to] ? state.players[q.to].name : 'a player');
      list.appendChild(el('li', {}, [
        el('time', { text: X.fmtTime(q.at) }), '→ ' + who + ': ' + q.text + ' ',
        el('button', { type: 'button', class: 'ghost', text: 'Cancel', onclick: function () {
          clearTimeout(q.timer); queue = queue.filter(function (x) { return x.id !== q.id; }); renderQueue();
        } })
      ]));
    });
  }
  function renderSent() {
    var list = $('sentLog'); list.textContent = '';
    var keys = Object.keys(state.annAll).sort(function (a, b) { return state.annAll[b].ts - state.annAll[a].ts; }).slice(0, 8);
    if (!keys.length) { list.appendChild(el('li', { class: 'small', text: 'Nothing sent yet.' })); return; }
    keys.forEach(function (k) {
      var a = state.annAll[k];
      list.appendChild(el('li', {}, [el('time', { text: X.fmtTime(a.ts) }), el('span', { class: 'kind ' + (a.kind || 'alert'), text: a.kind || 'alert' }), a.text]));
    });
  }

  /* hint ladder: typed by the host, stored only in this browser */
  function ladderLines() {
    return $('ladder').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function ladderIdx() { return Math.max(0, parseInt(X.ls.get('xmas-host-ladder-idx'), 10) || 0); }
  function renderLadder() {
    var lines = ladderLines(), box = $('ladderBtns'), idx = ladderIdx();
    box.textContent = '';
    lines.forEach(function (t, i) {
      box.appendChild(el('div', { class: 'formrow' }, [
        el('button', { type: 'button', class: 'alt', text: 'Send', onclick: function () { send(t, 'all', 'hint'); } }),
        el('span', { class: 'small', text: (i + 1) + '. ' + (t.length > 70 ? t.slice(0, 70) + '…' : t) })
      ]));
    });
    $('nextHintLabel').textContent = idx < lines.length ? 'Next up: #' + (idx + 1) : (lines.length ? 'All hints sent.' : 'Add hints above.');
    $('nextHint').disabled = idx >= lines.length;
  }
  $('ladder').addEventListener('input', function () { X.ls.set('xmas-host-ladder', $('ladder').value); renderLadder(); });
  $('nextHint').addEventListener('click', function () {
    var lines = ladderLines(), idx = ladderIdx();
    if (idx >= lines.length) return;
    send(lines[idx], 'all', 'hint').then(function () { X.ls.set('xmas-host-ladder-idx', String(idx + 1)); renderLadder(); });
  });

  /* ---------- events from players ---------- */
  function renderEvents() {
    var list = $('events'); list.textContent = '';
    var keys = Object.keys(state.events).sort(function (a, b) { return state.events[b].ts - state.events[a].ts; }).slice(0, 30);
    if (!keys.length) {
      list.appendChild(el('li', { class: 'small', text: 'Nothing yet. Steals, Shields and other plays show up here so you can rule on them.' }));
      return;
    }
    keys.forEach(function (k) {
      var e = state.events[k];
      list.appendChild(el('li', {}, [el('time', { text: X.fmtTime(e.ts) }), el('strong', { text: e.name }), ' ' + e.text]));
    });
  }

  /* ---------- end ---------- */
  $('endBtn').addEventListener('click', function () {
    if (!window.confirm('Delete room ' + room + ' and everything in it? This cannot be undone.')) return;
    S.remove(base()).then(function () {
      X.ls.del('xmas-host-room'); X.ls.del('xmas-host-ladder-idx');
      location.reload();
    }).catch(fatal);
  });
})();
