// Kart içi ortak parçalar (konseptler kendi düzenlerinde kullanır).
import { esc, dtBadge, flagBadge, valueHtml, idTag, confBadge } from './evidence.js';

export const PROVIDER = {
  youtube: { icon: '▶', label: 'Video', play: true },
  video: { icon: '▶', label: 'Video', play: true },
  instagram: { icon: '◎', label: 'Instagram', play: false },
  meta_ad_library: { icon: 'Ⓜ', label: 'Meta reklamı', play: false },
  image: { icon: '▣', label: 'Görsel', play: true },
  web: { icon: '↗', label: 'Sayfa', play: false },
};
export const prov = p => PROVIDER[p] || PROVIDER.web;

export function mediaAction(card, ctx) {
  const m = ctx.media(card.media_ids[0]);
  const e = (m?.embeds || [])[0] || {};
  if (m?.ad) return e.type === 'video' ? '▶ Reklamı oynat' : '▶ Reklamı göster';
  if (e.type === 'image') return '⤢ Büyüt';
  if (e.strategy === 'official' || e.type === 'video') return '▶ Oynat';
  return '▶ Göster';
}

export function fieldRows(card, n = 4, skip = []) {
  return card.fields.filter(f => !skip.includes(f.key)).slice(0, n).map(f =>
    `<div class="f"><span>${esc(f.label)}</span><b>${valueHtml(f)}</b></div>`).join('');
}

export function flagsRow(card) { return card.flags.length ? `<div class="flags">${card.flags.map(flagBadge).join('')}</div>` : ''; }

export function head(card) {
  return `<div class="cHead">${dtBadge(card.evidence?.data_type, 'is-mini')}${idTag(card)}</div>`;
}

export function infConf(card, ctx) {
  const inf = ctx.inf(card.inference_ids[0]);
  return inf ? confBadge(inf.confidence) : '';
}

export function matrixHtml(card, ctx, o = {}) {
  const M = card.matrix;
  const max = Math.max(1, ...M.values.flat());
  return `<table class="mx">
    <thead><tr><th></th>${M.cols.map(c => `<th style="--c:${c.color}">${esc(c.label)}</th>`).join('')}<th>Σ</th></tr></thead>
    <tbody>${M.rows.map((r, i) => `<tr><th>${esc(r.label)}</th>${M.values[i].map((v, j) => {
      const a = v ? 0.12 + 0.88 * (v / max) : 0;
      return `<td data-cell="${esc(r.id)}|${esc(M.cols[j].id)}" style="--c:${M.cols[j].color};--a:${a.toFixed(2)}" title="${esc(r.label)} × ${esc(M.cols[j].label)}: ${v} reklam">${v || (o.zero ?? '·')}</td>`;
    }).join('')}<td class="sum">${M.values[i].reduce((x, y) => x + y, 0)}</td></tr>`).join('')}</tbody></table>`;
}

export function bars(card, colorVar = 'var(--cat, var(--accent))') {
  if (!card.bars) return '';
  return `<div class="bars">${card.bars.map(b => `<i style="width:${Math.max(3, Math.min(100, b))}%;background:${colorVar}"></i>`).join('')}</div>`;
}
