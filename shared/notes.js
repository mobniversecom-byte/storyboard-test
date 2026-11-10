// KULLANICI NOTLARI — araştırma verisinden tamamen ayrı.
// Kalıcılık: yerel sunucu → storyboard-concepts/notes/notes.json (sunucu yoksa tarayıcı belleği + uyarı).
// Serbest not (tuval üzerinde) veya karta bağlı yorum. Düzenle / sil / geri al / göster-gizle / sunumda göster.
import { esc } from './evidence.js';

export function createNotes({ canvas, concept, getCardRect, ui, onStatus, onChange }) {
  const layer = document.createElement('div');
  layer.className = 'sb-notesLayer';
  canvas.world.appendChild(layer);
  let notes = [];
  const undo = [];
  let saveTimer = null, backend = 'server';
  const LS = `sb-notes-${concept}`;

  async function load() {
    try {
      const r = await fetch(`/api/notes?concept=${encodeURIComponent(concept)}`);
      if (!r.ok) throw new Error(r.status);
      notes = await r.json();
    } catch {
      backend = 'local';
      try { notes = JSON.parse(localStorage.getItem(LS) || '[]'); } catch { notes = []; }
      onStatus?.('Notlar yalnızca bu tarayıcıda (sunucu yok)', true);
    }
    render();
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (backend === 'server') {
        try {
          const r = await fetch(`/api/notes?concept=${encodeURIComponent(concept)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notes) });
          if (!r.ok) throw new Error(r.status);
          onStatus?.('Notlar kaydedildi');
        } catch { onStatus?.('Not kaydedilemedi!', true); }
      } else {
        try { localStorage.setItem(LS, JSON.stringify(notes)); } catch {}
      }
    }, 250);
  }
  function snapshot() { undo.push(JSON.stringify(notes)); if (undo.length > 60) undo.shift(); }
  function commit() { persist(); render(); onChange?.(); }

  function pos(n) {
    if (n.target_card_id) {
      const r = getCardRect(n.target_card_id);
      if (r) return { x: r.x + r.w + (n.dx ?? 18), y: r.y + (n.dy ?? 0), attached: true };
    }
    return { x: n.x ?? 0, y: n.y ?? 0, attached: false };
  }

  function add({ x, y, target_card_id = null }) {
    snapshot();
    const now = new Date().toISOString();
    const n = { id: `NOTE-${Date.now().toString(36)}`, target_card_id, x, y, dx: 18, dy: 0, text: '', created_at: now, updated_at: now, show_in_presentation: true, history: [] };
    notes.push(n);
    commit();
    edit(n.id);
    return n;
  }
  function update(id, patch, record = true) {
    const n = notes.find(n => n.id === id); if (!n) return;
    if (record) snapshot();
    if ('text' in patch && patch.text !== n.text && n.text) n.history.push({ at: new Date().toISOString(), text: n.text });
    Object.assign(n, patch, { updated_at: new Date().toISOString() });
    commit();
  }
  function remove(id) { snapshot(); notes = notes.filter(n => n.id !== id); commit(); }
  function undoLast() {
    if (!undo.length) return false;
    notes = JSON.parse(undo.pop()); commit(); return true;
  }

  function edit(id) {
    const el = layer.querySelector(`[data-note="${CSS.escape(id)}"]`); if (!el) return;
    const n = notes.find(n => n.id === id);
    const body = el.querySelector('.sb-noteBody');
    body.innerHTML = `<textarea class="sb-noteEdit" rows="4" placeholder="Notunuzu yazın… (Ctrl+Enter kaydet, Esc vazgeç)">${esc(n.text)}</textarea>`;
    const ta = body.querySelector('textarea');
    ta.focus();
    const finish = save => {
      ta.removeEventListener('blur', onBlur);
      if (save) {
        const t = ta.value.trim();
        if (!t && !n.text) { notes = notes.filter(x => x.id !== id); commit(); return; }
        if (t !== n.text) update(id, { text: t }, !!n.text); else render();
      } else {
        if (!n.text) { notes = notes.filter(x => x.id !== id); commit(); } else render();
      }
    };
    const onBlur = () => finish(true);
    ta.addEventListener('blur', onBlur);
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ta.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  }

  function render() {
    layer.innerHTML = notes.map(n => {
      const p = pos(n);
      return `<div class="sb-note sb-noDrag ${p.attached ? 'is-attached' : ''} ${n.show_in_presentation ? '' : 'no-present'}" data-note="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px">
        <div class="sb-noteHead" data-act="drag" title="Sürükle">
          <span class="sb-noteTag">✎ ${esc(ui.user_note || 'KULLANICI NOTU')}</span>
          ${p.attached ? `<span class="sb-notePin" title="Bağlı kart">↳ ${esc(n.target_card_id)}</span>` : ''}
        </div>
        <div class="sb-noteBody">${esc(n.text).replace(/\n/g, '<br>') || '<em>(boş)</em>'}</div>
        <div class="sb-noteTools">
          <button data-act="edit" title="Düzenle">Düzenle</button>
          <button data-act="present" title="Sunumda göster/gizle">${n.show_in_presentation ? 'Sunumda: açık' : 'Sunumda: kapalı'}</button>
          <button data-act="del" title="Sil (geri alınabilir)">Sil</button>
        </div>
      </div>`;
    }).join('');
  }

  // Not araç çubuğu ve sürükleme
  layer.addEventListener('click', e => {
    const el = e.target.closest('.sb-note'); if (!el) return;
    e.stopPropagation();
    const id = el.dataset.note, act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'edit') edit(id);
    else if (act === 'del') remove(id);
    else if (act === 'present') { const n = notes.find(n => n.id === id); update(id, { show_in_presentation: !n.show_in_presentation }); }
  });
  layer.addEventListener('dblclick', e => { const el = e.target.closest('.sb-note'); if (el) { e.stopPropagation(); edit(el.dataset.note); } });
  layer.addEventListener('pointerdown', e => {
    const head = e.target.closest('[data-act="drag"]'); if (!head) return;
    e.stopPropagation();
    const el = head.closest('.sb-note'), id = el.dataset.note;
    const n = notes.find(n => n.id === id);
    const sx = e.clientX, sy = e.clientY, ox = parseFloat(el.style.left), oy = parseFloat(el.style.top);
    let moved = false;
    const mv = ev => {
      const dx = (ev.clientX - sx) / canvas.cam.z, dy = (ev.clientY - sy) / canvas.cam.z;
      if (!moved && Math.hypot(dx, dy) * canvas.cam.z > 3) { moved = true; snapshot(); }
      if (moved) { el.style.left = ox + dx + 'px'; el.style.top = oy + dy + 'px'; }
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (!moved) return;
      const nx = parseFloat(el.style.left), ny = parseFloat(el.style.top);
      const r = n.target_card_id && getCardRect(n.target_card_id);
      if (r) Object.assign(n, { dx: nx - (r.x + r.w), dy: ny - r.y }); else Object.assign(n, { x: nx, y: ny });
      n.updated_at = new Date().toISOString();
      commit();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });

  return {
    layer, load, add, update, remove, undo: undoLast, render, edit,
    list: cardId => notes.filter(n => n.target_card_id === cardId),
    all: () => notes,
    setVisible: v => document.body.classList.toggle('sb-notesHidden', !v),
  };
}
