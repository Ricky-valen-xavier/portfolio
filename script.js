/* ==================================================================
   Portfolio — motion & interactions
   One requestAnimationFrame loop drives every scroll-linked scene.
   The scroll position is eased before use, so motion glides.
   ================================================================== */
(() => {
  'use strict';

  const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const makeSpan = (className, text) => {
    const el = document.createElement('span');
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  /* Page-relative top of an element, ignoring any transforms on it */
  const docTop = el => {
    let top = 0;
    for (let node = el; node; node = node.offsetParent) top += node.offsetTop;
    return top;
  };

  /* Size text (width: max-content) so it spans a given width */
  const fitText = (el, width, max = Infinity) => {
    el.style.fontSize = '100px';
    const size = Math.min(max, (width / el.offsetWidth) * 100);
    el.style.fontSize = `${size.toFixed(2)}px`;
  };

  let vw = document.documentElement.clientWidth;
  let vh = window.innerHeight;

  /* ---------- Stagger: give children of [data-stagger] an index ---------- */
  $$('[data-stagger]').forEach(group => {
    [...group.children].forEach((child, i) => child.style.setProperty('--i', i));
  });

  /* ---------- Split headlines into rising words / characters ---------- */
  const splitText = (el, mode) => {
    const gradient = el.classList.contains('gradient-text') || !!$('.gradient-text', el);
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    const itemClass = gradient ? 'split__item gradient-text' : 'split__item';
    let n = 0;

    el.classList.remove('gradient-text');
    el.setAttribute('aria-label', text);
    el.textContent = '';

    text.split(' ').forEach((word, i, words) => {
      const mask = makeSpan('split');
      mask.setAttribute('aria-hidden', 'true');
      (mode === 'chars' ? [...word] : [word]).forEach(part => {
        const item = makeSpan(itemClass, part);
        item.style.setProperty('--n', n++);
        mask.append(item);
      });
      el.append(mask);
      if (i < words.length - 1) el.append(' ');
    });
  };
  if (motion) $$('[data-split]').forEach(el => splitText(el, el.dataset.split));

  /* ---------- Navigation ---------- */
  const nav = $('#nav');
  const toggle = $('.nav__toggle', nav);
  const navLinks = $$('.nav__links a', nav);
  let navH = nav.offsetHeight;

  const setMenu = open => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('no-scroll', open);
  };

  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  navLinks.forEach((link, i) => {
    link.style.setProperty('--i', i);
    link.addEventListener('click', () => setMenu(false));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  window.matchMedia('(min-width: 834px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

  // Nav turns light over white sections and dark over black ones
  const themed = $$('[data-nav-theme]').map(el => ({ el, top: 0, bottom: 0 }));
  const layoutNav = () => {
    navH = nav.offsetHeight;
    themed.forEach(s => {
      s.top = docTop(s.el);
      s.bottom = s.top + s.el.offsetHeight;
    });
  };

  const progressBar = $('.scroll-progress');
  let maxScroll = 1;

  const renderChrome = y => {
    nav.classList.toggle('is-scrolled', y > 8);
    const probe = y + navH / 2;
    const current = themed.find(s => probe >= s.top && probe < s.bottom);
    nav.classList.toggle('is-light', !!current && current.el.dataset.navTheme === 'light');
    progressBar.style.transform = `scaleX(${clamp(y / maxScroll).toFixed(4)})`;
  };

  // Highlight the nav link for the section in view
  const linkById = new Map(navLinks.map(a => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const link = linkById.get(entry.target.id);
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(a => a.classList.remove('is-active'));
          link.classList.add('is-active');
        } else if (entry.boundingClientRect.top > 0) {
          link.classList.remove('is-active');   // scrolled back above it
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    linkById.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  /* ---------- Pointer (eased), used for hero depth ---------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (finePointer && motion) {
    window.addEventListener('pointermove', e => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  /* ==================================================================
     Scenes — each has layout() (measure, on resize) and render(y)
     ================================================================== */
  const scenes = [];

  /* ---------- Hero: name emerges from behind the photo ---------- */
  const hero = $('.hero');
  if (hero) {
    const name = $('.hero__name', hero);
    const lines = $$('.hero__line', name);
    const photo = $('.hero__photo', hero);
    const img = $('.hero__img', hero);
    const details = $('.hero__details', hero);
    const hint = $('.hero__scroll', hero);
    const intro = $('.hero__top', hero);
    const stage = $('.hero__stage', hero);
    const sideBySide = window.matchMedia('(min-aspect-ratio: 11/10)');
    const chars = [];
    let top = 0;
    let range = 1;

    if (!name.hasAttribute('aria-label')) {
      name.setAttribute('aria-label', lines.map(l => l.textContent.trim()).join(' '));
    }
    lines.forEach((line, lineIndex) => {
      const text = line.textContent.trim();
      line.setAttribute('aria-hidden', 'true');
      line.textContent = '';
      [...text].forEach(ch => {
        const el = makeSpan('hero__char', ch === ' ' ? ' ' : ch);
        line.append(el);
        chars.push({ el, line: lineIndex, dx: 0, dy: 0, order: 0 });
      });
    });

    // Largest size at which both names fit beside (or above/below) the photo
    const fitName = () => {
      name.style.fontSize = '100px';
      const perPx = Math.max(...lines.map(l => l.offsetWidth)) / 100;   // width per 1px of font-size
      const tuck = 0.12;                                                 // matches --tuck in CSS
      const gutter = clamp(vw * 0.05, 20, 40);
      const photoW = photo.offsetWidth;
      const photoH = photo.offsetHeight;
      let size;

      if (sideBySide.matches) {
        const room = (vw - photoW) / 2 - gutter;
        size = Math.min(room / (perPx - tuck), photoH * 0.58, 300);
      } else {
        const room = (stage.offsetHeight - photoH) / 2 - navH - 8;
        size = Math.min((vw * 0.92) / perPx, room / (0.86 - tuck), 240);
      }
      name.style.fontSize = `${Math.max(size, 24).toFixed(2)}px`;
    };

    scenes.push({
      layout() {
        fitName();
        // Every letter starts at the centre of the photo, hidden behind it
        const cx = name.offsetWidth / 2;
        const cy = name.offsetHeight / 2;
        chars.forEach(c => {
          const line = c.el.parentElement;
          c.dx = line.offsetLeft + c.el.offsetLeft + c.el.offsetWidth / 2 - cx;
          c.dy = line.offsetTop + c.el.offsetTop + c.el.offsetHeight / 2 - cy;
        });
        // Letters nearest the photo come out first
        const dist = chars.map(c => Math.hypot(c.dx, c.dy));
        const min = Math.min(...dist);
        const span = Math.max(1, Math.max(...dist) - min);
        chars.forEach((c, i) => { c.order = (dist[i] - min) / span; });
        top = docTop(hero);
        range = Math.max(1, hero.offsetHeight - vh);
      },

      render(y) {
        if (!motion || y > top + range + vh) return;
        const p = clamp((y - top) / range);
        hero.style.setProperty('--p', p.toFixed(4));

        // Letters start collapsed, small and blurred behind the photo, then fly outward
        chars.forEach(c => {
          const t = clamp((p - 0.03 - c.line * 0.05 - c.order * 0.14) / 0.38);
          const e = easeInOut(t);
          const rest = 1 - e;
          c.el.style.transform =
            `translate3d(${(-c.dx * rest).toFixed(1)}px, ${(-c.dy * rest).toFixed(1)}px, 0) scale(${(0.25 + 0.75 * e).toFixed(3)})`;
          c.el.style.opacity = clamp(e * 1.6).toFixed(3);
          c.el.style.filter = rest > 0.01 ? `blur(${(rest * 14).toFixed(1)}px)` : 'none';
        });

        const settle = easeInOut(clamp(p / 0.7));
        const drift = clamp((p - 0.6) / 0.4);
        name.style.transform =
          `translate3d(${(-pointer.x * 22).toFixed(2)}px, ${(-pointer.y * 12).toFixed(2)}px, 0) scale(${(1 + drift * 0.05).toFixed(4)})`;
        photo.style.transform =
          `translate3d(${(pointer.x * 12).toFixed(2)}px, ${(pointer.y * 8).toFixed(2)}px, 0) scale(${(1 - settle * 0.08).toFixed(4)})`;
        img.style.transform = `scale(${(1.12 - settle * 0.12).toFixed(4)})`;

        const d = easeOut(clamp((p - 0.42) / 0.25));
        details.style.opacity = d.toFixed(3);
        details.style.transform = `translate3d(0, ${((1 - d) * 36).toFixed(1)}px, 0)`;
        details.style.visibility = d > 0.01 ? 'visible' : 'hidden';
        hint.style.opacity = clamp(1 - p * 10).toFixed(3);

        // On tall screens the first name rises into the badge's space, so the badge steps aside
        intro.style.opacity = sideBySide.matches ? '' : (1 - easeOut(clamp(p / 0.2))).toFixed(3);
      },
    });
  }

  /* ---------- About: words light up and settle in reading order ---------- */
  const statement = $('.statement');
  const statementText = statement && $('[data-words]', statement);
  if (statementText && motion) {
    const text = statementText.textContent.trim().split(/\s+/);
    statementText.textContent = '';
    const words = text.map((word, i) => {
      const el = makeSpan('word', word);
      statementText.append(el);
      if (i < text.length - 1) statementText.append(' ');
      return el;
    });
    let top = 0;
    let range = 1;

    scenes.push({
      layout() {
        top = docTop(statement);
        range = Math.max(1, statement.offsetHeight - vh);
      },
      render(y) {
        if (y < top - vh || y > top + range + vh) return;
        const p = clamp((y - top) / range);
        const n = words.length;
        words.forEach((word, i) => {
          const lit = clamp(p * n * 1.2 - i);
          word.style.opacity = (0.14 + 0.86 * lit).toFixed(3);
          word.style.transform = `translate3d(0, ${((1 - lit) * 12).toFixed(1)}px, 0)`;
        });
      },
    });
  }

  /* ---------- Experience: the timeline draws itself ---------- */
  const timeline = $('.timeline');
  if (timeline) {
    if (!motion) timeline.style.setProperty('--progress', 1);
    let top = 0;
    let height = 1;
    scenes.push({
      layout() {
        top = docTop(timeline);
        height = Math.max(1, timeline.offsetHeight);
      },
      render(y) {
        if (!motion) return;
        const p = clamp((y + vh * 0.6 - top) / height);
        timeline.style.setProperty('--progress', p.toFixed(4));
      },
    });
  }

  /* ---------- Interlude: text zooms out, then a white circle wipes the screen ---------- */
  const zoom = $('.zoom');
  if (zoom && motion) {
    const lines = $$('.zoom__text > span', zoom);
    let top = 0;
    let range = 1;

    scenes.push({
      layout() {
        top = docTop(zoom);
        range = Math.max(1, zoom.offsetHeight - vh);
      },
      render(y) {
        if (y < top - vh || y > top + range + vh) return;
        const p = clamp((y - top) / range);
        const scale = 2.4 - 1.4 * easeOut(clamp(p / 0.45));
        const reveal = easeInOut(clamp((p - 0.5) / 0.4));

        zoom.style.setProperty('--scale', scale.toFixed(4));
        zoom.style.setProperty('--reveal', reveal.toFixed(4));
        lines.forEach((line, i) => {
          const o = clamp((p - i * 0.13) / 0.18);
          line.style.opacity = o.toFixed(3);
          line.style.transform = `translate3d(0, ${((1 - o) * 40).toFixed(1)}px, 0)`;
        });

        // Once the white circle reaches the nav, switch the nav to its light style
        const stickyTop = y < top ? top - y : y > top + range ? top + range - y : 0;
        const radius = reveal * 0.75 * (Math.hypot(vw, vh) / Math.SQRT2);
        const distance = Math.abs(stickyTop + vh / 2 - navH / 2);
        zoom.dataset.navTheme = reveal > 0 && radius >= distance ? 'light' : 'dark';
      },
    });
  }

  /* ---------- Work: vertical scroll drives a sideways gallery ---------- */
  const work = $('.work');
  if (work && motion) {
    const track = $('.work__track', work);
    const cards = $$('.card', track).map(el => ({ el, art: $('.card__art', el), center: 0 }));
    const bar = $('.work__progress', work);
    const counter = $('[data-work-index]', work);
    const total = $('[data-work-total]', work);
    let top = 0;
    let distance = 0;
    let lastIndex = '';

    if (total) total.textContent = String(cards.length).padStart(2, '0');
    work.classList.add('is-pinned');

    scenes.push({
      layout() {
        distance = Math.max(0, track.scrollWidth - vw);
        work.style.height = `${Math.round(distance + vh)}px`;
        top = docTop(work);
        cards.forEach(c => { c.center = c.el.offsetLeft + c.el.offsetWidth / 2; });
      },
      render(y) {
        if (y < top - vh || y > top + distance + vh) return;
        const p = distance > 0 ? clamp((y - top) / distance) : 0;
        const x = -p * distance;
        track.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;

        // Cards turn to face the centre and the artwork slides inside its frame
        cards.forEach(c => {
          const off = clamp((c.center + x - vw / 2) / vw, -1.2, 1.2);
          c.el.style.transform =
            `perspective(1200px) rotateY(${(off * -10).toFixed(2)}deg) scale(${(1 - Math.abs(off) * 0.07).toFixed(4)})`;
          c.art.style.translate = `${(off * -60).toFixed(1)}px 0`;
        });

        bar.style.setProperty('--wp', p.toFixed(4));
        const index = String(Math.round(p * (cards.length - 1)) + 1).padStart(2, '0');
        if (index !== lastIndex) {
          counter.textContent = index;
          lastIndex = index;
        }
      },
    });
  }

  /* ---------- Parallax: [data-speed] elements drift against the scroll ---------- */
  const drifters = $$('[data-speed]').map(el => ({ el, speed: parseFloat(el.dataset.speed) || 0, center: 0 }));
  if (drifters.length && motion) {
    scenes.push({
      layout() {
        drifters.forEach(d => { d.center = docTop(d.el) + d.el.offsetHeight / 2; });
      },
      render(y) {
        const mid = y + vh / 2;
        drifters.forEach(d => {
          const off = d.center - mid;
          if (Math.abs(off) > vh * 1.5) return;
          d.el.style.translate = `0 ${(off * d.speed).toFixed(1)}px`;
        });
      },
    });
  }

  /* ---------- Footer: giant name fitted to the page width ---------- */
  const footerName = $('.footer__name');
  if (footerName) {
    scenes.push({
      layout() {
        const box = footerName.parentElement;
        const styles = getComputedStyle(box);
        const width = box.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
        fitText(footerName, width, 320);
      },
    });
  }

  /* ---------- Marquee: always moving, faster when you scroll, flips direction ---------- */
  const rows = motion ? $$('.marquee').map(el => {
    const track = $('.marquee__track', el);
    const originals = [...track.children];
    const appendCopies = items => items.forEach(item => {
      const copy = item.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      track.append(copy);
    });

    // Make one half at least as wide as the screen, then duplicate it for a seamless loop
    let guard = 0;
    while (track.scrollWidth < window.innerWidth && guard++ < 10) appendCopies(originals);
    appendCopies([...track.children]);

    return {
      el,
      track,
      x: 0,
      half: track.scrollWidth / 2,
      dir: el.classList.contains('marquee--reverse') ? 1 : -1,
      top: 0,
      bottom: 0,
    };
  }) : [];

  /* ==================================================================
     Main loop
     ================================================================== */
  let smoothY = window.scrollY;
  let lastY = smoothY;
  let velocity = 0;
  let scrollDir = 1;
  let lastTime = performance.now();
  let needsRender = true;
  let lastWidth = vw;

  const layout = () => {
    vw = document.documentElement.clientWidth;
    vh = window.innerHeight;
    scenes.forEach(s => s.layout && s.layout());
    layoutNav();
    rows.forEach(r => {
      r.half = r.track.scrollWidth / 2;
      r.top = docTop(r.el);
      r.bottom = r.top + r.el.offsetHeight;
    });
    maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    needsRender = true;
  };

  const renderScenes = y => scenes.forEach(s => s.render && s.render(y));

  const frame = now => {
    const dt = clamp((now - lastTime) / 1000, 0.001, 0.05);
    lastTime = now;

    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;
    velocity = lerp(velocity, delta / dt, 0.12);
    if (Math.abs(velocity) > 20) scrollDir = Math.sign(velocity);

    const prevSmooth = smoothY;
    smoothY = motion ? lerp(smoothY, y, 1 - Math.exp(-dt * 9)) : y;
    if (Math.abs(smoothY - y) < 0.1) smoothY = y;

    const ease = 1 - Math.exp(-dt * 5);
    pointer.x = lerp(pointer.x, pointer.tx, ease);
    pointer.y = lerp(pointer.y, pointer.ty, ease);
    const pointerMoving = Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.0005;

    if (needsRender || smoothY !== prevSmooth || pointerMoving) {
      renderScenes(smoothY);
      renderChrome(y);
      needsRender = false;
    } else if (delta !== 0) {
      renderChrome(y);
    }

    // Marquee rows
    const boost = Math.min(Math.abs(velocity) / 250, 8);
    rows.forEach(r => {
      if (r.bottom < y || r.top > y + vh) return;   // off screen
      const direction = r.dir * scrollDir;
      r.x += direction * 45 * (1 + boost) * dt;
      if (r.x <= -r.half) r.x += r.half;
      else if (r.x > 0) r.x -= r.half;
      const skew = clamp(-direction * boost * 1.2, -8, 8);
      r.track.style.transform = `translate3d(${r.x.toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
    });

    requestAnimationFrame(frame);
  };

  // Initial layout + first paint of every scene before the name becomes visible
  layout();
  renderScenes(smoothY);
  renderChrome(window.scrollY);
  if (hero) hero.classList.add('is-ready');
  requestAnimationFrame(frame);

  // Re-measure when the layout changes (ignores mobile toolbar show/hide)
  let resizeTimer;
  const scheduleLayout = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  };
  window.addEventListener('resize', () => {
    const width = document.documentElement.clientWidth;
    if (width === lastWidth && Math.abs(window.innerHeight - vh) < 160) return;
    lastWidth = width;
    scheduleLayout();
  });
  window.addEventListener('load', layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleLayout).observe(document.body);

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && motion) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach(el => revealObserver.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ---------- Count-up numbers ---------- */
  if ('IntersectionObserver' in window && motion) {
    const animateCount = el => {
      const raw = el.dataset.count;
      const target = parseFloat(raw);
      const decimals = (raw.split('.')[1] || '').length;
      const start = performance.now();
      const duration = 1800;

      const tick = now => {
        const t = clamp((now - start) / duration);
        const value = target * (1 - Math.pow(1 - t, 4));
        el.textContent = decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString();
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const countObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    $$('[data-count]').forEach(el => {
      el.textContent = '0';
      countObserver.observe(el);
    });
  }

  /* ---------- Pointer effects (desktop only) ---------- */
  if (finePointer && motion) {
    // Spotlight follows the cursor
    $$('[data-spotlight]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });

    // 3D tilt toward the cursor
    $$('[data-tilt]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.rotate = `${(-y).toFixed(3)} ${x.toFixed(3)} 0 ${(Math.hypot(x, y) * 10).toFixed(2)}deg`;
      });
      el.addEventListener('pointerleave', () => { el.style.rotate = ''; });
    });

    // Magnetic buttons lean toward the cursor
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.3;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.4;
        el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });

    // Contact glow drifts after the cursor
    const contact = $('.contact');
    const glow = contact && $('.contact__glow', contact);
    if (glow) {
      contact.addEventListener('pointermove', e => {
        const r = contact.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - 0.5) * 360;
        const y = ((e.clientY - r.top) / r.height - 0.5) * 120;
        glow.style.translate = `calc(-50% + ${x.toFixed(0)}px) ${y.toFixed(0)}px`;
      });
    }
  }

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();
