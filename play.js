(function () {
  'use strict';
  var X = window.Xmas, el = X.el;
  var S = null, uid = null, room = '';
  var state = { players: {}, gifts: {}, ideas: {}, hostUid: '' };
  var subscribed = false;
  var annSeen = null;   // timestamp of the newest announcement already seen

  function $(id) { return document.getElementById(id); }
  function fatal(e) {
    var f = $('fatal');
    f.textContent = (e && e.message) ? e.message : String(e);
    f.hidden = false;
  }
  function joinErr(t) { $('joinErr').textContent = t || ''; }

  // Random placeholders from Christmas movies and lore.
  var GIFT_IDEAS = [
    'Red Ryder BB Gun', 'Jelly of the Month Club Membership', 'Turbo Man Action Figure', 'Leg Lamp',
    'Pink Bunny Suit', 'Bell from Santa’s Sleigh', 'Little Orphan Annie Decoder Pin', 'Zuzu’s Petals',
    'Polar Express Golden Ticket', 'Cousin Eddie’s RV', 'Kevin’s Tarantula', 'Buddy’s Etch A Sketch',
    'Ugly Christmas Sweater', 'Lump of Coal', 'Who-pudding', 'Snow Globe', 'Charlie Brown’s Tree'
  ];
  var NAME_IDEAS = [
    'Mrs. Claus', 'Santa Claus', 'Buddy the Elf', 'Scott Calvin', 'Hans Gruber', 'Kevin McCallister',
    'Clark Griswold', 'Cousin Eddie', 'Ralphie Parker', 'The Grinch', 'Cindy Lou Who', 'George Bailey',
    'Clarence the Angel', 'Jack Skellington', 'Rudolph', 'Frosty the Snowman', 'Ebenezer Scrooge', 'Tiny Tim',
    'Hermey the Elf', 'Kris Kringle', 'Jovie', 'Old Man Marley'
  ];
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  var giftPlaceholder = 'e.g. ' + pick(GIFT_IDEAS);
  $('giftDesc').placeholder = giftPlaceholder;
  $('nameIn').placeholder = 'e.g. ' + pick(NAME_IDEAS);
  var ideaPlaceholder = 'e.g. ' + pick(GIFT_IDEAS);
  $('ideaText').placeholder = ideaPlaceholder;

  /* ---------- boot ---------- */
  X.connect().then(function (store) {
    S = store; uid = S.uid; X.banner(S);
    var qs = new URLSearchParams(location.search);
    var r = X.cleanCode(qs.get('room') || X.ls.get('xmas-play-room') || '');
    $('roomIn').value = r;
    $('nameIn').value = X.ls.get('xmas-play-name') || '';
    if (r) {
      // The room's host gets a way back to the control room.
      S.get('rooms/' + r + '/meta').then(function (m) { if (m && m.hostUid === uid) $('hostBack').hidden = false; }).catch(function () {});
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
        if (p && p.name) { start(code, p.name); return; }   // this browser already joined: just resume
        // A name is unique within a room. Claim it first (the database refuses a second claim), then join.
        var key = X.nameKey(name), taken = 'The name “' + name + '” is already taken in this room. Pick a different one.';
        if (!key) { joinErr('Enter a name.'); return; }
        return S.get('rooms/' + code + '/names/' + key).then(function (owner) {
          if (owner && owner !== uid) { joinErr(taken); return; }
          return S.set('rooms/' + code + '/names/' + key, uid).catch(function () { throw new Error(taken); }).then(function () {
            return S.set('rooms/' + code + '/players/' + uid, { name: name, nameKey: key, balance: meta.startMoney || 200, joined: Date.now() });
          }).then(function () { start(code, name); });
        });
      });
    }).catch(function (err) { joinErr((err && err.message && /already taken/.test(err.message)) ? err.message : 'Could not join: ' + ((err && err.message) || err)); });
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
    joinErr('');
    if (subscribed) return;   // already listening (e.g. rejoining after being removed)
    subscribed = true;

    S.get('rooms/' + room + '/meta').then(function (m) {
      state.hostUid = (m && m.hostUid) || '';
      if (m && m.giftCap) {
        $('giftCap').textContent = '';
        $('giftCap').appendChild(el('strong', { text: 'Gift cap: ' + X.money(m.giftCap) }));
        $('giftCap').appendChild(document.createTextNode(' Bring any mix of gifts that adds up to this in total.'));
        $('giftCap').hidden = false;
      }
      if (state.hostUid === uid) $('hostBack').hidden = false;
      renderGifts();
    }).catch(function () {});
    sub('players', function (v) {
      state.players = v || {};
      if (!state.players[uid] && !$('game').hidden) {
        // The host removed this player: back to the join form.
        $('game').hidden = true; $('joinBox').hidden = false;
        joinErr('The host removed you from this room.');
        return;
      }
      renderWallet(); renderGifts();
    });
    sub('gifts', function (v) { state.gifts = v || {}; renderGifts(); });
    sub('ideas', function (v) { state.ideas = v || {}; renderIdeas(); });
    sub('announce/all', renderAnnouncements);
  }

  function myBal() { var p = state.players[uid]; return p ? p.balance : 0; }
  function giftFrom(g) {
    if (g.ownerUid === state.hostUid) return 'Host';
    return state.players[g.ownerUid] ? state.players[g.ownerUid].name : 'a guest';
  }

  function renderWallet() {
    X.tricolor($('bal'), X.money(myBal()));
  }

  /* ---------- my gifts ---------- */
  function giftMsg(t, ok) { var n = $('giftMsg'); n.textContent = t || ''; n.className = ok ? 'ok' : 'err'; }

  $('giftHidden').addEventListener('change', function () {
    var hid = this.checked;
    // Hidden gifts need no description, so the box is greyed out rather than removed.
    $('giftDesc').disabled = hid;
    $('giftDesc').placeholder = hid ? 'Mystery gift: no description needed' : giftPlaceholder;
    if (hid) $('giftDesc').value = '';
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
      if (!hidden) { giftPlaceholder = 'e.g. ' + pick(GIFT_IDEAS); $('giftDesc').placeholder = giftPlaceholder; }
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
    $('poolSummary').textContent = String(keys.length);
    if (!keys.length) box.appendChild(el('p', { class: 'small', text: 'No gifts added yet. Add yours above.' }));
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

  /* ---------- ideas: anonymous gift suggestions (the owner is stored only so they can remove their own) ---------- */
  function ideaMsg(t, ok) { var n = $('ideaMsg'); n.textContent = t || ''; n.className = ok ? 'ok' : 'err'; }

  $('ideaForm').addEventListener('submit', function (e) {
    e.preventDefault();
    ideaMsg('');
    var text = $('ideaText').value.trim().slice(0, 80);
    if (!text) return ideaMsg('Type an idea first.');
    S.push('rooms/' + room + '/ideas', { ownerUid: uid, text: text, ts: Date.now() }).then(function () {
      $('ideaText').value = '';
      $('ideaText').placeholder = 'e.g. ' + pick(GIFT_IDEAS);
      ideaMsg('Added!', true);
    }).catch(function (err) { ideaMsg('Could not add: ' + ((err && err.message) || err)); });
  });

  function renderIdeas() {
    var box = $('ideaList'); box.textContent = '';
    var keys = Object.keys(state.ideas).sort(function (a, b) { return state.ideas[a].ts - state.ideas[b].ts; });
    $('ideaCount').textContent = String(keys.length);
    if (!keys.length) box.appendChild(el('p', { class: 'small', text: 'No ideas yet. Add the first one above.' }));
    keys.forEach(function (k) {
      var d = state.ideas[k], mine = d.ownerUid === uid;
      var title = [el('strong', { text: d.text })];
      if (mine) title.push(' ', el('span', { class: 'pill', text: 'Yours' }));
      var act = mine ? el('button', { type: 'button', class: 'ghost', text: 'Remove', onclick: function () {
        S.remove('rooms/' + room + '/ideas/' + k).catch(function (err) { ideaMsg('Could not remove: ' + ((err && err.message) || err)); });
      } }) : null;
      box.appendChild(el('div', { class: 'cardchip' }, [el('div', {}, title), act]));
    });
  }

  /* ---------- announcements: newest is on the banner, older ones are listed here ---------- */
  function renderAnnouncements(v) {
    var all = X.announcements(v), list = $('feed');
    if (all.length && annSeen !== null && all[0].ts !== annSeen) {
      try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
      X.beep();
    }
    annSeen = all.length ? all[0].ts : 0;
    list.textContent = '';
    var past = all.slice(1);
    if (!past.length) { list.appendChild(el('li', { class: 'small', text: 'Nothing yet.' })); return; }
    past.forEach(function (a) {
      list.appendChild(el('li', {}, [el('time', { text: X.fmtTime(a.ts) }), a.text]));
    });
  }
})();
