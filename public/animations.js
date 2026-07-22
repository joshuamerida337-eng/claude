/* AI Free for Boomers — site animations (production-ready)
 * Drop into any static site: <script src="/animations.js" defer></script> at the end of <body>.
 * No dependencies. Respects prefers-reduced-motion. Works on GoDaddy / Cloudflare Pages as-is.
 */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var css = [
    'html{scroll-behavior:smooth}',
    '@keyframes afb-headerDown{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:none}}',
    'header{animation:afb-headerDown .55s ease-out both}',
    '@keyframes afb-heroRise{to{opacity:1;transform:none}}',
    'h1{opacity:0;transform:translateY(14px);animation:afb-heroRise .95s cubic-bezier(.2,.7,.2,1) .18s forwards}',
    '@keyframes afb-blinkCursor{50%{opacity:0}}',
    '@keyframes afb-fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '.afb-reveal{opacity:0;transform:translateY(26px);transition:opacity .65s ease-out,transform .65s ease-out;will-change:opacity,transform}',
    '.afb-reveal.afb-in{opacity:1;transform:none}',
    '.afb-cascade{opacity:0;transform:translateY(22px);transition:opacity .6s ease-out,transform .6s ease-out}',
    '.afb-cascade.afb-in{opacity:1;transform:none}',
    'button,a{transition:transform .18s ease,box-shadow .18s ease,background-color .18s ease}',
    '.afb-cta:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(245,179,1,.35)}',
    'input[type=email],input[type=text],textarea{transition:box-shadow .18s ease,border-color .18s ease}',
    'input[type=email]:focus,input[type=text]:focus,textarea:focus{outline:none;box-shadow:0 0 0 4px rgba(245,179,1,.28)}'
  ].join('\n');
  var s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('afb-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  // Sections fade+rise in as they scroll into view
  document.querySelectorAll('section').forEach(function (el) {
    el.classList.add('afb-reveal'); io.observe(el);
  });

  // Cards inside grids cascade in, 100ms apart
  document.querySelectorAll('[data-cascade-group], .afb-grid').forEach(function (grid) {
    Array.prototype.forEach.call(grid.children, function (el, i) {
      el.classList.add('afb-cascade');
      el.style.transitionDelay = (i % 4) * 100 + 'ms';
      io.observe(el);
    });
  });
})();
/* Usage notes:
 * - Add class "afb-cta" to gold CTA buttons/links for the hover lift + gold shadow.
 * - Add attribute data-cascade-group (or class "afb-grid") to any card grid whose
 *   children should stagger in 100ms apart.
 * - Sections animate automatically; no markup changes needed for them.
 * - Demo-card typewriter caret uses: animation: afb-blinkCursor 1s step-end infinite
 * - Demo-card answer reveal uses:   animation: afb-fadeUp .4s ease both
 */
