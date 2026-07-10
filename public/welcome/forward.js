// Deep-link forwarder (docs/WEBSITE.md §routing). Game-bound query params that used
// to live at the root (replay shares, Stripe checkout returns) now arrive HERE via
// the / → /welcome/ redirect — send them on to the game so old links keep working.
// A separate file (not inline) because the site CSP is script-src 'self'.
if (/[?&](replay|checkout|session_id)=/.test(location.search)) {
  location.replace('/play' + location.search + location.hash);
}
