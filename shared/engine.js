// Sonsuz tuval motoru — bağımlılıksız. Kamera: dünya katmanına tek CSS transform.
// Pan: sürükle (boşluk veya kart üzerinden; 4px altı hareket = tıklama).
// Zoom: tekerlek / pinch → imlecin altındaki nokta sabit kalır.
// Zoom içerik gizlemez/açmaz; yalnızca ölçekler.

export function createCanvas(root, opts = {}) {
  const minZ = opts.minZoom ?? 0.03, maxZ = opts.maxZoom ?? 3;
  root.classList.add('sb-viewport');
  const world = document.createElement('div');
  world.className = 'sb-world';
  root.appendChild(world);

  const cam = { x: 0, y: 0, z: 1 };
  const listeners = new Set();
  let anim = null, idleTimer = null, raf = 0;

  function apply() {
    world.style.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.z})`;
  }
  // Zoom'a bağlı CSS değişkenleri yalnızca hareket bitince yazılır (her karede 500 kartın stilini yeniden hesaplatmamak için).
  function applyVars() {
    root.style.setProperty('--z', cam.z);
    root.style.setProperty('--inv-z', 1 / cam.z);
  }
  function changed() {
    // Hareket sırasında katman GPU'da tutulur; durunca keskin yeniden çizim için bırakılır.
    root.classList.add('sb-moving');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { root.classList.remove('sb-moving'); applyVars(); }, 160);
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(); listeners.forEach(f => f(cam)); });
  }
  function set(x, y, z) { cam.x = x; cam.y = y; cam.z = Math.min(maxZ, Math.max(minZ, z)); changed(); }
  function stopAnim() { if (anim) { cancelAnimationFrame(anim.id); anim = null; } }

  function viewSize() { const r = root.getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, top: r.top }; }
  function screenToWorld(sx, sy) { const v = viewSize(); return { x: (sx - v.left - cam.x) / cam.z, y: (sy - v.top - cam.y) / cam.z }; }
  function viewportWorldRect() { const v = viewSize(); return { x: -cam.x / cam.z, y: -cam.y / cam.z, w: v.w / cam.z, h: v.h / cam.z }; }

  function camFor(rect, pad = 0.08, insets = {}) {
    const v = viewSize();
    const l = insets.left || 0, r = insets.right || 0, t = insets.top || 0, b = insets.bottom || 0;
    const aw = Math.max(50, v.w - l - r), ah = Math.max(50, v.h - t - b);
    const z = Math.min(maxZ, Math.max(minZ, Math.min(aw / (rect.w * (1 + pad * 2)), ah / (rect.h * (1 + pad * 2)))));
    return { z, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, ox: l + aw / 2, oy: t + ah / 2 };
  }

  // Sinematik uçuş: merkez doğrusal, zoom log uzayında, ortada hafif geri çekilme (dip).
  function animateTo(rect, o = {}) {
    stopAnim();
    const dur = o.duration ?? 900;
    const target = camFor(rect, o.pad ?? 0.08, o.insets);
    const z0 = cam.z;
    const v = viewSize();
    const c0 = { x: (target.ox - cam.x) / cam.z, y: (target.oy - cam.y) / cam.z };
    const dist = Math.hypot(target.cx - c0.x, target.cy - c0.y) * Math.min(z0, target.z) / Math.max(v.w, 1);
    const dip = o.dip ?? Math.min(0.55, dist * 0.18);
    const ease = o.ease || (t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2));
    const t0 = performance.now();
    return new Promise(resolve => {
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), e = ease(t);
        const z = Math.exp(Math.log(z0) + (Math.log(target.z) - Math.log(z0)) * e) * (1 - dip * Math.sin(Math.PI * e));
        const cx = c0.x + (target.cx - c0.x) * e, cy = c0.y + (target.cy - c0.y) * e;
        cam.z = z; cam.x = target.ox - cx * z; cam.y = target.oy - cy * z;
        changed();
        if (t < 1) anim.id = requestAnimationFrame(step); else { anim = null; resolve(); }
      };
      anim = { id: requestAnimationFrame(step) };
    });
  }
  function jumpTo(rect, o = {}) {
    stopAnim();
    const t = camFor(rect, o.pad ?? 0.08, o.insets);
    set(t.ox - t.cx * t.z, t.oy - t.cy * t.z, t.z);
  }
  // Ken Burns: sunumda sahnede dururken çok yavaş yakınlaşma.
  function drift(amount = 0.035, dur = 9000) {
    stopAnim();
    const v = viewSize();
    const c = { x: (v.w / 2 - cam.x) / cam.z, y: (v.h / 2 - cam.y) / cam.z };
    const z0 = cam.z, t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      const z = z0 * (1 + amount * Math.sin(t * Math.PI / 2));
      cam.z = z; cam.x = v.w / 2 - c.x * z; cam.y = v.h / 2 - c.y * z; changed();
      if (t < 1) anim.id = requestAnimationFrame(step); else anim = null;
    };
    anim = { id: requestAnimationFrame(step) };
  }

  // ---- Etkileşim (fare + dokunmatik)
  // Tek parmak/fare: kaydır (dokunmatikte atalet). İki parmak: parmakların ortası sabit kalarak yakınlaştır + kaydır.
  // Çift dokunuş: opts.onDoubleTap. 4px altı hareket = tıklama.
  let drag = null, pinch = null, suppressClick = false, inertia = 0, lastTap = null;
  const pts = new Map();
  const isUI = el => el.closest('button, a, input, textarea, select, [contenteditable="true"], .sb-noDrag');
  const local = (x, y) => { const v = viewSize(); return { x: x - v.left, y: y - v.top }; };
  function startPinch() {
    const [a, b] = [...pts.values()];
    const c = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: cam.z, wx: (c.x - cam.x) / cam.z, wy: (c.y - cam.y) / cam.z };
    drag = null; suppressClick = true; root.classList.add('sb-dragging');
  }
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 1) return;
    if (isUI(e.target)) return;
    stopAnim(); cancelAnimationFrame(inertia);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { startPinch(); return; }
    if (pts.size > 2) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, touch: e.pointerType === 'touch', hist: [[performance.now(), e.clientX, e.clientY]] };
  });
  window.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const c = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      const z = Math.min(maxZ, Math.max(minZ, pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0));
      set(c.x - pinch.wx * z, c.y - pinch.wy * z, z);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > (drag.touch ? 8 : 4)) { drag.moved = true; root.classList.add('sb-dragging'); try { root.setPointerCapture(drag.id); } catch {} opts.onDragStart?.(); }
    if (drag.moved) {
      set(drag.cx + dx, drag.cy + dy, cam.z);
      drag.hist.push([performance.now(), e.clientX, e.clientY]); if (drag.hist.length > 6) drag.hist.shift();
    }
  });
  const endPointer = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) {
      if (pts.size < 2) { pinch = null; if (!pts.size) root.classList.remove('sb-dragging'); else { const [id, p] = [...pts.entries()][0]; drag = { id, sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: true, touch: true, hist: [[performance.now(), p.x, p.y]] }; } }
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    root.classList.remove('sb-dragging');
    if (d.moved) {
      suppressClick = true;
      // Dokunmatik atalet
      if (d.touch && e.type === 'pointerup' && d.hist.length > 1) {
        const [t0, x0, y0] = d.hist[0], [t1, x1, y1] = d.hist[d.hist.length - 1];
        let vx = (x1 - x0) / Math.max(1, t1 - t0), vy = (y1 - y0) / Math.max(1, t1 - t0);
        if (Math.hypot(vx, vy) > 0.25 && performance.now() - t1 < 80) {
          let last = performance.now();
          const step = now => { const dt = now - last; last = now; set(cam.x + vx * dt, cam.y + vy * dt, cam.z); vx *= Math.pow(0.94, dt / 16); vy *= Math.pow(0.94, dt / 16); if (Math.hypot(vx, vy) > 0.02) inertia = requestAnimationFrame(step); };
          inertia = requestAnimationFrame(step);
        }
      }
      return;
    }
    // Çift dokunuş (yalnızca dokunmatik)
    if (d.touch && e.type === 'pointerup') {
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        lastTap = null; suppressClick = true;
        opts.onDoubleTap?.(e, screenToWorld(e.clientX, e.clientY));
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  root.addEventListener('click', e => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; return; }
    if (e.target === root || e.target === world || e.target.classList.contains('sb-bgClick')) opts.onBackgroundClick?.(e);
  }, true);
  // Tarayıcının kendi çift dokunuş/pinch yakınlaştırmasını tuvalde kapat
  root.addEventListener('gesturestart', e => e.preventDefault());
  root.addEventListener('dblclick', e => { if (pts.size || e.pointerType === 'touch') e.preventDefault(); });

  root.addEventListener('wheel', e => {
    if (e.target.closest('.sb-scrollable')) return;
    e.preventDefault();
    stopAnim();
    const v = viewSize();
    const mx = e.clientX - v.left, my = e.clientY - v.top;
    // Trackpad yatay kaydırma = pan; diğer her şey imlece göre zoom.
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) { set(cam.x - e.deltaX, cam.y - e.deltaY, cam.z); return; }
    if (e.shiftKey) { set(cam.x - e.deltaY, cam.y, cam.z); return; }
    const k = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0018;
    const nz = Math.min(maxZ, Math.max(minZ, cam.z * Math.exp(-e.deltaY * k)));
    set(mx - (mx - cam.x) * (nz / cam.z), my - (my - cam.y) * (nz / cam.z), nz);
  }, { passive: false });

  function zoomBy(f) {
    const v = viewSize();
    const nz = Math.min(maxZ, Math.max(minZ, cam.z * f));
    set(v.w / 2 - (v.w / 2 - cam.x) * (nz / cam.z), v.h / 2 - (v.h / 2 - cam.y) * (nz / cam.z), nz);
  }

  apply(); applyVars();
  return {
    root, world, cam,
    set, animateTo, jumpTo, drift, stopAnim, zoomBy,
    screenToWorld, viewportWorldRect, viewSize,
    onChange: f => listeners.add(f),
    isAnimating: () => !!anim,
    suppressNextClick: () => { suppressClick = true; },
    pointerCount: () => pts.size,
  };
}

export function boundsOf(rects) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
