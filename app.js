/* Shared helpers + data store.
 * Two interchangeable stores:
 *   - demo:     everything lives in this browser (each tab acts as a different person)
 *   - firebase: Realtime Database + anonymous sign-in
 * Switch with firebase-config.js. */
(function () {
  'use strict';

  var cfg = window.XMAS_CONFIG || { demo: true };
  var FB_VER = '10.12.2';
  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- demo store (localStorage + BroadcastChannel) ---------- */
  function makeLocal() {
    var KEY = 'xmas-demo-db', data = {}, subs = [], chan = null, uid = null;
    try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { data = {}; }
    try { if ('BroadcastChannel' in window) chan = new BroadcastChannel('xmas-demo'); } catch (e) { chan = null; }
    try { uid = sessionStorage.getItem('xmas-uid'); } catch (e) { uid = null; }
    if (!uid) {
      uid = 'u_' + rid();
      try { sessionStorage.setItem('xmas-uid', uid); } catch (e) {}
    }

    function parts(p) { return String(p).split('/').filter(Boolean); }
    function getRaw(ps) {
      var o = data, i;
      for (i = 0; i < ps.length; i++) {
        if (o === null || typeof o !== 'object' || !(ps[i] in o)) return undefined;
        o = o[ps[i]];
      }
      return o;
    }
    function setRaw(ps, v) {
      var o = data, i, last;
      if (!ps.length) { data = (v && typeof v === 'object') ? clone(v) : {}; return; }
      for (i = 0; i < ps.length - 1; i++) {
        if (o[ps[i]] === null || typeof o[ps[i]] !== 'object') {
          if (v === null || v === undefined) return;
          o[ps[i]] = {};
        }
        o = o[ps[i]];
      }
      last = ps[ps.length - 1];
      if (v === null || v === undefined) delete o[last]; else o[last] = clone(v);
      for (i = ps.length - 1; i >= 1; i--) {
        var parent = getRaw(ps.slice(0, i));
        if (parent && typeof parent === 'object' && !Object.keys(parent).length) {
          delete getRaw(ps.slice(0, i - 1))[ps[i - 1]];
        } else break;
      }
    }
    function flush() {
      subs.slice().forEach(function (s) {
        var v = clone(getRaw(parts(s.path))), j = JSON.stringify(v);
        if (j !== s.last) { s.last = j; s.cb(v); }
      });
    }
    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
      if (chan) chan.postMessage(1);
      flush();
    }
    function reload() {
      try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { data = {}; }
      flush();
    }
    if (chan) chan.onmessage = reload;
    window.addEventListener('storage', function (e) { if (e.key === KEY) reload(); });

    return {
      mode: 'demo',
      uid: uid,
      newKey: rid,
      set: function (p, v) { setRaw(parts(p), v === undefined ? null : v); persist(); return Promise.resolve(); },
      update: function (p, o) {
        Object.keys(o).forEach(function (k) { setRaw(parts(p).concat(parts(k)), o[k]); });
        persist(); return Promise.resolve();
      },
      push: function (p, v) { var k = rid(); setRaw(parts(p).concat([k]), v); persist(); return Promise.resolve(k); },
      remove: function (p) { setRaw(parts(p), null); persist(); return Promise.resolve(); },
      get: function (p) { return Promise.resolve(clone(getRaw(parts(p)))); },
      on: function (p, cb) {
        var s = { path: p, cb: cb, last: undefined };
        subs.push(s);
        setTimeout(function () {
          if (subs.indexOf(s) < 0) return;
          var v = clone(getRaw(parts(p)));
          s.last = JSON.stringify(v);
          cb(v);
        }, 0);
        return function () { var i = subs.indexOf(s); if (i > -1) subs.splice(i, 1); };
      }
    };
  }

  /* ---------- Firebase store ---------- */
  async function makeFirebase() {
    var base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
    var A = await import(base + 'firebase-app.js');
    var Au = await import(base + 'firebase-auth.js');
    var D = await import(base + 'firebase-database.js');
    var app = A.initializeApp(cfg.firebase);
    var auth = Au.getAuth(app);
    var cred = await Au.signInAnonymously(auth);
    var db = D.getDatabase(app);
    return {
      mode: 'firebase',
      uid: cred.user.uid,
      newKey: function () { return D.push(D.ref(db, '_keys')).key; },
      set: function (p, v) { return D.set(D.ref(db, p), v === undefined ? null : v); },
      update: function (p, o) { return D.update(D.ref(db, p), o); },
      push: async function (p, v) { var r = D.push(D.ref(db, p)); await D.set(r, v); return r.key; },
      remove: function (p) { return D.remove(D.ref(db, p)); },
      get: async function (p) { return (await D.get(D.ref(db, p))).val(); },
      on: function (p, cb) {
        return D.onValue(D.ref(db, p), function (s) { cb(s.val()); },
          function (err) { console.warn('Read denied or failed:', p, err); cb(null); });
      }
    };
  }

  var pending = null;
  function connect() {
    if (pending) return pending;
    pending = (async function () {
      if (cfg.demo) return makeLocal();
      var f = cfg.firebase;
      if (!f || !f.apiKey || /YOUR_/.test(f.apiKey) || !f.databaseURL || /YOUR_/.test(f.databaseURL)) {
        throw new Error('Firebase is not set up yet. Fill in firebase-config.js, or set demo: true to try it locally.');
      }
      return makeFirebase();
    })();
    return pending;
  }

  /* ---------- small helpers ---------- */
  // Builds DOM with textContent only, so guest-typed names can never inject markup.
  function el(tag, props, kids) {
    var e = document.createElement(tag), k;
    if (props) {
      for (k in props) {
        if (k === 'class') e.className = props[k];
        else if (k === 'text') e.textContent = props[k];
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]);
        else e.setAttribute(k, props[k]);
      }
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function money(n) { return '$' + (Number(n) || 0); }
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  // Write text one letter per <span>, colored red / green / white in turn like the banner.
  function tricolor(node, text) {
    node.textContent = '';
    if (node.classList) node.classList.add('tricolor');
    var n = 0;
    String(text).split('').forEach(function (ch) {
      var s = document.createElement('span');
      if (ch !== ' ') s.className = 'c' + (n++ % 3);
      s.textContent = ch;
      node.appendChild(s);
    });
  }
  // Case-insensitive, database-safe key for a player name, so "Greg" and "greg " count as the same name.
  function nameKey(name) {
    var s = String(name || '').trim().toLowerCase().replace(/\s+/g, ' '), out = '', i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      out += /[a-z0-9]/.test(ch) ? ch : '_' + s.charCodeAt(i).toString(16);
    }
    return out;
  }
  // Announcement list (an object of pushed {text, ts}) as an array, newest first.
  function announcements(v) {
    v = v || {};
    return Object.keys(v).map(function (k) { return v[k]; })
      .filter(function (a) { return a && a.text; })
      .sort(function (a, b) { return b.ts - a.ts; });
  }
  function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
  function genCode() {
    var s = '', i;
    for (i = 0; i < 5; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    return s;
  }
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function banner(store) {
    if (store.mode !== 'demo' || document.getElementById('demobar')) return;
    var b = el('div', { class: 'demobar', id: 'demobar', text: 'DEMO MODE: data stays in this browser only. Each tab acts as a different person. Edit firebase-config.js to go live.' });
    document.body.insertBefore(b, document.body.firstChild);
  }

  var actx = null;
  function unlockAudio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }
  function beep() {
    try {
      if (!actx) return;
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.25);
    } catch (e) {}
  }

  window.Xmas = {
    connect: connect, el: el, money: money, fmtTime: fmtTime, cleanCode: cleanCode,
    genCode: genCode, announcements: announcements, nameKey: nameKey, tricolor: tricolor, ls: ls, banner: banner, unlockAudio: unlockAudio, beep: beep
  };
})();
