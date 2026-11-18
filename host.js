(function () {
  'use strict';
  var X = window.Xmas, el = X.el;
  var S = null, uid = null, room = '';
  var state = { players: {}, gifts: {}, ideas: {}, startMoney: 200 };
  var amounts = {};   // uid -> text typed in that row's amount box (kept across re-renders)

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

  function wholeDollars(id) {
    var n = Number($(id).value);
    return (n >= 1 && n <= 100000 && n % 1 === 0) ? n : 0;
  }

  $('createBtn').addEventListener('click', function () {
    if (!S) return;
    X.unlockAudio(); say('setupErr', '');
    var startMoney = wholeDollars('startMoneyIn'), giftCap = wholeDollars('giftCapIn');
    if (!startMoney) return say('setupErr', 'Enter the starting auction money as a whole dollar amount.');
    if (!giftCap) return say('setupErr', 'Enter the gift cap as a whole dollar amount.');
    (function attempt(n) {
      var code = X.genCode();
      S.get('rooms/' + code + '/meta').then(function (m) {
        if (m) { if (n < 6) return attempt(n + 1); throw new Error('Could not find a free room code. Try again.'); }
        return S.set('rooms/' + code + '/meta', { hostUid: uid, created: Date.now(), startMoney: startMoney, giftCap: giftCap }).then(function () { startHost(code); });
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
    X.tricolor($('roomCode'), code);
    $('joinLink').value = new URL('play.html?room=' + code, location.href).href;
    $('toPlayer').href = 'play.html?room=' + code;
    $('toPlayerBar').hidden = false;
    S.get(base() + '/meta').then(function (m) {
      m = m || {};
      state.startMoney = m.startMoney || 200;
      renderPlayers();
      X.tricolor($('statMoney'), X.money(m.startMoney || 200));
      if (m.giftCap) X.tricolor($('statCap'), X.money(m.giftCap));
      else $('statCap').parentNode.hidden = true;   // older rooms have no gift cap
    }).catch(function () {});

    sub('players', function (v) { state.players = v || {}; renderPlayers(); renderPool(); });
    sub('gifts', function (v) { state.gifts = v || {}; renderPool(); renderPlayers(); });
    sub('ideas', function (v) { state.ideas = v || {}; renderIdeas(); renderPlayers(); });
    sub('announce/all', renderAnnouncement);
  }

  /* ---------- room link ---------- */
  $('copyLink').addEventListener('click', function () {
    var inp = $('joinLink');
    var done = function () { $('copyMsg').textContent = 'Copied!'; setTimeout(function () { $('copyMsg').textContent = ''; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); });
    else { inp.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
  });

  /* ---------- players ---------- */
  function playerIds() {
    return Object.keys(state.players).sort(function (a, b) {
      return state.players[a].name.toLowerCase() < state.players[b].name.toLowerCase() ? -1 : 1;
    });
  }

  function renderPlayers() {
    var ids = playerIds(), body = $('playersBody');
    // The table is rebuilt on every change, so keep the cursor in an amount box the host is typing in.
    var ae = document.activeElement, focusUid = ae && ae.dataset && ae.dataset.amtFor, caret = focusUid ? ae.selectionStart : null;
    body.textContent = '';
    if (!ids.length) {
      body.appendChild(el('tr', {}, [el('td', { colspan: '5', class: 'small', text: 'Waiting for players to join…' })]));
    }
    ids.forEach(function (u) {
      var p = state.players[u];
      body.appendChild(el('tr', {}, [
        el('td', { text: p.name }),
        el('td', {}, [el('strong', { text: X.money(p.balance) })]),
        el('td', {}, [el('div', { class: 'money-cell' }, [
          amountBox(u),
          el('span', { class: 'money-btns' }, [
            customBtn(u, 1), customBtn(u, -1)
          ])
        ])]),
        el('td', { text: String(giftsOf(u).length) }),
        el('td', { class: 'right' }, [el('button', { type: 'button', class: 'ghost', text: 'Remove', onclick: function () { removePlayer(u); } })])
      ]));
    });
    if (focusUid) {
      var again = body.querySelector('[data-amt-for="' + focusUid + '"]');
      if (again) { again.focus(); try { again.setSelectionRange(caret, caret); } catch (e) {} }
    }
  }
  // The box defaults to 5% of the room's starting money (at least $1); the host can type any whole amount.
  function big() { return Math.max(1, Math.round(state.startMoney * 0.05)); }
  function amountBox(u) {
    return el('input', { type: 'number', class: 'amtbox', min: '1', step: '1', inputmode: 'numeric',
      placeholder: String(big()), value: amounts[u] || '', 'data-amt-for': u,
      'aria-label': 'Amount to add or subtract for ' + state.players[u].name,
      oninput: function () { amounts[u] = this.value; } });
  }
  function typedAmount(u) {
    var n = amounts[u] ? Math.floor(Number(amounts[u])) : big();
    return n >= 1 ? n : 0;
  }
  // + / − buttons that use whatever is typed in the row's amount box.
  function customBtn(u, sign) {
    var p = state.players[u], n = typedAmount(u);
    var b = el('button', { type: 'button', class: 'moneybtn ' + (sign > 0 ? 'plus' : 'minus'), text: sign > 0 ? '+' : '−',
      'aria-label': (sign > 0 ? 'Add the typed amount to ' : 'Subtract the typed amount from ') + p.name,
      onclick: function () {
        var amt = typedAmount(u);
        if (!amt) return say('playersErr', 'Enter a whole dollar amount.');
        if (p.balance + sign * amt < 0) return say('playersErr', p.name + ' only has ' + X.money(p.balance) + '.');
        adjustMoney(u, sign * amt);
      } });
    return b;
  }
  function adjustMoney(u, amt) {
    say('playersErr', '');
    var p = state.players[u];
    if (!p || p.balance + amt < 0) return;
    S.set(base() + '/players/' + u + '/balance', p.balance + amt).then(function () { amounts[u] = ''; }).catch(function (e) { say('playersErr', (e && e.message) || String(e)); });
  }
  function ideasOf(u) { return Object.keys(state.ideas).filter(function (k) { return state.ideas[k].ownerUid === u; }); }
  function giftsOf(u) { return Object.keys(state.gifts).filter(function (k) { return state.gifts[k].ownerUid === u; }); }

  // Removing a player also removes every gift they added, in one update.
  function removePlayer(u) {
    say('playersErr', '');
    var p = state.players[u];
    if (!p) return;
    var gifts = giftsOf(u), ideas = ideasOf(u), parts = [];
    if (gifts.length) parts.push(gifts.length + (gifts.length === 1 ? ' gift' : ' gifts'));
    if (ideas.length) parts.push(ideas.length + (ideas.length === 1 ? ' idea' : ' ideas'));
    var msg = 'Remove ' + p.name + ' from the room' + (parts.length ? ' and delete their ' + parts.join(' and ') : '') + '?';
    if (!window.confirm(msg)) return;
    var upd = {};
    upd['players/' + u] = null;
    gifts.forEach(function (k) { upd['gifts/' + k] = null; });
    ideas.forEach(function (k) { upd['ideas/' + k] = null; });
    S.update(base(), upd).catch(function (e) { say('playersErr', (e && e.message) || String(e)); });
  }

  /* ---------- party gifts: same cards as the player page; the host can remove any gift ---------- */
  function ownerName(g) {
    if (g.ownerUid === uid) return 'Host';
    return state.players[g.ownerUid] ? state.players[g.ownerUid].name : 'a guest';
  }
  function renderPool() {
    var box = $('giftPool'); box.textContent = '';
    var keys = Object.keys(state.gifts).sort(function (a, b) {
      var sa = state.gifts[a].status === 'sold' ? 1 : 0, sb = state.gifts[b].status === 'sold' ? 1 : 0;
      return sa - sb || state.gifts[a].ts - state.gifts[b].ts;
    });
    $('poolSummary').textContent = keys.length
      ? keys.length + (keys.length === 1 ? ' gift' : ' gifts') + ' added.'
      : 'No gifts added yet.';
    keys.forEach(function (k) {
      var g = state.gifts[k];
      var status = 'From ' + ownerName(g) + (g.status === 'up' ? ' · Up for bid now!' : g.status === 'sold' ? ' · Sold' : '');
      var info = el('div', {}, [el('div', {}, [el('strong', { text: g.hidden ? 'Mystery gift' : g.desc })]), el('div', { class: 'small', text: status })]);
      var del = el('button', { type: 'button', class: 'ghost', text: 'Remove', onclick: function () {
        if (!window.confirm('Remove ' + (g.hidden ? 'this mystery gift' : '“' + g.desc + '”') + ' from ' + ownerName(g) + '?')) return;
        say('poolErr', '');
        S.remove(base() + '/gifts/' + k).catch(function (e) { say('poolErr', (e && e.message) || String(e)); });
      } });
      box.appendChild(el('div', { class: 'cardchip' + (g.status === 'sold' ? ' sold' : '') }, [info, del]));
    });
  }

  /* ---------- ideas: anonymous, so no names are shown; the host can remove any ---------- */
  function renderIdeas() {
    var box = $('ideaList'); box.textContent = '';
    var keys = Object.keys(state.ideas).sort(function (a, b) { return state.ideas[a].ts - state.ideas[b].ts; });
    $('ideasSummary').textContent = keys.length
      ? keys.length + (keys.length === 1 ? ' idea' : ' ideas') + ' added.'
      : 'No ideas yet.';
    keys.forEach(function (k) {
      var d = state.ideas[k];
      var del = el('button', { type: 'button', class: 'ghost', text: 'Remove', onclick: function () {
        if (!window.confirm('Remove the idea “' + d.text + '”?')) return;
        say('ideasErr', '');
        S.remove(base() + '/ideas/' + k).catch(function (e) { say('ideasErr', (e && e.message) || String(e)); });
      } });
      box.appendChild(el('div', { class: 'cardchip' }, [el('div', {}, [el('strong', { text: d.text })]), del]));
    });
  }

  /* ---------- announcements: every message is kept; the newest is the one showing ---------- */
  function renderAnnouncement(v) {
    var a = X.announcements(v)[0];
    $('annCurrent').textContent = (a && a.text) ? a.text + ' (sent ' + X.fmtTime(a.ts) + ')' : 'Nothing yet.';
  }
  $('annSend').addEventListener('click', function () {
    say('annErr', '');
    var text = $('annText').value.trim().slice(0, 200);
    if (!text) return say('annErr', 'Type a message first.');
    S.push(base() + '/announce/all', { text: text, ts: Date.now() })
      .then(function () { $('annText').value = ''; say('annErr', 'Sent!', true); })
      .catch(function (e) { say('annErr', (e && e.message) || String(e)); });
  });

  /* ---------- games: Christmas movie trivia ----------
   * Each press of "New question" draws the next question from a shuffled deck,
   * so nothing repeats until every question has been asked. */
  (function () {
    var QS = [
      ['Home Alone', 'Which city does the McCallister family fly to for Christmas, leaving Kevin behind?', 'Paris, France.'],
      ['Home Alone', 'What are the two burglars known as?', 'The Wet Bandits (Harry and Marv).'],
      ['Home Alone', 'What is the name of the scary neighbor who turns out to be kind?', 'Old Man Marley.'],
      ['Home Alone 2: Lost in New York', 'Which famous New York hotel does Kevin stay at?', 'The Plaza Hotel.'],
      ['Elf', 'What does Buddy put on his spaghetti?', 'Maple syrup.'],
      ['A Christmas Story', 'What gift does Ralphie want more than anything?', 'A Red Ryder BB gun.'],
      ['A Christmas Story', 'What does Flick get his tongue stuck to after a triple-dog-dare?', 'A frozen flagpole.'],
      ['A Christmas Story', 'What does Ralphie’s father win that he calls “a major award”?', 'A leg lamp.'],
      ['A Christmas Story', 'Where does the Parker family eat Christmas dinner after the neighbors’ hounds eat the turkey?', 'A Chinese restaurant.'],
      ['A Christmas Story', 'What does the secret message from the Little Orphan Annie decoder pin turn out to be?', '“Be sure to drink your Ovaltine.”'],
      ['National Lampoon’s Christmas Vacation', 'What does Clark expect his Christmas bonus to pay for?', 'A swimming pool.'],
      ['How the Grinch Stole Christmas', 'What is the name of the Grinch’s dog?', 'Max.'],
      ['How the Grinch Stole Christmas', 'What is the name of the little Who girl who meets the Grinch?', 'Cindy Lou Who.'],
      ['It’s a Wonderful Life', 'What is the name of the angel who earns his wings by helping George Bailey?', 'Clarence.'],
      ['It’s a Wonderful Life', 'What happens every time a bell rings, according to Zuzu?', 'An angel gets his wings.'],
      ['The Polar Express', 'What does the boy get as a gift from Santa that only believers can hear?', 'A bell from Santa’s sleigh.'],
      ['The Santa Clause', 'What happens that forces Scott Calvin to take over as Santa?', 'Santa falls off his roof, and Scott puts on the suit.'],
      ['The Nightmare Before Christmas', 'What does Jack call Santa when he decides to take over Christmas?', '“Sandy Claws.”'],
      ['Rudolph the Red-Nosed Reindeer', 'What is the name of the place where unwanted toys live?', 'The Island of Misfit Toys.']
    ];

    var deck = [], n = 0;
    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    $('newBtn').addEventListener('click', function () {
      if (!deck.length) { deck = shuffle(QS.slice()); n = 0; }
      var q = deck.pop(); n++;
      X.tricolor($('triviaMovie'), q[0]); $('triviaMovie').hidden = false;
      $('triviaQ').textContent = q[1];
      $('triviaA').textContent = q[2];
      $('triviaCount').textContent = 'Question ' + n + ' of ' + QS.length;
      $('newBtn').textContent = 'Next question';
    });
  })();

  /* ---------- end ---------- */
  $('endBtn').addEventListener('click', function () {
    if (!window.confirm('Delete room ' + room + ' and everything in it? This cannot be undone.')) return;
    S.remove(base()).then(function () {
      X.ls.del('xmas-host-room');
      location.reload();
    }).catch(fatal);
  });
})();
