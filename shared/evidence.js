// Kanıt standardının görsel dili — tüm konseptlerde ortak.
// Gözlem / tahmin / yorum / öneri yalnızca renkle değil; ikon, etiket ve çizgi stiliyle de ayrılır.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const DT = {
  'DOĞRUDAN_GÖZLEM': { cls: 'obs', icon: '●', label: 'GÖZLEM' },
  'BİRİNCİL_KAYNAK': { cls: 'obs', icon: '●', label: 'BİRİNCİL' },
  'İKİNCİL_KAYNAK': { cls: 'obs', icon: '○', label: 'İKİNCİL' },
  'TAHMİN': { cls: 'est', icon: '≈', label: 'TAHMİN' },
  'VARSAYIM': { cls: 'est', icon: '?', label: 'VARSAYIM' },
  'ANALİST_YORUMU': { cls: 'inf', icon: '◆', label: 'YORUM' },
  'TİCARİ_ÖNERİ': { cls: 'rec', icon: '➜', label: 'ÖNERİ' },
};
export const dtInfo = dt => DT[dt] || { cls: 'obs', icon: '●', label: dt || '—' };

export const FLAGS = {
  'BULUNAMADI': { cls: 'flag-missing', label: 'BULUNAMADI' },
  'TEKLİF_ALINMALI': { cls: 'flag-quote', label: 'TEKLİF ALINMALI' },
  'DOĞRULANAMADI': { cls: 'flag-unverified', label: 'DOĞRULANAMADI' },
};
export const isFlagValue = v => typeof v === 'string' && v in FLAGS;

export const STATUS_OK = new Set(['ACCEPTED', 'APPROVED']);
// Türetilmiş analizler (Opus, data/exports) kayıt değildir; durumları REVIEWED kalır ama gösterilir (kullanıcı kararı 2026-11-10).
export const isDraft = card => !STATUS_OK.has(card.evidence?.status) && !card.evidence?.derived;

export function dtBadge(dt, extra = '') {
  const i = dtInfo(dt);
  return `<span class="sb-dt sb-dt-${i.cls} ${extra}" title="${esc(dt)}"><i aria-hidden="true">${i.icon}</i>${i.label}</span>`;
}
export function flagBadge(f) {
  const i = FLAGS[f] || { cls: 'flag-missing', label: f };
  return `<span class="sb-flag ${i.cls}">${esc(i.label)}</span>`;
}
export function confBadge(c) {
  const n = { 'yüksek': 3, 'orta': 2, 'düşük': 1 }[c] || 0;
  return `<span class="sb-conf sb-conf-${n}" title="Güven: ${esc(c)}"><b>${'▮'.repeat(n)}${'▯'.repeat(3 - n)}</b> ${esc(c || '—')}</span>`;
}
export function statusBadge(s) {
  return `<span class="sb-status sb-status-${esc(s)}">${esc(s)}</span>`;
}
export function valueHtml(f) {
  if (isFlagValue(f.value)) return flagBadge(f.value);
  return `${esc(f.value)}${f.unit ? ` <small>${esc(f.unit)}</small>` : ''}`;
}
export function idTag(card) {
  return `<span class="sb-id" title="Kayıt ID">${esc(card.record_ref?.id || card.id)}</span>`;
}

// Detay panelindeki tam kanıt bloğu
export function evidenceBlock(ev, ui) {
  if (!ev) return '';
  const row = (k, v) => `<div class="sb-evRow"><dt>${k}</dt><dd>${v}</dd></div>`;
  return `<section class="sb-evidence"><h4>${esc(ui.evidence || 'Kanıt')}</h4><dl>
    ${ev.source_url ? row('Kaynak', `<a href="${esc(ev.source_url)}" target="_blank" rel="noopener noreferrer">${esc(ev.source_url)}</a>`) : ev.derived ? '' : row('Kaynak', flagBadge('BULUNAMADI'))}
    ${(ev.source_ids || []).length ? row('Kaynak ID', esc(ev.source_ids.join(', '))) : ''}
    ${ev.source_type && ev.source_type !== 'diger' ? row('Kaynak türü', esc(ev.source_type)) : ''}
    ${ev.accessed_at ? row('Erişim', esc(ev.accessed_at) + (ev.last_verified_at && ev.last_verified_at !== ev.accessed_at ? ` · doğrulama ${esc(ev.last_verified_at)}` : '')) : ''}
    ${row('Veri türü', dtBadge(ev.data_type))}
    ${row('Kanıt düzeyi', isFlagValue(ev.evidence_level) ? flagBadge(ev.evidence_level) : `<span class="sb-level">${esc(ev.evidence_level)}</span>`)}
    ${row('Güven', confBadge(ev.confidence))}
    ${row('Durum', statusBadge(ev.status) + (ev.derived ? ' <span class="sb-derived">türetilmiş analiz — kayıt değil</span>' : ''))}
    ${ev.derived ? row('Analiz dosyası', esc(ev.derived)) : ''}
    ${ev.evidence_note ? row('Kanıt notu', esc(ev.evidence_note)) : ''}
    ${ev.opus_note ? row('Opus notu', esc(ev.opus_note)) : ''}
  </dl></section>`;
}

export const fmtNum = n => (typeof n === 'number' ? n.toLocaleString('tr-TR') : n);
