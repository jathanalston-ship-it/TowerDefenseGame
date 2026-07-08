// Modular ad-container loader (docs/WEBSITE.md §ads). Every placement on the
// marketing site is a <div class="ad-slot" data-ad-slot="…"> — THIS file decides
// what fills them. With no provider configured (launch state) the slots hide
// themselves entirely: no empty boxes, no layout shift, no third-party requests.
//
// Wiring a provider later:
//   1. set AD_PROVIDER below (or replace this file with the network's loader),
//   2. add the network's script/frame hosts to the site CSP in public/_headers,
//   3. fill `mount` with the network's per-slot render call.
// The GAME never loads this file — display ads exist only on the website, and
// rewarded ads live behind src/ads/provider.ts inside non-combat menus.

(function () {
  var AD_PROVIDER = 'none';
  var AD_CLIENT = ''; // AdSense publisher id (set-ads) // 'none' hides all slots

  var slots = document.querySelectorAll('.ad-slot[data-ad-slot]');
  if (AD_PROVIDER === 'none') {
    slots.forEach(function (el) { el.hidden = true; });
    return;
  }

  function mount(el) {
    // Provider-specific render goes here, e.g.:
    //   window.someNetwork.display({ container: el, slot: el.dataset.adSlot });
    el.textContent = 'ad slot: ' + el.dataset.adSlot;
  }
  slots.forEach(mount);
})();
