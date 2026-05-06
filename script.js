(function () {
  'use strict';

  // ---------------- state ----------------
  var MAX_VIRUSES = 300;
  var ATTRACT_K = 5;
  var ATTRACT_RANGE = 340;
  var ATTRACT_FORCE = 120;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var hasClicked = false;

  var petri, hint, toast, tpl, linksSvg;
  var viruses = [];

  var config = {
    ca: '',
    twitterUrl: 'https://x.com',
    communityUrl: 'https://x.com',
    buyUrl: 'https://pump.fun',
    tweet_text: "$viruscoin just infected my wallet. this coin will spread. you can't stop it. 🦠"
  };

  // ---------------- helpers ----------------
  function $(id) { return document.getElementById(id); }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('show'); }, 1600);
  }

  function copy(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast('infected.'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast('infected.'); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  // ---------------- viruses ----------------
  function makeVirus(x, y, size) {
    var node = tpl.content.firstElementChild.cloneNode(true);
    var hue = randInt(-15, 30);
    var bri = rand(0.85, 1.15).toFixed(2);
    var op = rand(0.82, 1).toFixed(2);
    node.style.setProperty('--vsize', size + 'px');
    node.style.setProperty('--vop', op);
    node.style.setProperty('--lev-dur', rand(4.5, 7.0).toFixed(2) + 's');
    node.style.setProperty('--lev-delay', '-' + rand(0, 6).toFixed(2) + 's');
    node.style.setProperty('--virus-hue', hue + 'deg');
    node.style.setProperty('--virus-bri', bri);
    node.classList.add('spawning');
    setTimeout(function () { node.classList.remove('spawning'); }, 460);

    petri.appendChild(node);

    var entry = {
      el: node,
      baseX: x,
      baseY: y,
      size: size,
      attractX: 0,
      attractY: 0
    };
    positionVirus(entry);

    node.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      onVirusClick(entry, ev);
    });
    node.addEventListener('touchstart', function (ev) {
      ev.stopPropagation();
    }, { passive: true });

    viruses.push(entry);
    enforceCap();
    return entry;
  }

  function positionVirus(entry) {
    var x = entry.baseX + (entry.attractX || 0) - entry.size / 2;
    var y = entry.baseY + (entry.attractY || 0) - entry.size / 2;
    entry.el.style.left = x + 'px';
    entry.el.style.top = y + 'px';
  }

  function releaseVirus(v) {
    if (v.attractX === 0 && v.attractY === 0) return;
    v.attractX = 0;
    v.attractY = 0;
    v.el.style.transition = 'left 1.6s cubic-bezier(0.2,0.8,0.3,1), top 1.6s cubic-bezier(0.2,0.8,0.3,1), opacity 0.3s';
    positionVirus(v);
  }

  function enforceCap() {
    if (viruses.length <= MAX_VIRUSES) return;
    // remove smallest-size oldest first
    var sorted = viruses.slice().sort(function (a, b) {
      if (a.size !== b.size) return a.size - b.size;
      return 0;
    });
    var toRemove = viruses.length - MAX_VIRUSES;
    for (var i = 0; i < toRemove; i++) {
      var dead = sorted[i];
      dead.el.style.opacity = '0';
      dead.el.style.transform = 'scale(0.4)';
      setTimeout(function (el) { return function () { if (el.parentNode) el.parentNode.removeChild(el); }; }(dead.el), 320);
      var idx = viruses.indexOf(dead);
      if (idx >= 0) viruses.splice(idx, 1);
    }
  }

  function drawLink(x1, y1, x2, y2) {
    if (!linksSvg) return;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    var line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'link-line');
    line.style.setProperty('--len', len);
    linksSvg.appendChild(line);
    setTimeout(function () { if (line.parentNode) line.parentNode.removeChild(line); }, 1100);
  }

  function spawnInitialVirus() {
    var rect = petri.getBoundingClientRect();
    var cx = rect.width / 2;
    var cy = rect.height / 2;
    var size = Math.min(220, Math.max(140, Math.round(Math.min(rect.width, rect.height) * 0.28)));
    makeVirus(cx, cy, size);
  }

  function onVirusClick(entry, ev) {
    if (!hasClicked) {
      hasClicked = true;
      if (hint) hint.classList.add('hidden');
    }

    // pop animation on the clicked virus
    entry.el.classList.remove('popped');
    void entry.el.offsetWidth;
    entry.el.classList.add('popped');
    setTimeout(function () { entry.el.classList.remove('popped'); }, 360);

    // pulse glow at click
    var rect = petri.getBoundingClientRect();
    var clickX = ev.clientX - rect.left;
    var clickY = ev.clientY - rect.top;
    var pulse = document.createElement('div');
    pulse.className = 'pulse';
    pulse.style.left = (clickX - 30) + 'px';
    pulse.style.top = (clickY - 30) + 'px';
    petri.appendChild(pulse);
    setTimeout(function () { if (pulse.parentNode) pulse.parentNode.removeChild(pulse); }, 600);

    // spawn 1-3 new visual viruses anywhere across the hero, connected by glowing links
    var spawnN = randInt(1, 3);
    var marginX = 60;
    var marginY = 80;
    for (var i = 0; i < spawnN; i++) {
      var nx = rand(marginX, Math.max(marginX + 1, rect.width - marginX));
      var ny = rand(marginY, Math.max(marginY + 1, rect.height - marginY));
      // varied sizes: weighted buckets — small, medium, large
      var r = Math.random();
      var newSize;
      if (r < 0.18)      newSize = randInt(130, 190); // big
      else if (r < 0.55) newSize = randInt(70, 120);  // medium
      else               newSize = randInt(28, 60);   // small
      drawLink(clickX, clickY, nx, ny);
      makeVirus(nx, ny, newSize);
    }
  }

  // ---------------- magnetic attraction (K nearest within range) ----------------
  var rafPending = false;
  var lastMouse = null;

  function processAttract() {
    rafPending = false;
    if (!lastMouse) {
      for (var i = 0; i < viruses.length; i++) releaseVirus(viruses[i]);
      return;
    }
    var rect = petri.getBoundingClientRect();
    var mx = lastMouse.x - rect.left;
    var my = lastMouse.y - rect.top;

    var inRange = [];
    for (var j = 0; j < viruses.length; j++) {
      var v = viruses[j];
      var dx = mx - v.baseX;
      var dy = my - v.baseY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ATTRACT_RANGE) {
        inRange.push({ v: v, dist: dist, dx: dx, dy: dy });
      } else {
        releaseVirus(v);
      }
    }

    inRange.sort(function (a, b) { return a.dist - b.dist; });

    for (var k = 0; k < inRange.length; k++) {
      var c = inRange[k];
      if (k < ATTRACT_K && c.dist > 0.001) {
        var t = 1 - c.dist / ATTRACT_RANGE;
        var force = ATTRACT_FORCE * t * t;
        c.v.attractX = (c.dx / c.dist) * force;
        c.v.attractY = (c.dy / c.dist) * force;
        c.v.el.style.transition = 'left 0.4s cubic-bezier(0.2,0.8,0.3,1), top 0.4s cubic-bezier(0.2,0.8,0.3,1), opacity 0.3s';
        positionVirus(c.v);
      } else {
        releaseVirus(c.v);
      }
    }
  }

  function onMouseMove(ev) {
    lastMouse = { x: ev.clientX, y: ev.clientY };
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(processAttract);
    }
  }

  function onMouseLeave() {
    lastMouse = null;
    for (var i = 0; i < viruses.length; i++) releaseVirus(viruses[i]);
  }

  // ---------------- resize ----------------
  function onResize() {
    var rect = petri.getBoundingClientRect();
    for (var i = 0; i < viruses.length; i++) {
      var v = viruses[i];
      v.baseX = clamp(v.baseX, 60, rect.width - 60);
      v.baseY = clamp(v.baseY, 80, rect.height - 80);
      positionVirus(v);
    }
  }

  // ---------------- twitter intent ----------------
  function onSpread() {
    var text = (config.tweet_text || "$viruscoin just infected my wallet. this coin will spread. 🦠");
    var url = window.location.origin + window.location.pathname;
    var intent = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
    window.open(intent, '_blank', 'noopener');
  }

  // ---------------- config ----------------
  function applyConfig(cfg) {
    if (!cfg) return;
    if (cfg.ca) {
      config.ca = cfg.ca;
      var navCa = $('navCa');
      var fCa = $('footerCa');
      var s = 'CA: ' + cfg.ca;
      if (navCa) navCa.textContent = s;
      if (fCa) fCa.textContent = s;
    }
    if (cfg.twitterUrl) {
      config.twitterUrl = cfg.twitterUrl;
      var t = $('twitterLink'); if (t) t.href = cfg.twitterUrl;
    }
    if (cfg.communityUrl) {
      config.communityUrl = cfg.communityUrl;
      var c = $('communityLink'); if (c) c.href = cfg.communityUrl;
    }
    if (cfg.buyUrl) {
      config.buyUrl = cfg.buyUrl;
      var b1 = $('buyNav'); if (b1) b1.href = cfg.buyUrl;
      var b2 = $('buyHero'); if (b2) b2.href = cfg.buyUrl;
    }
    if (cfg.tweet_text) {
      config.tweet_text = cfg.tweet_text;
      var tt = $('tweetText'); if (tt) tt.textContent = cfg.tweet_text;
    }
  }

  function loadConfig() {
    fetch('/api/config').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d) applyConfig(d);
    }).catch(function () {});
  }

  // ---------------- init ----------------
  function init() {
    petri = $('petri');
    hint = $('heroHint');
    toast = $('toast');
    tpl = $('virus-template');
    linksSvg = $('links');

    spawnInitialVirus();

    petri.addEventListener('mousemove', onMouseMove);
    petri.addEventListener('mouseleave', onMouseLeave);

    window.addEventListener('resize', onResize);

    var spread = $('spreadBtn');
    if (spread) spread.addEventListener('click', onSpread);

    var navCa = $('navCa');
    var footerCa = $('footerCa');
    if (navCa) navCa.addEventListener('click', function () { if (config.ca) copy(config.ca); });
    if (footerCa) footerCa.addEventListener('click', function () { if (config.ca) copy(config.ca); });

    loadConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
