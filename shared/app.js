// Ortak uygulama kabuğu: veri yükleme, kart yerleşimi, detay paneli, medya oynatıcı,
// notlar, sunum modu, klavye, URL parametreleri. Konseptler yalnızca yerleşim + kart tasarımı + kendi
// gezinme öğelerini sağlar (bkz. a/, b/, c/ main.js).
import { createCanvas, boundsOf } from './engine.js';
import { buildDemo } from './demo-data.js';
import { createNotes } from './notes.js';
import { createUserMedia } from './usermedia.js';
import * as EV from './evidence.js';

const { esc } = EV;

export async function startConcept(def) {
  const qs = new URLSearchParams(location.search);
  const cfgName = (qs.get('config') || 'mobilya').replace(/[^a-z0-9_-]/gi, '');
  const config = await (await fetch(`../config/sector.${cfgName}.json`)).json();
  const nParam = Number(qs.get('n')) || 0;
  // n > 100 → hedef kart sayısı (≈10 kart/ürün); aksi halde ürün sayısı
  const products = nParam > 100 ? Math.max(4, Math.round((nParam - 40) / 10)) : nParam || undefined;
  // Veri: gerçek (data/storyboard.<config>.json) varsa o; ?demo=1 veya dosya yoksa DEMO
  let data = null;
  if (qs.get('demo') !== '1' && !nParam) {
    try { const r = await fetch(`../data/storyboard.${cfgName}.json`, { cache: 'no-store' }); if (r.ok) data = await r.json(); } catch {}
  }
  if (!data) data = buildDemo(config, { products });
  const REAL = data.meta?.data_mode === 'GERÇEK';
  const ui = config.ui;
  const cardById = new Map(data.cards.map(c => [c.id, c]));
  const mediaById = new Map(data.media.map(m => [m.id, m]));
  const infById = new Map(data.inferences.map(i => [i.id, i]));
  const catById = new Map(config.categories.map(c => [c.id, c]));
  const ENT = config.entities;

  // Mobil: dar ekran veya dokunmatik telefon/tablet. Sonsuz tuval aynen kalır; yalnızca yerleşim ve arayüz uyarlanır.
  const MOBILE = matchMedia('(max-width: 760px)').matches || (matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820);
  document.title = `${def.name} — ${config.title}`;
  document.body.classList.add('sb-body', `concept-${def.id}`);
  if (MOBILE) document.body.classList.add('sb-mobile');
  // Ekran mobil/masaüstü eşiğini geçerse yerleşimi yeniden kur
  matchMedia('(max-width: 760px)').addEventListener('change', e => { if (e.matches !== MOBILE && !matchMedia('(pointer: coarse)').matches) location.reload(); });
  document.body.innerHTML = `
    <header class="sb-top">
      <div class="sb-brand"><span class="sb-concept">${esc(def.label)}</span><b>${esc(config.title)}</b><span class="sb-sub">${esc(config.subtitle || '')}</span></div>
      <div class="sb-demo ${REAL ? 'is-real' : ''}" role="status" title="${REAL ? esc(data.meta.selection_rule || '') : ''}">${REAL ? (MOBILE ? 'GERÇEK VERİ' : 'GERÇEK VERİ · öneriler karar değildir') : (MOBILE ? 'DEMO VERİ' : esc(ui.demo_banner))}</div>
      <nav class="sb-tools" aria-label="Araçlar">
        <button data-cmd="present" class="is-primary" title="Sunum modu (P)">▶ ${esc(ui.present)}</button>
        <button data-cmd="fit" title="Tümünü gör (0)">${esc(ui.fit)}</button>
        <button data-cmd="note" title="Not ekle (N) — tuvale veya karta tıkla">✎ ${esc(ui.add_note)}</button>
        <button data-cmd="undo" title="Notu geri al (Ctrl+Z)">↶</button>
        <label class="sb-switch" title="Kullanıcı notlarını göster/gizle"><input type="checkbox" data-cmd="notes" checked> ${esc(ui.notes)}</label>
        <label class="sb-switch" title="ACCEPTED/APPROVED olmayan kayıtlar (sunumda hep gizli)"><input type="checkbox" data-cmd="drafts"> ${esc(ui.drafts)}</label>
        <button data-cmd="help" title="Yardım (?)">?</button>
      </nav>
      <button class="sb-menuBtn" data-cmd="menu" aria-label="Menü" aria-expanded="false">⋯</button>
    </header>
    <main class="sb-stage"><div class="sb-viewport" id="vp"></div></main>
    <aside class="sb-detail sb-scrollable" aria-label="Kart detayı" hidden></aside>
    <div class="sb-modal" hidden></div>
    <div class="sb-help" hidden></div>
    <div class="sb-presentBar" hidden></div>
    <div class="sb-fade"></div>
    <div class="sb-toast" aria-live="polite"></div>
    <div class="sb-legend" aria-label="Lejant">
      ${EV.dtBadge('DOĞRUDAN_GÖZLEM')}${EV.dtBadge('TAHMİN')}${EV.dtBadge('ANALİST_YORUMU')}${EV.dtBadge('TİCARİ_ÖNERİ')}
      <span class="sb-dt sb-dt-note"><i>✎</i>NOT</span>
      ${EV.flagBadge('BULUNAMADI')}${EV.flagBadge('TEKLİF_ALINMALI')}${EV.flagBadge('DOĞRULANAMADI')}
    </div>`;

  const vp = document.getElementById('vp');
  const detailEl = document.querySelector('.sb-detail');
  const modalEl = document.querySelector('.sb-modal');
  const helpEl = document.querySelector('.sb-help');
  const barEl = document.querySelector('.sb-presentBar');
  const fadeEl = document.querySelector('.sb-fade');
  const toastEl = document.querySelector('.sb-toast');

  let noteMode = false, selected = null, presenting = false, stepIdx = 0;
  const canvas = createCanvas(vp, {
    minZoom: def.minZoom ?? 0.02, maxZoom: def.maxZoom ?? 2.5,
    onBackgroundClick: e => {
      if (noteMode) { const p = canvas.screenToWorld(e.clientX, e.clientY); notes.add({ x: p.x, y: p.y }); setNoteMode(false); return; }
      closeDetail();
    },
    // Çift dokunuş: karta yakınlaş; zaten yakınsa bir kademe uzaklaş
    onDoubleTap: (e, p) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.sb-card');
      const r = el ? positions.get(el.dataset.id) : null;
      if (r) { const t = expand(r, Math.max(r.w, r.h) * 0.15); const vr = canvas.viewportWorldRect(); if (vr.w < t.w * 1.6) canvas.animateTo(expand(r, Math.max(r.w, r.h) * 1.5), { duration: 450, dip: 0, insets: insets() }); else canvas.animateTo(t, { duration: 450, dip: 0, insets: insets() }); }
      else { const vr = canvas.viewportWorldRect(); canvas.animateTo({ x: p.x - vr.w / 4, y: p.y - vr.h / 4, w: vr.w / 2, h: vr.h / 2 }, { duration: 400, dip: 0, pad: 0 }); }
    },
  });

  const ctx = {
    config, data, EV, esc, ui, ENT,
    cat: c => catById.get(c.category) || null,
    media: id => mediaById.get(id), inf: id => infById.get(id), card: id => cardById.get(id),
    entityLabel: c => (ENT[c.record_ref?.entity] || {}).label || c.record_ref?.entity || '',
    mobile: MOBILE,
  };

  // ---- Yerleşim (konsepte özgü)
  const L = def.layout(data, config, ctx);
  const positions = L.positions;

  // Çerçeveler (sahne zeminleri)
  const frameHtml = (L.frames || []).map(f => `<div class="sb-frame sb-bgClick ${f.cls || ''}" data-scene="${esc(f.scene_id || '')}" style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px">${def.renderFrame ? def.renderFrame(f, ctx) : ''}</div>`).join('');
  const frameLayer = document.createElement('div');
  frameLayer.className = 'sb-frameLayer';
  frameLayer.innerHTML = frameHtml;
  canvas.world.appendChild(frameLayer);

  // Kenarlar (yalnızca konsept isterse)
  let edgeSvg = null;
  if (L.edges?.length) {
    const all = boundsOf([...positions.values()]);
    edgeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    edgeSvg.setAttribute('class', 'sb-edges');
    Object.assign(edgeSvg.style, { left: all.x - 500 + 'px', top: all.y - 500 + 'px', width: all.w + 1000 + 'px', height: all.h + 1000 + 'px' });
    edgeSvg.setAttribute('viewBox', `${all.x - 500} ${all.y - 500} ${all.w + 1000} ${all.h + 1000}`);
    edgeSvg.innerHTML = L.edges.map((e, i) => {
      const a = positions.get(e.from), b = positions.get(e.to);
      if (!a || !b) return '';
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay;
      const k = e.curve ?? 0.15;
      return `<path data-from="${esc(e.from)}" data-to="${esc(e.to)}" class="sb-edge t-${esc(e.type)}" d="M${ax},${ay} Q${mx - dy * k},${my + dx * k} ${bx},${by}"/>`;
    }).join('');
    canvas.world.appendChild(edgeSvg);
  }

  // Kartlar
  const cardLayer = document.createElement('div');
  cardLayer.className = 'sb-cardLayer';
  const cardEls = new Map();
  const parts = [];
  for (const c of data.cards) {
    const p = positions.get(c.id); if (!p) continue;
    const dti = EV.dtInfo(c.evidence?.data_type);
    const cat = ctx.cat(c);
    const draft = EV.isDraft(c);
    parts.push(`<article class="sb-card k-${c.kind} dt-${dti.cls} ${draft ? 'is-draft' : ''} ${c.flags.length ? 'has-flag' : ''}" data-id="${esc(c.id)}" tabindex="-1"
      style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;${cat ? `--cat:${cat.color};` : ''}">
      ${def.renderCard(c, ctx, p)}
      ${draft ? `<span class="sb-draftTag">TASLAK · ${esc(c.evidence.status)}</span>` : ''}
    </article>`);
  }
  cardLayer.innerHTML = parts.join('');
  canvas.world.appendChild(cardLayer);
  cardLayer.querySelectorAll('.sb-card').forEach(el => cardEls.set(el.dataset.id, el));

  const worldBounds = boundsOf([...positions.values(), ...(L.frames || [])]);
  const insets = () => MOBILE
    ? { top: 8, left: 0, right: 0, bottom: presenting ? 96 : (detailEl.hidden ? (def.insetBottomMobile ?? 8) : detailEl.offsetHeight + 8) }
    : ({ top: presenting ? 8 : (def.insetTop || 8), bottom: presenting ? 90 : (def.insetBottom || 8), left: def.insetLeft || 0, right: (detailEl.hidden ? 0 : detailEl.offsetWidth + 16) + (def.insetRight || 0) });

  // ---- Notlar
  const notes = createNotes({
    canvas, concept: `${def.id}${cfgName !== 'mobilya' ? '-' + cfgName : ''}`,
    getCardRect: id => positions.get(id), ui,
    onStatus: (m, warn) => toast(m, warn),
    onChange: () => { if (selected && !detailEl.hidden) openDetail(selected, { keepCam: true }); },
  });
  await notes.load();

  // ---- Olaylar
  cardLayer.addEventListener('click', e => {
    const cell = e.target.closest('[data-cell]');
    const el = e.target.closest('.sb-card'); if (!el) return;
    const c = cardById.get(el.dataset.id);
    if (noteMode) { notes.add({ target_card_id: c.id }); setNoteMode(false); return; }
    if (cell) { openCell(c, cell.dataset.cell); return; }
    if (c.kind === 'media' && c.media_ids[0]) { openMedia(c.media_ids[0], c); select(c); return; }
    openDetail(c);
  });
  vp.addEventListener('dblclick', e => {
    if (MOBILE || e.target.closest('.sb-card, .sb-note')) return;
    const p = canvas.screenToWorld(e.clientX, e.clientY); notes.add({ x: p.x, y: p.y });
  });

  // Mobil menü (⋯): araçlar açılır panelde
  const toolsEl = document.querySelector('.sb-tools'), menuBtn = document.querySelector('.sb-menuBtn');
  const setMenu = v => { toolsEl.classList.toggle('is-open', v); menuBtn.setAttribute('aria-expanded', String(v)); };
  menuBtn.addEventListener('click', () => setMenu(!toolsEl.classList.contains('is-open')));
  document.addEventListener('pointerdown', e => { if (toolsEl.classList.contains('is-open') && !toolsEl.contains(e.target) && e.target !== menuBtn) setMenu(false); });
  // Uzun basma (dokunmatik): boşluğa = serbest not, karta = bağlı yorum
  let lp = null;
  vp.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || e.target.closest('.sb-note, button, a, input, textarea')) return;
    const sx = e.clientX, sy = e.clientY, card = e.target.closest('.sb-card')?.dataset.id;
    clearTimeout(lp?.t);
    lp = { sx, sy, card, fired: false, t: setTimeout(() => {
      if (!lp || canvas.pointerCount() !== 1) return;
      lp.fired = true;
      if (navigator.vibrate) navigator.vibrate(15);
      toast(card ? 'Bırakın: bu karta yorum eklenecek' : 'Bırakın: buraya not eklenecek');
    }, 550) };
  });
  const lpCancel = e => {
    if (!lp) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - lp.sx, e.clientY - lp.sy) <= 8) return;
    clearTimeout(lp.t);
    const l = lp; lp = null;
    if (e.type === 'pointerup' && l.fired) {
      canvas.suppressNextClick();
      setTimeout(() => { if (l.card) notes.add({ target_card_id: l.card }); else { const p = canvas.screenToWorld(l.sx, l.sy); notes.add({ x: p.x, y: p.y }); } }, 60);
    }
  };
  ['pointermove', 'pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, lpCancel));
  // Sunumda kaydırma hareketi: sola = ileri, sağa = geri
  let sw = null;
  vp.addEventListener('pointerdown', e => { if (presenting && e.pointerType === 'touch') sw = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  window.addEventListener('pointerup', e => {
    if (!sw || !presenting) { sw = null; return; }
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y, dt = performance.now() - sw.t; sw = null;
    if (dt < 500 && Math.abs(dx) > 60 && Math.abs(dy) < Math.abs(dx) * 0.6) goStep(stepIdx + (dx < 0 ? 1 : -1));
  });

  toolsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-cmd]'); if (!b) return;
    setMenu(false);
    ({ present: () => startPresent(0, true), fit: fitAll, note: () => setNoteMode(!noteMode), undo: () => { if (!notes.undo()) toast('Geri alınacak not işlemi yok'); }, help: toggleHelp })[b.dataset.cmd]?.();
  });
  document.querySelector('[data-cmd="notes"]').addEventListener('change', e => notes.setVisible(e.target.checked));
  document.querySelector('[data-cmd="drafts"]').addEventListener('change', e => document.body.classList.toggle('sb-showDrafts', e.target.checked));

  function setNoteMode(v) { noteMode = v; document.body.classList.toggle('sb-noteMode', v); document.querySelector('[data-cmd="note"]').classList.toggle('is-on', v); if (v) toast('Not: tuvalde boş bir yere (serbest not) veya bir karta (bağlı yorum) tıklayın'); }
  function toast(m, warn) { toastEl.textContent = m; toastEl.classList.toggle('is-warn', !!warn); toastEl.classList.add('is-on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('is-on'), 2600); }
  function fitAll() { canvas.animateTo(worldBounds, { duration: 800, pad: 0.03, insets: insets() }); }

  // ---- Seçim ve detay
  function select(c) {
    document.querySelectorAll('.sb-card.is-selected, .sb-card.is-related').forEach(el => el.classList.remove('is-selected', 'is-related'));
    selected = c;
    if (!c) { cardLayer.classList.remove('has-selection'); edgeSvg?.classList.remove('has-hot'); edgeSvg?.querySelectorAll('.is-hot').forEach(p => p.classList.remove('is-hot')); def.onSelect?.(null, api); return; }
    cardEls.get(c.id)?.classList.add('is-selected');
    c.related_card_ids.forEach(id => cardEls.get(id)?.classList.add('is-related'));
    cardLayer.classList.add('has-selection');
    if (edgeSvg) {
      edgeSvg.classList.add('has-hot');
      edgeSvg.querySelectorAll('.is-hot').forEach(p => p.classList.remove('is-hot'));
      edgeSvg.querySelectorAll(`[data-from="${CSS.escape(c.id)}"], [data-to="${CSS.escape(c.id)}"]`).forEach(p => p.classList.add('is-hot'));
    }
    def.onSelect?.(c, api);
  }

  function chip(id) {
    const c = cardById.get(id); if (!c) return `<span class="sb-chip is-missing">${esc(id)}</span>`;
    return `<button class="sb-chip dt-${EV.dtInfo(c.evidence?.data_type).cls}" data-goto="${esc(id)}" title="${esc(c.record_ref?.id)}">${esc(c.title)}<small>${esc(c.record_ref?.id || '')}</small></button>`;
  }
  function infHtml(inf, title) {
    return `<div class="sb-inf">
      <div class="sb-infHead">${EV.dtBadge('ANALİST_YORUMU')} <b>${esc(title)}</b> ${EV.confBadge(inf.confidence)}</div>
      <p>${esc(inf.text)}</p>
      <div class="sb-infBase"><span>Dayandığı kayıtlar:</span> ${inf.based_on_ids.map(chip).join('')}</div>
      <div class="sb-infId">${esc(inf.id)} · gözlem değildir, yorumdur</div>
    </div>`;
  }

  function openDetail(c, o = {}) {
    select(c);
    const infs = [...new Set([...c.inference_ids, ...data.inferences.filter(i => i.target_ids.includes(c.id)).map(i => i.id)])].map(id => infById.get(id)).filter(Boolean);
    const myNotes = notes.list(c.id);
    const linksOut = data.links.filter(l => l.from === c.id || l.to === c.id);
    detailEl.innerHTML = `
      <button class="sb-grab" data-grab aria-label="Paneli büyüt / küçült"></button>
      <div class="sb-dHead">
        <div class="sb-dMeta">${EV.dtBadge(c.evidence?.data_type)} ${c.flags.map(EV.flagBadge).join('')} ${EV.statusBadge(c.evidence?.status)}</div>
        <button class="sb-x" data-close title="Kapat (Esc)">✕</button>
      </div>
      <h3>${esc(c.title)}</h3>
      ${c.subtitle ? `<p class="sb-dSub">${esc(c.subtitle)}</p>` : ''}
      <div class="sb-dId">${esc(ctx.entityLabel(c))} · ${EV.idTag(c)} · v${c.record_ref?.version || 1}</div>
      ${c.fields.length ? `<table class="sb-fields">${c.fields.map(f => `<tr><th>${esc(f.label)}</th><td>${EV.valueHtml(f)}</td><td class="sb-fdt">${EV.dtBadge(f.data_type, 'is-mini')}</td></tr>`).join('')}</table>` : ''}
      ${c.body ? `<div class="sb-dBody">${c.body.map(b => `<p>${esc(b)}</p>`).join('')}</div>` : ''}
      ${c.kind === 'matrix' ? '<p class="sb-hint">Tuvaldeki tablo hücresine tıklayın: o satıcı ve kategorideki reklamlar burada listelenir.</p>' : ''}
      ${infs.length ? `<section><h4>${esc(ui.why_here)} / çıkarım</h4>${infs.map(i => infHtml(i, cardById.get(i.id)?.title || ui.why_here)).join('')}</section>` : ''}
      <section class="sb-dMedia"><h4>Medya ve bağlantılar</h4>${c.media_ids.map(id => { const m = mediaById.get(id); return `<button class="sb-mediaBtn" data-media="${esc(id)}">▶ ${esc(m.title)} <small>${esc(m.provider)}</small></button>`; }).join('')}${userMedia.forCard(c.id).map(it => `<button class="sb-mediaBtn is-user" data-media="${esc(it.id)}">🔗 ${esc(it.title)} <small>KULLANICI EKLEDİ</small></button>`).join('')}${addFormHtml(c.id)}</section>
      ${linksOut.length ? `<section><h4>İlişkili kartlar (${linksOut.length})</h4><div class="sb-chips">${linksOut.slice(0, 40).map(l => chip(l.from === c.id ? l.to : l.from)).join('')}</div></section>` : ''}
      <section class="sb-dNotes"><h4>✎ Kullanıcı notları (${myNotes.length})</h4>
        ${myNotes.map(n => `<div class="sb-dNote"><span class="sb-noteTag">${esc(ui.user_note)}</span><p>${esc(n.text) || '<em>(boş)</em>'}</p></div>`).join('')}
        <button class="sb-addComment" data-comment="${esc(c.id)}">+ Bu karta yorum ekle</button>
      </section>
      ${EV.evidenceBlock(c.evidence, ui)}`;
    const wasHidden = detailEl.hidden;
    detailEl.hidden = false;
    document.body.classList.add('sb-detailOpen');
    if (MOBILE && !o.keepCam && !presenting) {
      const r = positions.get(c.id);
      if (r) { const v = canvas.viewSize(), ins = insets(); const z = Math.min(2.5, v.w / (r.w + 20)); canvas.animateTo({ x: r.x - 10, y: r.y - 10, w: r.w + 20, h: Math.max(r.h + 20, (v.h - ins.bottom - 8) / z) }, { duration: 550, pad: 0, dip: 0, insets: { ...ins, bottom: 0, top: 0 } }); }
    } else if (!o.keepCam && !presenting) {
      const r = positions.get(c.id);
      const vr = canvas.viewportWorldRect();
      const right = vr.x + vr.w - (detailEl.offsetWidth + 16) / canvas.cam.z;
      if (wasHidden && r && (r.x + r.w > right || r.x < vr.x || r.y < vr.y || r.y + r.h > vr.y + vr.h)) {
        canvas.animateTo(expand(r, Math.max(r.w, r.h) * 1.2), { duration: 600, insets: insets(), dip: 0 });
      }
    }
  }
  function closeDetail() { if (detailEl.hidden) return; detailEl.hidden = true; detailEl.classList.remove('is-full'); document.body.classList.remove('sb-detailOpen'); select(null); }
  const expand = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

  function focusCard(id, o = {}) {
    const c = cardById.get(id), r = positions.get(id); if (!c || !r) return;
    openDetail(c, { keepCam: true });
    canvas.animateTo(expand(r, Math.max(r.w, r.h) * (o.margin ?? 0.9)), { duration: o.duration ?? 800, insets: insets() });
    cardEls.get(id)?.classList.add('is-pulse'); setTimeout(() => cardEls.get(id)?.classList.remove('is-pulse'), 1400);
  }

  function openCell(c, key) {
    const [rowId, colId] = key.split('|');
    const ads = c.matrix.ads[key] || [];
    const row = c.matrix.rows.find(r => r.id === rowId), col = c.matrix.cols.find(x => x.id === colId);
    openDetail(c, { keepCam: true });
    const sec = document.createElement('section');
    sec.className = 'sb-ads';
    sec.innerHTML = `<h4>${esc(row?.label)} × ${esc(col?.label)} — ${ads.length} reklam</h4>
      ${ads.length ? ads.map(a => `<div class="sb-ad">
        <div class="sb-adHead">${EV.dtBadge('DOĞRUDAN_GÖZLEM', 'is-mini')} <b>${esc(a.start)}</b> · ${a.days} gün · ${a.active ? '<span class="sb-on">aktif</span>' : 'pasif'} <span class="sb-id">${esc(a.id)}</span></div>
        <p>${esc(a.text)}</p>
        <a href="${esc(a.library_url)}" target="_blank" rel="noopener noreferrer">Reklamı aç ↗</a>
      </div>`).join('') : `<p>${EV.flagBadge('BULUNAMADI')} Bu hücrede reklam yok.</p>`}
      <p class="sb-hint">Reklam süresi devamlılık sinyalidir; harcama veya satış göstermez.</p>`;
    detailEl.querySelector('.sb-dHead').after(sec);
    detailEl.scrollTop = 0;
  }

  detailEl.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closeDetail();
    if (e.target.closest('[data-grab]')) { detailEl.classList.toggle('is-full'); return; }
    const g = e.target.closest('[data-goto]'); if (g) return focusCard(g.dataset.goto);
    const m = e.target.closest('[data-media]'); if (m) return openMedia(m.dataset.media, selected);
    const cm = e.target.closest('[data-comment]'); if (cm) { notes.add({ target_card_id: cm.dataset.comment }); const r = positions.get(cm.dataset.comment); if (r) canvas.animateTo(expand(r, r.w), { duration: 500, insets: insets(), dip: 0 }); }
  });

  // ---- Medya oynatıcı — her şey EKRAN İÇİNDE: resmi embed → çerçeve → doğrudan görsel/video → kendi reklam kartımız / sayfa önizlemesi.
  // Kaynağa yönlendirme yok; kaynak bağlantısı yalnızca kanıt olarak detayda durur. Kapatınca oynatıcı DOM'dan kaldırılır.
  const findAd = adId => data.media.find(m => m.ad?.id === String(adId));
  const fmtDate = d => d ? String(d).slice(0, 10) : '';
  function adCardHtml(m) {
    const a = m.ad || {};
    const plat = (a.platforms || []).map(p => ({ FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', MESSENGER: 'Messenger', AUDIENCE_NETWORK: 'Audience Network', THREADS: 'Threads', WHATSAPP: 'WhatsApp' }[p] || p)).join(' · ');
    const ch = { whatsapp: 'WhatsApp', instagram: 'Instagram', site: 'Kendi sitesi', yok: '' }[a.channel] ?? a.channel;
    return `<div class="sb-adCard">
      <div class="sb-adTop"><b>${esc(a.page || m.title)}</b><span>Sponsorlu${plat ? ` · ${esc(plat)}` : ''}</span></div>
      ${a.body ? `<div class="sb-adBody">${esc(a.body).replace(/\n/g, '<br>')}</div>` : '<div class="sb-adBody sb-hint">Bu reklamın metni verimizde yok.</div>'}
      ${a.poster ? `<img class="sb-adPoster" src="${esc(a.poster)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      ${a.title || a.cta ? `<div class="sb-adCta">${a.title ? `<span>${esc(a.title)}</span>` : ''}${a.cta ? `<b>${esc(a.cta)}</b>` : ''}</div>` : ''}
      <dl class="sb-adMeta">
        ${a.start ? `<div><dt>Yayın</dt><dd>${esc(fmtDate(a.start))}${a.end ? ` – ${esc(fmtDate(a.end))}` : ' – devam ediyor'}</dd></div>` : ''}
        ${a.days ? `<div><dt>Süre</dt><dd>${esc(a.days)} gün</dd></div>` : ''}
        ${ch ? `<div><dt>Yönlendirme</dt><dd>${esc(ch)}</dd></div>` : ''}
        ${a.cards > 1 ? `<div><dt>Biçim</dt><dd>${esc(a.cards)} kartlık kaydırmalı</dd></div>` : ''}
        ${a.id ? `<div><dt>Reklam kimliği</dt><dd>${esc(a.id)}</dd></div>` : ''}
      </dl>
    </div>`;
  }
  function previewHtml(m) {
    const p = m.preview || {};
    if (p.error) return `<div class="sb-openOnly"><p><b>${esc(m.title || 'Sayfa')}</b></p><p>Önizleme alınamadı (${esc(p.error)}). Bağlantı kayıtlı.</p></div>`;
    return `<div class="sb-pagePrev">
      ${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div class="sb-ppTxt"><small>${esc(p.site || '')}</small><b>${esc(p.title || m.title || '')}</b>${p.description ? `<p>${esc(p.description)}</p>` : ''}</div>
    </div>`;
  }
  const userMedia = createUserMedia({
    concept: def.id + (cfgName !== 'mobilya' ? '-' + cfgName : ''),
    onStatus: (msg, w) => toast(msg, w),
    onChange: () => { refreshBadges(); if (selected && !detailEl.hidden) openDetail(selected, { keepCam: true }); },
  });
  await userMedia.load();
  function refreshBadges() {
    cardLayer.querySelectorAll('.sb-umBadge').forEach(x => x.remove());
    const counts = new Map();
    userMedia.all().forEach(it => counts.set(it.target_card_id, (counts.get(it.target_card_id) || 0) + 1));
    for (const [id, n] of counts) { const el = cardEls.get(id); if (el) el.insertAdjacentHTML('beforeend', `<span class="sb-umBadge" title="Eklenen bağlantı">🔗 ${n}</span>`); }
  }
  refreshBadges();
  function addFormHtml(cardId) {
    return `<form class="sb-addUrl" data-addurl="${esc(cardId)}">
      <input type="url" name="u" placeholder="Bağlantı yapıştır: Instagram, YouTube, görsel, sayfa…" required>
      <button type="submit">Ekle</button>
    </form>`;
  }

  function openMedia(mediaId, c) {
    const m = mediaById.get(mediaId) || userMedia.get(mediaId); if (!m) return;
    const isUser = m.origin === 'KULLANICI EKLEDİ';
    const infs = data.inferences.filter(i => i.target_ids.includes(c?.id));
    const exp = (m.embeds || []).map(e => e.expires_at).filter(Boolean)[0];
    modalEl.hidden = false;
    document.body.classList.add('sb-modalOpen');
    modalEl.innerHTML = `<div class="sb-modalBox" role="dialog" aria-label="${esc(m.title)}">
      <div class="sb-player"></div>
      <div class="sb-mSide sb-scrollable">
        <button class="sb-x" data-mclose title="Kapat (Esc)">✕</button>
        <div class="sb-dMeta">${isUser ? '<span class="sb-userTag">🔗 KULLANICI EKLEDİ</span>' : EV.dtBadge('DOĞRUDAN_GÖZLEM')} <span class="sb-prov">${esc(m.label || m.provider)}</span></div>
        <h3>${esc(m.title)}</h3>
        <div class="sb-dId">${isUser ? esc(m.id) + ' · ' + esc(fmtDate(m.added_at)) : `${EV.idTag({ record_ref: m.record_ref })}${m.cover?.date ? ' · ' + esc(m.cover.date) : ''}${m.cover?.label ? ' · ' + esc(m.cover.label) : ''}`}</div>
        ${infs.map(i => infHtml(i, ui.why_here)).join('')}
        ${m.ad && (m.embeds || []).some(e => e.strategy === 'direct') ? adCardHtml(m) : ''}
        ${exp ? `<p class="sb-hint">Reklam görseli Meta'nın süreli bağlantısıyla gösteriliyor (${esc(fmtDate(exp))} tarihine kadar). Sonrasında reklam yine burada, metin ve bilgileriyle görünür.</p>` : ''}
        ${c ? `<section class="sb-mAdd"><h4>Bu karta bağlantı ekle</h4>${addFormHtml(c.id)}</section>` : ''}
        ${isUser ? `<button class="sb-linkBtn" data-umdel="${esc(m.id)}">Bu bağlantıyı kaldır</button>` : ''}
        ${c ? `<button class="sb-linkBtn" data-mdetail="${esc(c.id)}">Kayıt detayını aç</button>` : ''}
      </div></div>`;
    const player = modalEl.querySelector('.sb-player');
    const embeds = m.embeds || [];
    const cardFallback = () => m.ad ? adCardHtml(m) : m.preview ? previewHtml(m)
      : `<div class="sb-openOnly"><p><b>${esc(m.title)}</b></p><p>Bu içerik ekranda gösterilemiyor. Sağdaki alandan gösterilebilir bir bağlantı (Instagram, YouTube, görsel, video) ekleyebilirsiniz.</p></div>`;
    const tryEmbed = i => {
      const e = embeds[i];
      player.innerHTML = '';
      player.classList.remove('is-card');
      if (!e || ['ad_card', 'preview', 'open_only'].includes(e.strategy)) { player.classList.add('is-card'); player.innerHTML = cardFallback(); return; }
      if (e.strategy === 'official' || e.strategy === 'iframe') {
        const fr = document.createElement('iframe');
        fr.src = e.url; fr.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; fr.allowFullscreen = true;
        fr.referrerPolicy = 'strict-origin-when-cross-origin';
        if (e.strategy === 'iframe') fr.sandbox = 'allow-scripts allow-same-origin allow-popups allow-forms';
        fr.title = m.title; player.appendChild(fr);
      } else if (e.strategy === 'direct' && e.type === 'video') {
        const v = document.createElement('video');
        v.src = e.url; v.controls = true; v.autoplay = true; v.playsInline = true; if (e.poster) v.poster = e.poster;
        v.onerror = () => tryEmbed(i + 1); player.appendChild(v);
      } else if (e.strategy === 'direct') {
        const img = document.createElement('img');
        img.src = e.url; img.alt = m.title; img.referrerPolicy = 'no-referrer';
        img.onerror = () => tryEmbed(i + 1); player.appendChild(img);
      } else tryEmbed(i + 1);
    };
    tryEmbed(0);
  }
  async function submitUrl(form) {
    const input = form.querySelector('input'), btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = '…';
    try {
      const it = await userMedia.add(input.value, form.dataset.addurl, findAd);
      toast('Bağlantı eklendi');
      openMedia(it.id, cardById.get(form.dataset.addurl));
    } catch (err) { toast(String(err.message || err), true); btn.disabled = false; btn.textContent = 'Ekle'; }
  }
  document.addEventListener('submit', e => { const f = e.target.closest('.sb-addUrl'); if (!f) return; e.preventDefault(); submitUrl(f); });
  function closeMedia() { if (modalEl.hidden) return false; modalEl.innerHTML = ''; modalEl.hidden = true; document.body.classList.remove('sb-modalOpen'); if (detailEl.hidden) select(null); return true; }
  modalEl.addEventListener('click', e => {
    if (e.target === modalEl || e.target.closest('[data-mclose]')) return closeMedia();
    const d = e.target.closest('[data-mdetail]'); if (d) { closeMedia(); openDetail(cardById.get(d.dataset.mdetail)); return; }
    const del = e.target.closest('[data-umdel]'); if (del) { userMedia.remove(del.dataset.umdel); closeMedia(); toast('Bağlantı kaldırıldı'); return; }
    const g = e.target.closest('[data-goto]'); if (g) { closeMedia(); focusCard(g.dataset.goto); }
  });

  // ---- Sunum modu
  const steps = L.steps;
  function showBar() {
    const s = steps[stepIdx];
    barEl.innerHTML = `<button data-p="prev" title="Önceki (←)">‹</button>
      <div class="sb-pText"><span class="sb-pNum">${stepIdx + 1} / ${steps.length}</span><b>${esc(s.title)}</b>${s.subtitle ? `<span>${esc(s.subtitle)}</span>` : ''}</div>
      <button data-p="next" title="Sonraki (→ / Space)">›</button>
      <button data-p="fs" title="Tam ekran (F)">⛶</button>
      <button data-p="exit" title="Çık (Esc)">Çık</button>
      <div class="sb-pProg" style="--p:${(stepIdx + 1) / steps.length}"></div>`;
  }
  async function goStep(i, first) {
    stepIdx = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[stepIdx];
    showBar();
    def.onStep?.(s, stepIdx, api);
    const ins = insets();
    if (def.transition === 'fade' && !first) {
      fadeEl.classList.add('is-on');
      await new Promise(r => setTimeout(r, 260));
      canvas.jumpTo(s.rect, { pad: s.pad ?? 0.04, insets: ins });
      fadeEl.classList.remove('is-on');
    } else {
      await canvas.animateTo(s.rect, { duration: first ? 700 : def.flyDuration ?? 1200, pad: s.pad ?? 0.04, insets: ins, dip: def.dip });
    }
    if (def.kenBurns && presenting && stepIdx === steps.indexOf(s)) canvas.drift(0.04, 9000);
  }
  function startPresent(i = 0, fullscreen) {
    presenting = true; closeDetail(); closeMedia(); setNoteMode(false);
    document.body.classList.add('sb-presenting'); barEl.hidden = false;
    if (fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    goStep(i, true);
  }
  function stopPresent() {
    if (!presenting) return;
    presenting = false; canvas.stopAnim();
    document.body.classList.remove('sb-presenting'); barEl.hidden = true;
    def.onStep?.(null, -1, api);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  barEl.addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    ({ prev: () => goStep(stepIdx - 1), next: () => goStep(stepIdx + 1), fs: toggleFs, exit: stopPresent })[b.dataset.p]();
  });
  function toggleFs() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => toast('Tam ekran izni verilmedi', true)); }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && presenting && fsExitEndsPresent) stopPresent(); fsExitEndsPresent = !!document.fullscreenElement; });
  let fsExitEndsPresent = false;

  // ---- Yardım
  function toggleHelp() {
    helpEl.hidden = !helpEl.hidden;
    helpEl.innerHTML = `<div class="sb-helpBox"><button class="sb-x" data-hclose>✕</button><h3>Kullanım</h3>
      <table>
        <tr><th>Sürükle</th><td>Tuvalde gezin (pan)</td></tr>
        <tr><th>Tekerlek / pinch</th><td>İmlecin olduğu yere yakınlaş / uzaklaş</td></tr>
        <tr><th>Karta tıkla</th><td>Detay + kanıt; medya kartı → oynatıcı</td></tr>
        <tr><th>Çift tıkla (boşluk)</th><td>Serbest not</td></tr>
        <tr><th>N</th><td>Not modu (boşluğa = not, karta = bağlı yorum)</td></tr>
        <tr><th>Ctrl+Z</th><td>Not işlemini geri al</td></tr>
        <tr><th>P</th><td>Sunum modu · ← / → / Space · F tam ekran · Esc çık</td></tr>
        <tr><th>← / →</th><td>(sunum dışı) sahneler arasında uç</td></tr>
        <tr><th>0 · + · −</th><td>Tümünü gör · yakınlaş · uzaklaş</td></tr>
        <tr><th>Telefonda</th><td>İki parmak: yakınlaş/kaydır · Çift dokun: karta yaklaş · Uzun bas: not · Sunumda sola/sağa kaydır: ileri/geri · ⋯ menü: diğer araçlar</td></tr>
      </table>
      <p>${EV.dtBadge('DOĞRUDAN_GÖZLEM')} gözlem · ${EV.dtBadge('TAHMİN')} tahmin · ${EV.dtBadge('ANALİST_YORUMU')} yorum · ${EV.dtBadge('TİCARİ_ÖNERİ')} öneri. Kullanıcı notları sarı ve "KULLANICI NOTU" etiketlidir; araştırma verisine yazılmaz.</p>
      ${def.help ? `<p>${def.help}</p>` : ''}</div>`;
  }
  helpEl.addEventListener('click', e => { if (e.target === helpEl || e.target.closest('[data-hclose]')) helpEl.hidden = true; });

  // ---- Klavye
  let navIdx = -1;
  window.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    const k = e.key;
    if (k === 'Escape') {
      if (closeMedia()) return;
      if (!helpEl.hidden) { helpEl.hidden = true; return; }
      if (noteMode) return setNoteMode(false);
      if (presenting) return stopPresent();
      return closeDetail();
    }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); if (!notes.undo()) toast('Geri alınacak not işlemi yok'); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (presenting) {
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); goStep(stepIdx + 1); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); goStep(stepIdx - 1); }
      else if (k === 'f' || k === 'F') toggleFs();
      return;
    }
    if (!modalEl.hidden) return;
    if (k === 'p' || k === 'P') startPresent(0, true);
    else if (k === 'f' || k === 'F') toggleFs();
    else if (k === 'n' || k === 'N') setNoteMode(!noteMode);
    else if (k === '0') fitAll();
    else if (k === '+' || k === '=') canvas.zoomBy(1.25);
    else if (k === '-') canvas.zoomBy(0.8);
    else if (k === '?') toggleHelp();
    else if (k === 'ArrowRight' || k === 'ArrowLeft') {
      e.preventDefault();
      navIdx = Math.max(0, Math.min(steps.length - 1, navIdx + (k === 'ArrowRight' ? 1 : -1)));
      canvas.animateTo(steps[navIdx].rect, { duration: 900, pad: 0.04, insets: insets() });
      def.onStep?.(steps[navIdx], navIdx, api);
    }
  });

  // ---- Performans ölçümü (?fps=1 veya window.__sb.perf())
  // mode 'stress': tüm dünyada sürekli zoom+pan (en kötü durum). mode 'real': genel bakışta pan → bir sahneye yakınlaş → yakında pan.
  async function perf(ms = 4000, mode = 'stress') {
    const times = []; let last = performance.now(), run = true;
    const loop = t => { times.push(t - last); last = t; if (run) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const b = worldBounds, t0 = performance.now();
    await new Promise(res => {
      const step = () => {
        const t = (performance.now() - t0) / ms;
        if (t >= 1) return res();
        const v = canvas.viewSize();
        let z, cx, cy;
        if (mode === 'real') {
          const s0 = steps[Math.min(3, steps.length - 1)].rect, zFit = Math.min(v.w / b.w, v.h / b.h), zNear = Math.min(v.w / s0.w, v.h / s0.h);
          const sx = s0.x + s0.w / 2, sy = s0.y + s0.h / 2;
          if (t < 1 / 3) { z = zFit * 1.6; cx = b.x + b.w * (0.3 + 0.4 * t * 3); cy = b.y + b.h / 2; }
          else if (t < 2 / 3) { const u = (t - 1 / 3) * 3; z = Math.exp(Math.log(zFit * 1.6) + (Math.log(zNear) - Math.log(zFit * 1.6)) * u); cx = b.x + b.w * 0.7 + (sx - b.x - b.w * 0.7) * u; cy = b.y + b.h / 2 + (sy - b.y - b.h / 2) * u; }
          else { const u = (t - 2 / 3) * 3; z = zNear; cx = sx + s0.w * 0.4 * Math.sin(u * Math.PI * 2); cy = sy; }
        } else {
          z = 0.08 + 0.5 * (0.5 + 0.5 * Math.sin(t * Math.PI * 4));
          cx = b.x + b.w * (0.5 + 0.45 * Math.sin(t * Math.PI * 2)); cy = b.y + b.h * (0.5 + 0.4 * Math.cos(t * Math.PI * 2));
        }
        canvas.set(v.w / 2 - cx * z, v.h / 2 - cy * z, z);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    run = false;
    const s = times.slice(2).sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    return { mode, cards: cardEls.size, frames: s.length, avgFps: Math.round(1000 / avg), p95ms: Math.round(s[Math.floor(s.length * 0.95)] * 10) / 10, maxms: Math.round(s[s.length - 1]) };
  }

  const api = { def, config, data, ctx, canvas, positions, cardEls, steps, frames: L.frames || [], worldBounds, notes, openDetail, closeDetail, focusCard, openMedia, startPresent, stopPresent, goStep, toast, perf, insets, select, cardLayer, edgeSvg };
  window.__sb = api;
  def.onReady?.(api);

  // ---- İlk görünüm + URL parametreleri
  canvas.jumpTo(def.initialRect ? def.initialRect(api) : worldBounds, { pad: 0.03, insets: insets() });
  if (qs.get('notes') === '0') { document.querySelector('[data-cmd="notes"]').checked = false; notes.setVisible(false); }
  if (qs.get('drafts') === '1') { document.querySelector('[data-cmd="drafts"]').checked = true; document.body.classList.add('sb-showDrafts'); }
  if (qs.get('scene')) { const s = steps.find(s => s.scene_id === qs.get('scene') || s.id === qs.get('scene')); if (s) canvas.jumpTo(s.rect, { pad: 0.04, insets: insets() }); }
  if (qs.get('focus')) { const id = qs.get('focus'); const r = positions.get(id); if (r) { openDetail(cardById.get(id), { keepCam: true }); canvas.jumpTo(expand(r, Math.max(r.w, r.h) * 0.9), { insets: insets() }); } }
  if (qs.get('cell')) { const mc = data.cards.find(c => c.kind === 'matrix'); const [r, cIdx] = qs.get('cell').split(',').map(Number); if (mc) { const key = `${mc.matrix.rows[r].id}|${mc.matrix.cols[cIdx].id}`; openCell(mc, key); canvas.jumpTo(expand(positions.get(mc.id), 200), { insets: insets() }); } }
  if (qs.get('media')) { const mc = data.cards.filter(c => c.kind === 'media')[Number(qs.get('media')) || 0]; if (mc) openMedia(mc.media_ids[0], mc); }
  if (qs.get('present')) startPresent(Number(qs.get('present')) - 1 || 0, false);
  if (qs.get('fps') === '1') perf().then(r => toast(`FPS ${r.avgFps} · p95 ${r.p95ms} ms · ${r.cards} kart`));
  return api;
}
