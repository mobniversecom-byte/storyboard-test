// Konsept A — Cinematic Editorial
// Bilgi mimarisi: storyboard sayfası. Her sahne 16:10 bir "kare"; kareler soldan sağa, satır satır numaralı.
// Anlatı: dergi/belgesel — her kare bir manşet, bir alıntı (çıkarım) ve kanıt kartlarından oluşan "spread".
// Gezinme: alt film şeridi. Sunum: sinematik uçuş + Ken Burns yavaş yakınlaşma.
import { startConcept } from '../shared/app.js';
import { boundsOf } from '../shared/engine.js';
import { esc, dtBadge, flagBadge, idTag, confBadge, valueHtml } from '../shared/evidence.js';
import { prov, mediaAction, fieldRows, flagsRow, matrixHtml, bars } from '../shared/cards.js';

const FW = 1600, FH = 1000, COLS = 5, GX = 200, GY = 300, X = 60, Y = 220, W = 1480;

function placeScene(s, ctx) {
  const cs = s.card_ids.map(ctx.card);
  const it = [];
  const put = (c, x, y, w, h) => c && it.push([c.id, x, y, w, h]);
  const grid = (list, y0, cols, h, gap = 22) => {
    const w = (W - (cols - 1) * gap) / cols;
    list.forEach((c, i) => put(c, X + (i % cols) * (w + gap), y0 + Math.floor(i / cols) * (h + gap), w, h));
    return y0 + Math.ceil(list.length / cols) * (h + gap);
  };
  const by = k => cs.filter(c => c.kind === k);
  let bottom = Y;
  switch (s.kind) {
    case 'overview': {
      const m = by('metric'), t = by('text');
      grid(m, Y, Math.max(1, m.length), 210);
      put(t[0], X, Y + 240, 728, 440); put(t[1], X + 752, Y + 240, 728, 440);
      bottom = Y + 700; break;
    }
    case 'categories': bottom = grid(cs, Y, Math.max(1, cs.length), 560); break;
    case 'products': put(cs[0], X + 340, Y + 40, 800, 480); bottom = Y + 540; break;
    case 'product': {
      const prod = cs.find(c => c.kind === 'entity' && c.record_ref.entity !== 'price_observation');
      const prices = cs.filter(c => c.record_ref.entity === 'price_observation');
      const media = by('media'), why = by('inference')[0], gap = by('gap')[0];
      const metrics = by('metric'), rec = by('recommendation')[0];
      put(prod, X, Y, 600, 280);
      put(why, X, Y + 300, 600, 220);
      const pw = (600 - (prices.length - 1) * 14) / Math.max(1, prices.length);
      prices.forEach((c, i) => put(c, X + i * (pw + 14), Y + 540, pw, 210));
      media.forEach((c, i) => put(c, X + 630, Y + i * 204, 410, 190));
      put(gap, X + 630, Y + media.length * 204, 410, 750 - media.length * 204);
      put(metrics[0], X + 1070, Y, 410, 220);
      put(metrics[1], X + 1070, Y + 240, 410, 270);
      put(rec, X + 1070, Y + 530, 410, 220);
      bottom = Y + 750; break;
    }
    case 'sellers': {
      const comp = cs.filter(c => c.record_ref.entity === 'company'), groups = cs.filter(c => c.record_ref.entity !== 'company');
      const y = grid(comp, Y, 5, 200, 16);
      bottom = grid(groups, y + 30, 3, 210, 20); break;
    }
    case 'admap': {
      const mx = by('matrix')[0];
      const h = 90 + mx.matrix.rows.length * 46;
      put(mx, X, Y, 1000, h); put(by('inference')[0], X + 1030, Y, 450, 340);
      bottom = Y + Math.max(h, 340); break;
    }
    case 'economics': {
      const m = by('metric');
      const y = grid(m, Y, Math.min(5, Math.max(1, m.length)), 360);
      put(by('gap')[0], X, y + 10, 720, 230); bottom = y + 250; break;
    }
    case 'positioning': bottom = grid(cs, Y, Math.min(3, cs.length), 320); break;
    case 'gaps': bottom = grid(cs, Y, 2, 330); break;
    default: bottom = grid(cs, Y, 4, 260);
  }
  return { it, h: Math.max(FH, bottom + 60) };
}

