// KULLANICININ EKLEDİĞİ BAĞLANTILAR — ekrandan çıkmadan medya/sayfa ekleme.
// Araştırma verisine yazılmaz: notes/usermedia.json (sunucu yoksa tarayıcı belleği).
// Bağlantı türü tanınır ve içerik ekran içinde gösterilir: Instagram/YouTube/TikTok resmi embed, doğrudan görsel/video,
// diğer sayfalar için önizleme kartı (başlık, açıklama, görsel) + mümkünse sayfa çerçevesi.

export function classifyUrl(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const path = u.pathname;
  let m;
  if (/(^|\.)instagram\.com$/.test(h) && (m = /^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(path))) {
    return { provider: 'instagram', label: 'Instagram', url: u.href, embeds: [{ strategy: 'official', url: `https://www.instagram.com/p/${m[2]}/embed/` }] };
  }
  if (h === 'youtu.be' || /(^|\.)youtube\.com$/.test(h)) {
    const id = h === 'youtu.be' ? path.slice(1) : (u.searchParams.get('v') || (/^\/(?:shorts|embed|live)\/([^/?]+)/.exec(path) || [])[1]);
    if (id) return { provider: 'youtube', label: 'YouTube', url: u.href, embeds: [{ strategy: 'official', url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0` }] };
  }
  if (/(^|\.)tiktok\.com$/.test(h) && (m = /\/video\/(\d+)/.exec(path))) {
    return { provider: 'tiktok', label: 'TikTok', url: u.href, embeds: [{ strategy: 'official', url: `https://www.tiktok.com/embed/v2/${m[1]}` }] };
  }
  if (/(^|\.)facebook\.com$/.test(h) && /\/ads\/library/.test(path) && u.searchParams.get('id')) {
    return { provider: 'meta_ad_library', label: 'Meta reklamı', url: u.href, ad_id: u.searchParams.get('id'), embeds: [{ strategy: 'ad_card' }] };
  }
  if (/\.(jpe?g|png|webp|gif|avif)$/i.test(path)) return { provider: 'image', label: 'Görsel', url: u.href, embeds: [{ strategy: 'direct', type: 'image', url: u.href }] };
  if (/\.(mp4|webm|mov|m4v)$/i.test(path)) return { provider: 'video', label: 'Video', url: u.href, embeds: [{ strategy: 'direct', type: 'video', url: u.href }] };
  return { provider: 'web', label: 'Sayfa', url: u.href, embeds: [{ strategy: 'preview' }], needsPreview: true };
}

export function createUserMedia({ concept, onChange, onStatus }) {
  let items = [], backend = 'server';
  const LS = `sb-usermedia-${concept}`;
  async function load() {
    try { const r = await fetch(`/api/usermedia?concept=${encodeURIComponent(concept)}`); if (!r.ok) throw 0; items = await r.json(); }
    catch { backend = 'local'; try { items = JSON.parse(localStorage.getItem(LS) || '[]'); } catch { items = []; } }
  }
  async function save() {
    if (backend === 'server') {
      try { const r = await fetch(`/api/usermedia?concept=${encodeURIComponent(concept)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items) }); if (!r.ok) throw 0; }
      catch { onStatus?.('Bağlantı kaydedilemedi!', true); }
    } else { try { localStorage.setItem(LS, JSON.stringify(items)); } catch {} }
  }
  async function add(rawUrl, targetCardId, findAd) {
    const c = classifyUrl(rawUrl);
    if (!c) throw new Error('Geçerli bir http(s) bağlantısı değil');
    const now = new Date().toISOString();
    const it = { id: `UM-${Date.now().toString(36)}`, target_card_id: targetCardId, provider: c.provider, label: c.label, source_url: c.url, embeds: c.embeds, added_at: now, origin: 'KULLANICI EKLEDİ' };
    if (c.provider === 'meta_ad_library') {
      const known = findAd?.(c.ad_id);
      if (known) { it.embeds = known.embeds; it.ad = known.ad; } else it.ad = { id: c.ad_id };
    }
    if (c.needsPreview) {
      try {
        const p = await (await fetch(`/api/preview?url=${encodeURIComponent(c.url)}`)).json();
        if (p.kind === 'image') it.embeds = [{ strategy: 'direct', type: 'image', url: p.url }];
        else if (p.kind === 'video') it.embeds = [{ strategy: 'direct', type: 'video', url: p.url }];
        else if (p.kind === 'page') {
          it.preview = { title: p.title, description: p.description, image: p.image, site: p.site, final_url: p.url };
          it.embeds = [...(p.video ? [{ strategy: 'direct', type: 'video', url: p.video }] : []), ...(p.embeddable ? [{ strategy: 'iframe', url: p.url }] : []), { strategy: 'preview' }];
        } else it.preview = { error: p.error };
      } catch { it.preview = { error: 'önizleme alınamadı' }; }
    }
    it.title = it.preview?.title || (it.ad?.page ? `${it.ad.page} · Meta reklamı` : c.label);
    items.push(it); await save(); onChange?.();
    return it;
  }
  async function remove(id) { items = items.filter(i => i.id !== id); await save(); onChange?.(); }
  return { load, add, remove, all: () => items, forCard: id => items.filter(i => i.target_card_id === id), get: id => items.find(i => i.id === id) };
}
