(function () {
  'use strict';
  var X = window.Xmas, el = X.el;
  var S = null, uid = null, room = '';
  var state = { players: {}, gifts: {}, ideas: {}, hosts: {}, names: {}, startMoney: 200 };
  var hostCode = '';
  var amounts = {};   // uid -> text typed in that row's amount box (kept across re-renders)

  function $(id) { return document.getElementById(id); }
  function fatal(e) { var f = $('fatal'); f.textContent = (e && e.message) ? e.message : String(e); f.hidden = false; }
  function say(id, t, ok) { var n = $(id); n.textContent = t || ''; n.className = ok ? 'ok' : 'err'; }

  /* ---------- boot ---------- */
  X.connect().then(function (store) {
    S = store; uid = S.uid; X.banner(S);
    $('hostCodeIn').value = X.genCode() + X.genCode().charAt(0);   // 6 random characters, editable
    var saved = X.cleanCode(X.ls.get('xmas-host-room') || '');
    if (saved) {
      $('resumeIn').value = saved;
      return isHost(saved).then(function (yes) { if (yes) startHost(saved); });
    }
  }).catch(fatal);

  // Hosts are listed under rooms/CODE/hosts. A room made before host codes has only meta.hostUid, so that
  // browser is added to the list the first time it resumes.
  function isHost(code) {
    return S.get('rooms/' + code + '/hosts/' + uid).then(function (yes) {
      if (yes === true) return true;
      return S.get('rooms/' + code + '/meta').then(function (m) {
        if (!m || m.hostUid !== uid) return false;
        return S.set('rooms/' + code + '/hosts/' + uid, true).then(function () { return true; });
      });
    });
  }

  // Take over hosting from another device: file the code, then ask to be listed as a host.
  // The database rules compare the code with the room's real one, so a wrong code is refused.
  function claimHost(code, secret) {
    var wrong = new Error('Wrong host code.');
    var claim = 'rooms/' + code + '/hostClaims/' + uid;
    var check = S.mode === 'demo'   // demo mode has no database rules, so check here
      ? S.get('rooms/' + code + '/hostCode').then(function (real) { if (real !== secret) throw wrong; })
      : Promise.resolve();
    return check.then(function () { return S.set(claim, secret); })
      .then(function () { return S.set('rooms/' + code + '/hosts/' + uid, true); })
      .then(function () { return S.remove(claim).catch(function () {}); },
        function (e) { S.remove(claim).catch(function () {}); throw wrong; });
  }

  function wholeDollars(id) {
    var n = Number($(id).value);
    return (n >= 1 && n <= 100000 && n % 1 === 0) ? n : 0;
  }

  $('createBtn').addEventListener('click', function () {
    if (!S) return;
    X.unlockAudio(); say('setupErr', '');
    var startMoney = wholeDollars('startMoneyIn'), giftCap = wholeDollars('giftCapIn');
    var secret = X.cleanCode($('hostCodeIn').value);
    if (!startMoney) return say('setupErr', 'Enter the starting auction money as a whole dollar amount.');
    if (!giftCap) return say('setupErr', 'Enter the gift cap as a whole dollar amount.');
    if (secret.length < 6) return say('setupErr', 'The host code needs 6 to 8 letters or numbers.');
    (function attempt(n) {
      var code = X.genCode();
      S.get('rooms/' + code + '/meta').then(function (m) {
        if (m) { if (n < 6) return attempt(n + 1); throw new Error('Could not find a free room code. Try again.'); }
        // Meta first (it names the creator), then the host code, then the host list.
        return S.set('rooms/' + code + '/meta', { hostUid: uid, created: Date.now(), startMoney: startMoney, giftCap: giftCap })
          .then(function () { return S.set('rooms/' + code + '/hostCode', secret); })
          .then(function () { return S.set('rooms/' + code + '/hosts/' + uid, true); })
          .then(function () { startHost(code); });
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
      return isHost(code).then(function (yes) {
        if (yes) return startHost(code);
        var secret = X.cleanCode($('resumeCodeIn').value);
        if (!secret) return say('setupErr', 'Enter the host code.');
        return claimHost(code, secret).then(function () { startHost(code); });
      });
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
    S.get(base() + '/hostCode').then(function (c) {
      hostCode = c || '';
      $('hostCodeShow').parentNode.hidden = !hostCode;   // rooms made before host codes have none
    }).catch(function () { $('hostCodeShow').parentNode.hidden = true; });
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
    sub('hosts', function (v) { state.hosts = v || {}; renderPool(); });
    sub('names', function (v) { state.names = v || {}; renderPool(); });
    sub('ideas', function (v) { state.ideas = v || {}; renderIdeas(); renderPlayers(); });
    sub('announce/all', renderAnnouncement);
  }

  /* ---------- host code: hidden until the host chooses to show it ---------- */
  $('hostCodeToggle').addEventListener('click', function () {
    var shown = this.textContent === 'Hide';
    $('hostCodeShow').textContent = shown ? '\u2022\u2022\u2022\u2022\u2022\u2022' : hostCode;
    this.textContent = shown ? 'Show' : 'Hide';
  });

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
    upd['names/' + u] = null;   // free the name so it can be used again
    gifts.forEach(function (k) { upd['gifts/' + k] = null; });
    ideas.forEach(function (k) { upd['ideas/' + k] = null; });
    S.update(base(), upd).catch(function (e) { say('playersErr', (e && e.message) || String(e)); });
  }

  /* ---------- party gifts: same cards as the player page; the host can remove any gift ---------- */
  function ownerName(g) {
    if (state.hosts[state.names[g.ownerUid]] === true) return 'Host';
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

  /* ---------- games: Caroling ----------
   * Lyrics are shown with one word highlighted. "Next" moves to the following word;
   * the host goes around the room and whoever misses the word loses. */
  (function () {
    var CAROLS = [
      ['Jingle Bells', [
        'Dashing through the snow\nIn a one-horse open sleigh\nO\'er the fields we go\nLaughing all the way\nBells on bobtail ring\nMaking spirits bright\nWhat fun it is to ride and sing\nA sleighing song tonight',
        'Jingle bells, jingle bells\nJingle all the way\nOh, what fun it is to ride\nIn a one-horse open sleigh\nJingle bells, jingle bells\nJingle all the way\nOh, what fun it is to ride\nIn a one-horse open sleigh'
      ]],
      ['We Wish You a Merry Christmas', [
        'We wish you a merry Christmas\nWe wish you a merry Christmas\nWe wish you a merry Christmas\nAnd a happy new year',
        'Good tidings we bring\nTo you and your kin\nGood tidings for Christmas\nAnd a happy new year',
        'Now bring us some figgy pudding\nNow bring us some figgy pudding\nNow bring us some figgy pudding\nAnd bring it right here',
        'We won\'t go until we get some\nWe won\'t go until we get some\nWe won\'t go until we get some\nSo bring it right here'
      ]],
      ['Deck the Halls', [
        'Deck the halls with boughs of holly\nFa la la la la, la la la la\nTis the season to be jolly\nFa la la la la, la la la la',
        'Don we now our gay apparel\nFa la la, la la la, la la la\nTroll the ancient Yuletide carol\nFa la la la la, la la la la',
        'See the blazing Yule before us\nFa la la la la, la la la la\nStrike the harp and join the chorus\nFa la la la la, la la la la',
        'Follow me in merry measure\nFa la la, la la la, la la la\nWhile I tell of Yuletide treasure\nFa la la la la, la la la la'
      ]]
    ];

    // Instrumental for each song above (same order). Pressing Start plays it while the host runs the game.
    var MUSIC = [
      { src: 'media/audio/jingle_bells.mp3', credit: '' },
      { src: 'media/audio/we_wish_you_a_merry_christmas.ogg', credit: 'Music: Kevin MacLeod, via Wikimedia Commons (public domain)' },
      { src: 'media/audio/deck_the_halls.ogg', credit: 'Music: United States Air Force Band, via Wikimedia Commons (public domain)' }
    ];
    var audio = null;

    function stopMusic() { if (audio) { audio.pause(); audio = null; } }
    function playMusic(i) {
      stopMusic();
      var b = document.querySelector('.musicbtn');   // pause the page's background music first
      if (b && b.getAttribute('aria-label') === 'Stop music') b.click();
      var a = new Audio(MUSIC[i].src);
      a.loop = true; a.volume = 1;
      a.addEventListener('error', function () {
        if (audio === a) { audio = null; $('carolCredit').textContent = 'No music file for this song yet, so it will play without music.'; }
      });
      audio = a;
      a.play().catch(function (e) {
        if (audio === a) { audio = null; $('carolCredit').textContent = 'Could not play the music: ' + ((e && e.message) || e); }
      });
    }

    var cur = 0, pos = -1, words = [];   // pos -1 = not started
    var pick = $('carolPick'), box = $('carolLyrics');

    function load(i) {
      stopMusic();
      cur = i; pos = -1; words = [];
      $('carolCredit').textContent = MUSIC[i].credit;
      box.textContent = '';
      CAROLS[i][1].forEach(function (stanza) {
        var st = el('div', { class: 'carol-stanza' });
        stanza.split('\n').forEach(function (line) {
          var ln = el('div', { class: 'carol-line' });
          line.split(' ').forEach(function (w, k) {
            var s = el('span', { class: 'carol-word', text: w });
            words.push(s); ln.appendChild(s);
            if (k < line.split(' ').length - 1) ln.appendChild(document.createTextNode(' '));
          });
          st.appendChild(ln);
        });
        box.appendChild(st);
      });
      $('carolNext').textContent = 'Start';
      $('carolNext').disabled = false;
      $('carolStatus').textContent = 'Pick the first player, then press Start.';
      Array.prototype.forEach.call(pick.children, function (b, k) { b.className = k === i ? '' : 'alt'; });
    }

    function show() {
      words.forEach(function (w, k) {
        w.className = 'carol-word' + (k === pos ? ' now' : k < pos ? ' done' : '');
      });
      if (pos >= 0 && words[pos]) words[pos].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    $('carolNext').addEventListener('click', function () {
      if (pos >= words.length - 1) return;
      if (pos === -1) playMusic(cur);   // Start: the song begins with the first word
      pos++; show();
      $('carolNext').textContent = 'Next word';
      if (pos === words.length - 1) {
        $('carolNext').disabled = true;
        stopMusic();
        $('carolStatus').textContent = 'That\'s the last word. Everybody survived!';
      } else {
        $('carolStatus').textContent = 'Word ' + (pos + 1) + ' of ' + words.length;
      }
    });
    $('carolRestart').addEventListener('click', function () { load(cur); });

    CAROLS.forEach(function (c, i) {
      pick.appendChild(el('button', { type: 'button', text: c[0], onclick: function () { load(i); } }));
    });
    load(0);
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