// Mobil (dikey ekran) yerleşim: aynı sonsuz tuval; kareler dar (480) ve tek sütun, kartlar alt alta.
// Kart genişliği ~400 olduğundan bir karta yakınlaşınca yazılar telefonda okunur boyutta kalır.
const MW = 360, MX = 30, MY = 190, MFW = 420;
function placeSceneMobile(s, ctx) {
  const cs = s.card_ids.map(ctx.card);
  const it = [];
  let y = MY;
  const put = (c, h, x = MX, w = MW) => { if (c) it.push([c.id, x, y, w, h]); };
  const col = (list, h, gap = 18) => { list.forEach(c => { put(c, h); y += h + gap; }); };
  const two = (list, h, gap = 16) => { const w = (MW - gap) / 2; list.forEach((c, i) => { put(c, h, MX + (i % 2) * (w + gap), w); if (i % 2 === 1 || i === list.length - 1) y += h + gap; }); };
  const by = k => cs.filter(c => c.kind === k);
  switch (s.kind) {
    case 'overview': two(by('metric'), 210); col(by('text'), 400); break;
    case 'categories': col(cs, 380); break;
    case 'products': col(cs, 520); break;
    case 'product': {
      col([cs.find(c => c.kind === 'entity' && c.record_ref.entity !== 'price_observation')], 320);
      col(by('inference'), 360);
      col(cs.filter(c => c.record_ref.entity === 'price_observation'), 200);
      col(by('media'), 150);
      const m = by('metric'); col([m[0]], 250); col([m[1]], 320);
      col(by('recommendation'), 280); col(by('gap'), 220);
      break;
    }
    case 'sellers': two(cs.filter(c => c.record_ref.entity === 'company'), 210); y += 20; col(cs.filter(c => c.record_ref.entity !== 'company'), 240); break;
    case 'admap': { const mx = by('matrix')[0]; col([mx], 100 + mx.matrix.rows.length * 40); col(by('inference'), 320); break; }
    case 'economics': col(by('metric'), 380); col(by('gap'), 260); break;
    case 'positioning': col(cs, 300); break;
    case 'gaps': col(cs, 420); break;
    default: col(cs, 280);
  }
  return { it, h: y + 30 };
}

