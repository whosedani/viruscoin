(function () {
  'use strict';

  // ---------------- state ----------------
  var MAX_VIRUSES = 60;
  var REPEL_RADIUS = 120;
  var REPEL_FORCE = 60;
  var GLOBAL_POLL_MS = 5000;

  var localCount = parseInt(localStorage.getItem('virus_local') || '0', 10);
  var globalCount = 0;
  var displayedGlobal = 0;
  var hasClicked = localCount > 0;

  var petri, hudLocal, hudGlobal, hint, toast, tpl;
  var viruses = []; // { el, baseX, baseY, size, repelX, repelY, swapTransition }
  var pendingClicks = 0;
  var flushTimer = null;

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
  function fmtNum(n) { return n.toLocaleString('en-US'); }

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

  // ---------------- counters ----------------
  function setLocal(n) {
    localCount = n;
    localStorage.setItem('virus_local', String(n));
    if (hudLocal) hudLocal.textContent = fmtNum(n);
  }

  function animateGlobal(target) {
    if (target === displayedGlobal) return;
    var start = displayedGlobal;
    var diff = target - start;
    var dur = 600;
    var t0 = performance.now();
    function step(t) {
      var p = clamp((t - t0) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var v = Math.round(start + diff * eased);
      if (hudGlobal) hudGlobal.textContent = fmtNum(v);
      if (p < 1) requestAnimationFrame(step);
      else displayedGlobal = target;
    }
    requestAnimationFrame(step);
  }

  function flashGlobal() {
    if (!hudGlobal) return;
    hudGlobal.classList.add('flash');
    setTimeout(function () { hudGlobal.classList.remove('flash'); }, 220);
  }

  function fetchGlobal() {
    fetch('/api/count').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || typeof d.count !== 'number') return;
      if (d.count !== globalCount) {
        globalCount = d.count;
        flashGlobal();
        animateGlobal(globalCount);
      } else if (displayedGlobal !== globalCount) {
        animateGlobal(globalCount);
      }
    }).catch(function () {});
  }

  function flushClicks() {
    if (pendingClicks <= 0) return;
    var n = pendingClicks;
    pendingClicks = 0;
    fetch('/api/count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ n: n })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && typeof d.count === 'number') {
        globalCount = d.count;
        animateGlobal(globalCount);
      }
    }).catch(function () {});
  }

  function queueClick(n) {
    pendingClicks += n;
    globalCount += n;
    animateGlobal(globalCount);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushClicks, 250);
  }

  // ---------------- viruses ----------------
  function makeVirus(x, y, size) {
    var node = tpl.content.firstElementChild.cloneNode(true);
    var hue = randInt(-15, 30);
    var bri = rand(0.85, 1.15).toFixed(2);
    var op = rand(0.78, 1).toFixed(2);
    node.style.setProperty('--vsize', size + 'px');
    node.style.setProperty('--vop', op);
    node.style.setProperty('--lev-dur', rand(3.4, 5.2).toFixed(2) + 's');
    node.style.setProperty('--lev-delay', '-' + rand(0, 4).toFixed(2) + 's');
    node.querySelector('svg').style.filter = 'drop-shadow(0 6px 18px rgba(0,0,0,0.45)) hue-rotate(' + hue + 'deg) brightness(' + bri + ')';
    node.classList.add('spawning');
    setTimeout(function () { node.classList.remove('spawning'); }, 400);

    petri.appendChild(node);

    var entry = {
      el: node,
      baseX: x,
      baseY: y,
      size: size,
      repelX: 0,
      repelY: 0
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
    var x = entry.baseX + entry.repelX - entry.size / 2;
    var y = entry.baseY + entry.repelY - entry.size / 2;
    entry.el.style.left = x + 'px';
    entry.el.style.top = y + 'px';
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

    // pulse glow at click
    var rect = petri.getBoundingClientRect();
    var px = (ev.clientX - rect.left) - 30;
    var py = (ev.clientY - rect.top) - 30;
    var pulse = document.createElement('div');
    pulse.className = 'pulse';
    pulse.style.left = px + 'px';
    pulse.style.top = py + 'px';
    petri.appendChild(pulse);
    setTimeout(function () { if (pulse.parentNode) pulse.parentNode.removeChild(pulse); }, 600);

    // local: multiply with 1.2-2.0 multiplier (rounded)
    var mult = rand(1.2, 2.0);
    var prev = localCount;
    var next = Math.max(prev + 1, Math.round((prev + 1) * mult / Math.max(1, mult * 0.6)));
    // simpler & predictable: add 1, but boost by mult occasionally
    next = prev + Math.max(1, Math.round(rand(1, 3) * mult));
    setLocal(next);

    // global: increment by 1 per actual click
    queueClick(1);

    // spawn 1-3 new visual viruses
    var spawnN = randInt(1, 3);
    for (var i = 0; i < spawnN; i++) {
      var ox = rand(-80, 80);
      var oy = rand(-80, 80);
      var nx = clamp(entry.baseX + ox, 60, rect.width - 60);
      var ny = clamp(entry.baseY + oy, 80, rect.height - 80);
      var newSize = randInt(40, 120);
      makeVirus(nx, ny, newSize);
    }
  }

  // ---------------- mouse repel ----------------
  function onMouseMove(ev) {
    var rect = petri.getBoundingClientRect();
    var mx = ev.clientX - rect.left;
    var my = ev.clientY - rect.top;
    for (var i = 0; i < viruses.length; i++) {
      var v = viruses[i];
      var dx = (v.baseX) - mx;
      var dy = (v.baseY) - my;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < REPEL_RADIUS && dist > 0.001) {
        var force = (1 - dist / REPEL_RADIUS) * REPEL_FORCE;
        var ux = dx / dist;
        var uy = dy / dist;
        v.repelX = ux * force;
        v.repelY = uy * force;
        v.el.style.transition = 'left 0.3s ease-out, top 0.3s ease-out, opacity 0.3s';
        positionVirus(v);
      } else if (v.repelX !== 0 || v.repelY !== 0) {
        v.repelX = 0;
        v.repelY = 0;
        v.el.style.transition = 'left 1.5s ease-out, top 1.5s ease-out, opacity 0.3s';
        positionVirus(v);
      }
    }
  }

  function onMouseLeave() {
    for (var i = 0; i < viruses.length; i++) {
      var v = viruses[i];
      if (v.repelX !== 0 || v.repelY !== 0) {
        v.repelX = 0;
        v.repelY = 0;
        v.el.style.transition = 'left 1.5s ease-out, top 1.5s ease-out, opacity 0.3s';
        positionVirus(v);
      }
    }
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
    hudLocal = $('localCount');
    hudGlobal = $('globalCount');
    hint = $('heroHint');
    toast = $('toast');
    tpl = $('virus-template');

    if (hudLocal) hudLocal.textContent = fmtNum(localCount);
    if (hasClicked && hint) hint.classList.add('hidden');

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

    fetchGlobal();
    setInterval(fetchGlobal, GLOBAL_POLL_MS);

    window.addEventListener('beforeunload', flushClicks);

    loadConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
