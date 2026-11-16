/* Theme switcher. Loaded in <head> so the saved theme is applied before first paint.
 * "minimal" is an alternative to the default festive look; the choice is remembered in localStorage.
 * A toggle button is added to the footer of every page that has one. */
(function () {
  var KEY = 'xmas-theme', root = document.documentElement;
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // A link like ?theme=modern (or ?theme=festive) picks the theme and remembers it for later pages.
  try {
    var q = (new URLSearchParams(location.search).get('theme') || '').toLowerCase();
    if (q === 'modern' || q === 'minimal') set('minimal');
    else if (q === 'festive') set('festive');
  } catch (e) {}

  if (get() === 'minimal') root.classList.add('minimal');

  // The modern theme swaps the clip-art tree for a simple flat SVG one.
  var FESTIVE_TREE = 'media/images/tree_art.png', MODERN_TREE = 'media/images/tree_minimal.svg';
  function swapTrees() {
    var to = root.classList.contains('minimal') ? MODERN_TREE : FESTIVE_TREE;
    var imgs = document.querySelectorAll('.hero img');
    for (var i = 0; i < imgs.length; i++) imgs[i].setAttribute('src', to);
  }

  document.addEventListener('DOMContentLoaded', function () {
    swapTrees();
    var footer = document.querySelector('footer');
    if (!footer) return;
    var p = document.createElement('p');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ghost themebtn';
    function label() {
      btn.textContent = root.classList.contains('minimal') ? 'Switch to festive theme' : 'Switch to modern theme';
    }
    label();
    btn.addEventListener('click', function () {
      var on = root.classList.toggle('minimal');
      set(on ? 'minimal' : 'festive');
      swapTrees();
      label();
    });
    p.appendChild(btn);
    footer.appendChild(p);
  });
})();