function layout(data, config, ctx) {
  const positions = new Map(), frames = [], steps = [];
  const M = ctx.mobile;
  const COLS_ = M ? 1 : COLS, FW_ = M ? MFW : FW, GX_ = M ? 0 : GX, GY_ = M ? 160 : GY;
  const placed = data.scenes.map(s => ({ s, ...(M ? placeSceneMobile(s, ctx) : placeScene(s, ctx)) }));
  const nProd = data.scenes.filter(s => s.kind === 'product').length;
  let rowY = 0;
  for (let r = 0; r * COLS_ < placed.length; r++) {
    const row = placed.slice(r * COLS_, r * COLS_ + COLS_);
    const rh = Math.max(...row.map(p => p.h));
    row.forEach((p, i) => {
      const fx = i * (FW_ + GX_), fy = rowY;
      const idx = r * COLS_ + i;
      p.it.forEach(([id, x, y, w, h]) => positions.set(id, { x: fx + x, y: fy + y, w, h }));
      const cat = p.s.category ? config.categories.find(c => c.id === p.s.category) : null;
      frames.push({ id: p.s.id, scene_id: p.s.id, x: fx, y: fy, w: FW_, h: p.h, cls: `aFrame k-${p.s.kind}`, scene: p.s, num: idx + 1, cat, nProd });
      steps.push({ id: p.s.id, scene_id: p.s.id, title: p.s.title, subtitle: p.s.subtitle, rect: M ? { x: fx, y: fy - 70, w: FW_, h: Math.min(p.h + 70, 900) } : { x: fx, y: fy, w: FW_, h: Math.min(p.h, FH + 40) }, pad: 0.015 });
      // Ürün karelerinde sunum alt adımları: önce kare, sonra "neden seçtik", sonra "neden alıp satabiliriz"
      if (p.s.kind === 'product') {
        const cs = p.s.card_ids.map(ctx.card);
        const area = pred => {
          const ids = new Set(cs.filter(pred).map(c => c.id));
          const rs = p.it.filter(([id]) => ids.has(id)).map(([, x, y, w, h]) => ({ x: fx + x, y: fy + y, w, h }));
          if (!rs.length) return null;
          const b = boundsOf(rs);
          return { x: b.x - 40, y: b.y - 40, w: b.w + 80, h: b.h + 80 };
        };
        const why = area(c => c.kind === 'inference' || c.kind === 'entity');
        const eco = area(c => c.kind === 'metric' || c.kind === 'recommendation');
        if (why) steps.push({ id: p.s.id + '#why', scene_id: p.s.id, sub: true, title: `${p.s.title} — Neden seçtik`, subtitle: 'Sinyal, satıcılar ve fiyatlar', rect: why, pad: 0.03 });
        if (eco) steps.push({ id: p.s.id + '#eco', scene_id: p.s.id, sub: true, title: `${p.s.title} — Biz neden alıp satabiliriz`, subtitle: 'Birim ekonomisi (TAHMİN) ve sitemizde konumlandırma (ÖNERİ)', rect: eco, pad: 0.03 });
      }
    });
    rowY += rh + GY_;
  }
  return { positions, frames, steps };
}

function renderFrame(f, ctx) {
  const s = f.scene;
  const kicker = s.kind === 'product'
    ? `<span style="color:${f.cat?.color}">ÜRÜN ${s.rank} / ${f.nProd}</span> · ${esc(f.cat?.label || '')}`
    : s.is_chapter ? 'BÖLÜM' : 'SAHNE';
  return `<div class="aCap"><b>${String(f.num).padStart(2, '0')}</b><span>${esc(s.title)}</span></div>
    <div class="aHead">
      <div class="aKick">${kicker}</div>
      <h2>${esc(s.title)}</h2>
      <p>${esc(s.subtitle || '')}</p>
    </div>
    ${f.cat ? `<div class="aStripe" style="background:${f.cat.color}"></div>` : ''}`;
}

