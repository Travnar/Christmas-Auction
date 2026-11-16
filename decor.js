/* Feature flag: while true, anything marked data-dev-only (the Join a game / Host a party buttons)
 * stays hidden. Set to false to show them. */
var IN_DEVELOPMENT = true;
if (!IN_DEVELOPMENT) document.documentElement.classList.add('dev-off');

/* Lights */
(function(){
  var box=document.getElementById('lights'); if(!box) return;
  var n=Math.max(12,Math.floor(window.innerWidth/38));
  for(var i=0;i<n;i++){ var b=document.createElement('span'); b.className='bulb'; box.appendChild(b); }
})();

/* Snow (glyph flakes) */
(function(){
  var c=document.getElementById('snow'); if(!c) return;
  if(document.body.hasAttribute('data-calm')){ c.remove(); return; }
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){ c.remove(); return; }
  var ctx=c.getContext('2d'), w=0, h=0, flakes=[], i, glyphs=['\u2744','\u2745','\u2746','\u2022'];
  function size(){ w=c.width=window.innerWidth; h=c.height=window.innerHeight; }
  size(); window.addEventListener('resize',size);
  for(i=0;i<55;i++){ flakes.push({x:Math.random()*w,y:Math.random()*h,r:10+Math.random()*16,s:.5+Math.random()*1.3,d:Math.random()*6.28,g:glyphs[i%glyphs.length]}); }
  function tick(){
    ctx.clearRect(0,0,w,h);
    for(var k=0;k<flakes.length;k++){
      var f=flakes[k]; f.y+=f.s; f.d+=.012; f.x+=Math.sin(f.d)*.7;
      if(f.y>h+20){ f.y=-20; f.x=Math.random()*w; }
      ctx.font=f.r+'px sans-serif'; ctx.fillStyle='rgba(255,255,255,.95)'; ctx.strokeStyle='rgba(60,120,200,.55)'; ctx.lineWidth=1;
      ctx.strokeText(f.g,f.x,f.y); ctx.fillText(f.g,f.x,f.y);
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

/* Sparkle cursor trail (mouse only) */
(function(){
  if(document.body.hasAttribute('data-calm')) return;
  if(window.matchMedia && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches)) return;
  var last=0, cols=['#ffd400','#ff2a2a','#2aff6a','#2a8bff','#ff6bd6'];
  document.addEventListener('pointermove',function(e){
    var t=Date.now(); if(t-last<45) return; last=t;
    var s=document.createElement('span'); s.className='spark'; s.textContent='\u2726';
    s.style.left=e.clientX+'px'; s.style.top=e.clientY+'px'; s.style.color=cols[Math.floor(Math.random()*cols.length)];
    document.body.appendChild(s);
    requestAnimationFrame(function(){ s.style.transform='translate('+(Math.random()*30-15)+'px,'+(20+Math.random()*20)+'px) scale(.3)'; s.style.opacity='0'; });
    setTimeout(function(){ s.remove(); },850);
  });
})();

/* Scrolling banner: welcome text + countdown to Christmas Day, then the host's latest announcements
 * (for the room in ?room=CODE, or the room this browser joined/hosts). Each letter is its own <span>,
 * colored red / green / white in turn. */
(function () {
  var span = document.getElementById('marqueeText');
  if (!span) return;
  var WELCOME = '\u2605 WELCOME TO THE CHRISTMAS AUCTION \u2605';
  var SEP = ' \u2605 ';
  var ann = [];           // latest announcement texts, newest first
  var cells = [], text = null;

  function render(t) {
    if (t === text) return;
    if (text === null || t.length !== text.length) {
      span.textContent = ''; cells = [];
      var n = 0, i, e;
      for (i = 0; i < t.length; i++) {
        e = document.createElement('span');
        if (t.charAt(i) !== ' ') e.className = 'c' + (n++ % 3);
        span.appendChild(e); cells.push(e);
      }
      text = '';
    }
    for (var j = 0; j < t.length; j++) {
      if (t.charAt(j) !== text.charAt(j)) cells[j].textContent = t.charAt(j);
    }
    text = t;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function countdown() {
    var now = new Date(), y = now.getFullYear();
    var xmas = new Date(y, 11, 25);
    var endOfDay = new Date(y, 11, 26);
    if (now >= xmas && now < endOfDay) return 'MERRY CHRISTMAS!';
    if (now >= endOfDay) xmas = new Date(y + 1, 11, 25);
    var s = Math.floor((xmas - now) / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return d + (d === 1 ? ' DAY ' : ' DAYS ') + pad(h) + ':' + pad(m) + ':' + pad(sec) + ' UNTIL CHRISTMAS';
  }
  function tick() {
    var t = WELCOME + '   ' + countdown() + ' \u2605';
    if (ann.length) t += ' ' + ann.join(SEP) + ' \u2605';
    render(t);
  }
  tick();
  setInterval(tick, 1000);

  function roomCode() {
    var X = window.Xmas, q = '';
    try { q = new URLSearchParams(location.search).get('room') || ''; } catch (e) {}
    var c = q || (function () {
      try { return localStorage.getItem('xmas-play-room') || localStorage.getItem('xmas-host-room') || ''; } catch (e) { return ''; }
    })();
    return X && X.cleanCode ? X.cleanCode(c) : '';
  }
  var code = roomCode();
  if (!code || !window.Xmas) return;
  window.Xmas.connect().then(function (S) {
    S.on('rooms/' + code + '/announce/all', function (v) {
      v = v || {};
      ann = Object.keys(v).map(function (k) { return v[k]; })
        .filter(function (x) { return x && x.text; })
        .sort(function (x, y) { return y.ts - x.ts; }).slice(0, 3)
        .map(function (x) { return x.text; });
      tick();
    });
  }).catch(function () {});
})();

/* Background music: loops on every page at low volume, with a stop/play button.
 * Browsers block autoplay, so it starts on the first tap/click/keypress.
 * Position and stopped state carry across pages. */
(function () {
  var SRC = 'media/audio/jingle_bells.mp3', VOL = 0.2;
  var a = new Audio(SRC);
  a.loop = true; a.volume = VOL; a.preload = 'auto';
  function get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  var muted = get('xmas-music-muted') === '1';
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'musicbtn';
  function label() {
    btn.textContent = muted ? '▶' : '■';
    btn.setAttribute('aria-label', muted ? 'Play music' : 'Stop music');
    btn.title = btn.getAttribute('aria-label');
  }
  label();
  document.body.appendChild(btn);

  var pos = parseFloat(get('xmas-music-pos'));
  if (pos > 0) a.addEventListener('loadedmetadata', function () { if (pos < a.duration) a.currentTime = pos; }, { once: true });

  var started = false;
  function tryPlay() {
    if (muted || started) return;
    var p = a.play();
    if (p && p.then) p.then(function () { started = true; removeGestures(); }, function () {});
    else started = true;
  }
  function gesture() { tryPlay(); }
  var evs = ['pointerdown', 'keydown', 'touchstart'];
  function removeGestures() { evs.forEach(function (e) { window.removeEventListener(e, gesture, true); }); }
  evs.forEach(function (e) { window.addEventListener(e, gesture, true); });
  tryPlay();

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    muted = !muted; set('xmas-music-muted', muted ? '1' : '0');
    if (muted) { a.pause(); a.currentTime = 0; set('xmas-music-pos', '0'); } else { started = false; tryPlay(); }
    label();
  });
  function save() { if (!muted && !isNaN(a.currentTime)) set('xmas-music-pos', String(a.currentTime)); }
  setInterval(save, 1000);
  window.addEventListener('pagehide', save);
})();
