// ASSIMILATE marketing site runtime (docs/WEBSITE.md) — vanilla, deferred, tiny. Three jobs:
//   1. The LIVING BACKGROUND: slow procedural veins + drifting spores on #bio-bg (the game's
//      visual DNA leaking into the site). Reduced-motion → a single static frame. Pauses when
//      the tab is hidden.
//   2. Client-side SEARCH on /blog/ and /news/: filters the pre-rendered entries by text/tags —
//      the content is already in the HTML (SEO first), JS only hides non-matches.
//   3. ADS: fills .ad-slot containers only when a provider is configured (set-ads); slots stay
//      hidden otherwise — no empty boxes, no layout shift, nothing inside gameplay.
(function () {
  'use strict';

  // ── year stamp ──
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  // ── legacy link forwarding (home only): old root share links → the game at /play/ ──
  if (location.pathname === '/' && /[?&](replay|daily|checkout|session_id)=/.test(location.search)) {
    location.replace('/play/' + location.search + location.hash);
    return;
  }
  // Installed-PWA users whose manifest predates the /play/ move land here in standalone mode —
  // send them straight into the game they installed.
  if (location.pathname === '/' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    location.replace('/play/');
    return;
  }

  // ── living background ──
  var cv = document.getElementById('bio-bg');
  if (cv && cv.getContext) {
    var ctx = cv.getContext('2d');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 0, H = 0, raf = 0;
    function h01(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
    function size() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
    size();
    addEventListener('resize', size);
    function frame(nowMs) {
      var t = nowMs / 1000;
      ctx.clearRect(0, 0, W, H);
      // veins: slow quadratic filaments rooted at the bottom corners
      ctx.lineCap = 'round';
      for (var i = 0; i < 7; i++) {
        var x0 = (i % 2 ? W : 0), y0 = H * (0.6 + h01(i) * 0.4);
        var sway = Math.sin(t * 0.12 + i * 2.1) * 40;
        var x1 = W * (0.2 + h01(i * 3.3) * 0.6), y1 = H * (0.25 + h01(i * 7.1) * 0.5);
        ctx.strokeStyle = 'rgba(182,232,74,' + (0.03 + h01(i * 5) * 0.03) + ')';
        ctx.lineWidth = 1.5 + h01(i * 9) * 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + sway, (y0 + y1) / 2, x1, y1);
        ctx.stroke();
      }
      // spores: two parallax layers drifting up
      for (var k = 0; k < 46; k++) {
        var z = 0.4 + h01(k * 8.3) * 0.6;
        var sx = (h01(k * 2.9) * W + t * 5 * z) % W;
        var sy = H - ((h01(k * 4.7) * H + t * 9 * z) % (H + 20));
        var tw = 0.5 + 0.5 * Math.sin(t * (0.5 + z) + k);
        ctx.fillStyle = (k % 3 === 0 ? 'rgba(122,209,255,' : 'rgba(201,139,255,') + 0.10 * z * tw + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, 0.8 + z * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () {
      if (reduced) return;
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(frame);
    });
  }

  // ── search (blog + patch notes): filter pre-rendered [data-search] rows ──
  var box = document.querySelector('[data-search-input]');
  if (box) {
    var rows = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));
    var empty = document.querySelector('.search-empty');
    box.addEventListener('input', function () {
      var q = box.value.trim().toLowerCase();
      var hits = 0;
      rows.forEach(function (r) {
        var hit = q === '' || r.getAttribute('data-search').indexOf(q) >= 0;
        r.style.display = hit ? '' : 'none';
        if (hit) hits++;
      });
      if (empty) empty.style.display = hits === 0 ? 'block' : 'none';
    });
  }

  // ── ads (docs/WEBSITE.md §ads) — provider is stamped by `npm run set-ads` ──
  var AD_PROVIDER = 'none';
  var AD_CLIENT = ''; // AdSense publisher id (set-ads)
  var slots = document.querySelectorAll('.ad-slot[data-ad-slot]');
  if (AD_PROVIDER === 'none' || slots.length === 0) return; // slots ship hidden
  slots.forEach(function (el) {
    el.hidden = false;
    // Provider-specific render goes here (e.g. AdSense ins/push with AD_CLIENT + the
    // per-slot unit id mapped from el.dataset.adSlot). Containers are labelled
    // "Advertisement" in CSS — content and ads are never mistakable for each other.
    void AD_CLIENT;
  });
})();