function renderCard(c, ctx) {
  const dt = dtBadge(c.evidence?.data_type, 'is-mini');
  const foot = `<div class="aFoot">${idTag(c)}${dt}</div>`;
  const cat = ctx.cat(c);
  switch (c.kind) {
    case 'entity': {
      const ent = c.record_ref.entity;
      if (ent === 'price_observation') {
        const ml = c.fields.find(f => f.key === 'match_level');
        return `<div class="aIn"><div class="aKick">Satıcı</div><h4>${esc(c.title)}</h4>
          ${c.big ? `<div class="aBig s">${esc(c.big.value)}<small>${esc(c.big.label)}</small></div>` : ''}
          <div class="aMatch">${valueHtml(ml)} ${dtBadge(ml.data_type, 'is-mini')}</div>${flagsRow(c)}</div>${foot}`;
      }
      if (ent === 'company') return `<div class="aIn"><div class="aKick">${esc(ctx.entityLabel(c))}</div><h4 class="aOne">${esc(c.title)}</h4>${c.big ? `<div class="aBig s">${esc(c.big.value)}<small>${esc(c.big.label)}</small></div>` : ''}<div class="aRows">${fieldRows(c, 3)}</div></div>${foot}`;
      if (c.id.endsWith('-same') || c.id.startsWith('same-')) return `<div class="aIn"><div class="aKick" style="color:${cat?.color}">Aynı ürün · ${esc(cat?.label || '')}</div><h4>${esc(c.title)}</h4><div class="aRows">${fieldRows(c, 4)}</div>${flagsRow(c)}</div>${foot}`;
      return `<div class="aIn"><div class="aKick" style="color:${cat?.color}">${esc(ctx.entityLabel(c))}${c.rank ? ` · #${c.rank}` : ''}</div>
        <h3>${esc(c.title)}</h3><p class="aSub">${esc(c.subtitle || '')}</p>
        ${c.big ? `<div class="aBig">${esc(c.big.value)}<small>${esc(c.big.label)}</small></div>` : ''}
        <div class="aRows two">${fieldRows(c, 4, ['category', 'price'])}</div>${flagsRow(c)}</div>${foot}`;
    }
    case 'metric':
      return `<div class="aIn">${c.subtitle ? `<div class="aKick">${esc(c.subtitle)}</div>` : ""}<h4>${esc(c.title)}</h4>
        <div class="aBig">${esc(c.big?.value ?? '')}<small>${esc(c.big?.label ?? '')}</small></div>
        ${c.fields.length > 1 ? `<div class="aRows">${fieldRows(c, 5)}</div>` : ''}${bars(c)}${flagsRow(c)}</div>${foot}`;
    case 'media': {
      const p = prov(c.provider);
      return `<div class="aCover" style="--cc:${cat?.color || '#555'}"><div class="aPlay">${p.icon}</div>
        <div class="aCovTxt"><div class="aKick">${esc(p.label)}</div><h4>${esc(c.title)}</h4><p>${esc(c.subtitle)}</p></div>
        <div class="aAct">${mediaAction(c, ctx)}</div></div>${foot}`;
    }
    case 'inference': {
      const inf = ctx.inf(c.inference_ids[0]);
      return `<div class="aIn aQuote"><div class="aKick">${esc(c.title)} ${inf ? confBadge(inf.confidence) : ''}</div>
        <blockquote>${esc(c.body?.[0] || '')}</blockquote></div>${foot}`;
    }
    case 'recommendation':
      return `<div class="aIn"><div class="aKick" style="color:var(--rec)">➜ ${esc(c.title)}${c.subtitle ? ` · ${esc(c.subtitle)}` : ''}</div>
        ${c.big ? `<div class="aBig">${esc(c.big.value)}<small>${esc(c.big.label)}</small></div>` : ''}<div class="aRows">${fieldRows(c, 3)}</div></div>${foot}`;
    case 'gap':
      return `<div class="aIn aGap"><div class="flags">${c.flags.map(flagBadge).join('')}</div><h4>${esc(c.title)}</h4>
        ${c.big ? `<div class="aBig s">${esc(c.big.value)}<small>${esc(c.big.label)}</small></div>` : ''}
        <ul>${(c.body || []).slice(0, 10).map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>${foot}`;
    case 'text':
      return `<div class="aIn"><div class="aKick">${esc(c.subtitle || '')}</div><h3>${esc(c.title)}</h3>
        <ul class="aList">${c.body.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>${foot}`;
    case 'matrix':
      return `<div class="aIn"><div class="aKick">${esc(c.subtitle)}</div>${matrixHtml(c, ctx)}</div>${foot}`;
  }
  return `<div class="aIn"><h4>${esc(c.title)}</h4></div>${foot}`;
}

startConcept({
  id: 'a', name: 'A — Cinematic Editorial', label: 'A · Cinematic Editorial',
  layout, renderFrame, renderCard,
  transition: 'fly', kenBurns: true, flyDuration: 1400, insetBottom: 8, insetBottomMobile: 8,
  help: 'Alt film şeridindeki karelere tıklayarak sahneye uçun. Bir karta tıklayınca başka karelerdeki bağlantılı kartlar (ör. aynı ürünü satan firmalar) altın çizgiyle bağlanır ve film şeridinde sayıyla işaretlenir. Üstteki arama kutusu ürün, satıcı veya kayıt ID ile bulur. Sunumda ürün kareleri üç adımda anlatılır: kare → neden seçtik → neden alıp satabiliriz.',
  initialRect: api => api.ctx.mobile ? api.steps[0].rect : api.worldBounds,
  onSelect(c, api) { A.drawLinks?.(c); },
  onStep(step) { A.markStep?.(step); },
  onReady(api) {
    const { canvas, positions, cardEls, data, config } = api;
    // Kart → kare indeksi (kareler sahne sırasıyla dizili)
    const frameOfCard = new Map();
    data.scenes.forEach((s, i) => s.card_ids.forEach(id => frameOfCard.set(id, i)));
    const frameSteps = api.steps.map((s, i) => ({ s, i })).filter(x => !x.s.sub);

    // ---- Film şeridi (yalnızca kareler; alt adımlar sunumda)
    const strip = document.createElement('nav');
    strip.className = 'aStrip sb-chrome sb-scrollable';
    strip.setAttribute('aria-label', 'Film şeridi');
    strip.innerHTML = frameSteps.map(({ s, i }, k) => {
      const sc = data.scenes.find(x => x.id === s.scene_id);
      const cat = sc?.category ? config.categories.find(c => c.id === sc.category) : null;
      return `<button data-i="${i}" data-scene="${esc(s.scene_id)}" title="${esc(s.title)}" style="--cc:${cat?.color || 'var(--accent)'}"><b>${String(k + 1).padStart(2, '0')}</b><span>${esc(s.title)}</span><em class="aBadge" hidden></em></button>`;
    }).join('');
    document.body.appendChild(strip);
    strip.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      canvas.animateTo(api.steps[+b.dataset.i].rect, { duration: 1200, pad: 0.015, insets: api.insets() });
    });
    strip.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    const btns = [...strip.children];
    const btnByScene = new Map(btns.map(b => [b.dataset.scene, b]));
    let lastBtn = null;
    const setActive = b => { if (b === lastBtn) return; lastBtn?.classList.remove('is-on'); b?.classList.add('is-on'); b?.scrollIntoView({ block: 'nearest', inline: 'center' }); lastBtn = b; };
    A.markStep = step => step && setActive(btnByScene.get(step.scene_id));

    // ---- Ekran dışı kareleri çizimden çıkar (yalnızca görünmeyenler; yakınlaştırma içerik gizlemez)
    const frames = api.frames;
    const frameEls = [...document.querySelectorAll('.sb-frame')];
    const groups = frames.map(() => []);
    for (const [id, el] of cardEls) { const fi = frameOfCard.get(id); if (fi !== undefined) groups[fi].push(el); }
    const vis = frames.map(() => true);
    function cull() {
      const v = canvas.viewportWorldRect(), m = Math.max(v.w, v.h) * 0.15;
      frames.forEach((f, i) => {
        const on = f.x < v.x + v.w + m && f.x + f.w > v.x - m && f.y - 120 < v.y + v.h + m && f.y + f.h > v.y - m;
        if (on === vis[i]) return;
        vis[i] = on;
        frameEls[i]?.classList.toggle('is-off', !on);
        groups[i].forEach(el => el.classList.toggle('is-off', !on));
      });
    }
    canvas.onChange(() => {
      cull();
      const v = canvas.viewportWorldRect(), cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const f = frames.find(f => cx >= f.x && cx <= f.x + f.w && cy >= f.y - 150 && cy <= f.y + f.h + 150);
      if (f && !document.body.classList.contains('sb-presenting')) setActive(btnByScene.get(f.scene_id));
    });
    requestAnimationFrame(cull);

    // ---- Kareler arası bağlantılar: seçili kartın başka karelerdeki ilişkileri altın çizgiyle
    const B = api.worldBounds;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'aLinks');
    Object.assign(svg.style, { left: B.x - 400 + 'px', top: B.y - 400 + 'px', width: B.w + 800 + 'px', height: B.h + 800 + 'px' });
    svg.setAttribute('viewBox', `${B.x - 400} ${B.y - 400} ${B.w + 800} ${B.h + 800}`);
    canvas.world.insertBefore(svg, api.cardLayer.nextSibling);
    A.drawLinks = c => {
      btns.forEach(b => { b.classList.remove('has-link'); b.querySelector('.aBadge').hidden = true; });
      svg.innerHTML = '';
      if (!c) return;
      const p0 = positions.get(c.id); if (!p0) return;
      const f0 = frameOfCard.get(c.id);
      const far = c.related_card_ids.filter(id => positions.has(id) && frameOfCard.get(id) !== f0);
      const ax = p0.x + p0.w / 2, ay = p0.y + p0.h / 2;
      svg.innerHTML = far.map(id => {
        const p = positions.get(id), bx = p.x + p.w / 2, by = p.y + p.h / 2;
        const mx = (ax + bx) / 2, my = Math.min(ay, by) - Math.min(900, Math.hypot(bx - ax, by - ay) * 0.18);
        return `<path d="M${ax},${ay} Q${mx},${my} ${bx},${by}"/><circle cx="${bx}" cy="${by}" r="18"/>`;
      }).join('') + `<circle class="aSrc" cx="${ax}" cy="${ay}" r="22"/>`;
      // Film şeridinde hangi karelerde kaç bağlantı var
      const counts = new Map();
      far.forEach(id => { const s = data.scenes[frameOfCard.get(id)]; counts.set(s.id, (counts.get(s.id) || 0) + 1); });
      for (const [sid, n] of counts) { const b = btnByScene.get(sid); if (!b) continue; b.classList.add('has-link'); const bd = b.querySelector('.aBadge'); bd.hidden = false; bd.textContent = n; }
      if (far.length && !api.ctx.mobile) api.toast(`${far.length} bağlantılı kart ${counts.size} başka karede — film şeridinde işaretli`);
    };

    // ---- Arama (ürün, satıcı, kayıt ID)
    const box = document.createElement('div');
    box.className = 'aSearch sb-chrome';
    box.innerHTML = `<input type="search" placeholder="Ara: ürün, satıcı, kayıt ID" aria-label="Ara"><div class="aRes sb-scrollable" hidden></div>`;
    if (ctx_mobile()) document.querySelector('.sb-tools').prepend(box); else document.querySelector('.sb-tools').before(box);
    const q = box.querySelector('input'), res = box.querySelector('.aRes');
    const pool = data.cards.filter(c => positions.has(c.id));
    const norm = s => String(s || '').toLocaleLowerCase('tr');
    q.addEventListener('input', () => {
      const t = norm(q.value.trim());
      if (t.length < 2) { res.hidden = true; return; }
      const hits = pool.filter(c => norm(`${c.title} ${c.subtitle || ''} ${c.record_ref?.id || ''}`).includes(t)).slice(0, 14);
      res.hidden = false;
      res.innerHTML = hits.length ? hits.map(c => {
        const fi = frameOfCard.get(c.id);
        return `<button data-goto="${esc(c.id)}"><b>${esc(c.title)}</b><small>${esc(data.scenes[fi]?.title || '')} · ${esc(c.record_ref?.id || '')}</small></button>`;
      }).join('') : '<p>Sonuç yok</p>';
    });
    q.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') res.querySelector('[data-goto]')?.click();
      if (e.key === 'Escape') { q.value = ''; res.hidden = true; q.blur(); }
    });
    res.addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if (!b) return; res.hidden = true; api.focusCard(b.dataset.goto); });
    document.addEventListener('click', e => { if (!box.contains(e.target)) res.hidden = true; });
  },
});
const A = {};
const ctx_mobile = () => document.body.classList.contains('sb-mobile');
