// DEMO veri üreticisi — ortak veri modeline (shared/model.schema.json) uygun örnek storyboard üretir.
// Sektöre özgü HİÇBİR kelime burada yoktur: kategori, alan, maliyet kalemi, isim havuzu config'den gelir.
// Tüm kayıtlar "DEMO-" önekli ID taşır; gerçek araştırma verisi değildir.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MATCH_LEVELS = ['AYNI_MODEL_DOĞRULANDI', 'GÜÇLÜ_BENZERLİK', 'GÖRSEL_BENZERLİK', 'DOĞRULANAMADI'];
const DECISION_TAGS = ['ARAŞTIRMAYA_DEĞER', 'TEKLİF_ALINMALI', 'PİLOT_TESTE_UYGUN', 'MALİYETİ_DOĞRULANMALI'];

// Herkese açık, lisansı uygun DEMO medya kaynakları (indirilmez, kaynağından gösterilir).
const DEMO_MEDIA = [
  { provider: 'youtube', title: 'Tanıtım videosu', source_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    embeds: [{ strategy: 'official', url: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&rel=0' }] },
  { provider: 'video', title: 'Ürün videosu (doğrudan URL)', source_url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    embeds: [{ strategy: 'direct', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', type: 'video' }] },
  { provider: 'instagram', title: 'Instagram reel', source_url: 'https://www.instagram.com/',
    embeds: [{ strategy: 'open_only' }],
    demo_note: 'DEMO: gerçek gönderi yok. Gerçek veride resmi embed (instagram.com/p/<kod>/embed) denenir.' },
  { provider: 'meta_ad_library', title: 'Meta reklamı', source_url: 'https://www.facebook.com/ads/library/',
    embeds: [{ strategy: 'open_only' }],
    demo_note: 'Meta Reklam Kütüphanesi resmi embed sunmaz; "Kaynağı aç" beklenen davranıştır.' },
  { provider: 'image', title: 'Ürün görseli', source_url: 'https://picsum.photos/',
    embeds: [{ strategy: 'direct', url: 'https://picsum.photos/seed/{seed}/1200/800', type: 'image' }] },
];

export function buildDemo(config, opts = {}) {
  const rng = mulberry32(config.demo.seed || 1);
  const rint = (a, b) => Math.floor(a + rng() * (b - a + 1));
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const cur = config.currency || '';
  const fmt = n => Math.round(n).toLocaleString('tr-TR');
  const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mn' : n >= 1e3 ? Math.round(n / 1e3) + ' B' : String(n);
  const counters = {};
  const rid = prefix => {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `DEMO-${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
  };
  const E = config.entities;
  const pfx = ent => (E[ent] && E[ent].prefix) || ent.toUpperCase().slice(0, 3);
  const seg = id => config.segments.find(s => s.id === id) || { id, label: id };
  const date = (dOff = 0) => {
    const d = new Date(Date.UTC(2026, 10, 9) - dOff * 864e5);
    return d.toISOString().slice(0, 10);
  };
  const pickStatus = () => { const r = rng(); return r < 0.08 ? 'REVIEWED' : r < 0.15 ? 'APPROVED' : 'ACCEPTED'; };

  function ev(id, data_type, o = {}) {
    return {
      source_url: o.source_url || `https://example.com/demo/${id}`,
      source_ids: [`DEMO-SRC-${String(rint(1, 400)).padStart(4, '0')}`],
      source_type: o.source_type || 'rakip_sitesi',
      accessed_at: o.accessed_at || date(rint(0, 3)),
      last_verified_at: date(0),
      data_type,
      evidence_level: o.evidence_level || (data_type === 'DOĞRUDAN_GÖZLEM' ? 'DOĞRUDAN_DOĞRULANDI' : data_type === 'TAHMİN' ? 'DOLAYLI' : 'ÇOKLU_KAYNAK'),
      confidence: o.confidence || pick(['yüksek', 'orta', 'orta', 'düşük']),
      status: o.status || pickStatus(),
      evidence_note: o.note || 'DEMO kayıt — örnek kanıt notu.',
      opus_note: o.opus_note || null,
    };
  }

  const cards = [], media = [], inferences = [], links = [], scenes = [];
  const byId = new Map();
  function card(c) {
    c.fields = c.fields || []; c.flags = c.flags || []; c.media_ids = c.media_ids || [];
    c.inference_ids = c.inference_ids || []; c.related_card_ids = c.related_card_ids || [];
    cards.push(c); byId.set(c.id, c); return c;
  }
  function inference(text, confidence, based_on_ids, target_ids) {
    const inf = { id: rid(pfx('inference')), data_type: 'ANALİST_YORUMU', text, confidence, based_on_ids, target_ids };
    inferences.push(inf); return inf;
  }
  const link = (from, to, type) => links.push({ from, to, type });

  // ---- Satıcılar
  const nCompanies = opts.companies || config.demo.companies || 12;
  const companies = Array.from({ length: nCompanies }, (_, i) => ({
    rec: rid(pfx('company')),
    name: config.demo.company_pattern.replace('{n}', String(i + 1).padStart(2, '0')),
    ads: {}, products: [],
  }));

  // ---- Ürünler (kategori ağırlıklarına göre)
  const nProducts = opts.products || config.demo.products || 12;
  const weights = config.categories.map(c => c.demo_weight || 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const catSeq = [];
  config.categories.forEach((c, i) => {
    const k = Math.max(1, Math.round(nProducts * weights[i] / wsum));
    for (let j = 0; j < k; j++) catSeq.push(c);
  });
  while (catSeq.length > nProducts) catSeq.pop();
  while (catSeq.length < nProducts) catSeq.push(config.categories[0]);

  const pool = config.demo.name_pool;
  const products = catSeq.map((cat, i) => {
    const base = rint(cat.price[0], cat.price[1]);
    const nSell = Math.min(nCompanies, 1 + Math.floor(rng() * rng() * 4.5));
    const sellerIdx = [];
    while (sellerIdx.length < nSell) { const k = rint(0, nCompanies - 1); if (!sellerIdx.includes(k)) sellerIdx.push(k); }
    const p = {
      i, cat, base,
      name: `${pool[i % pool.length]}${i >= pool.length ? ' ' + (Math.floor(i / pool.length) + 1) : ''}`,
      entity: cat.entity || 'product',
      rec: null,
      segment: base < cat.price[0] + (cat.price[1] - cat.price[0]) * 0.33 ? 'budget' : base > cat.price[0] + (cat.price[1] - cat.price[0]) * 0.75 ? 'premium' : 'mid',
      sellers: sellerIdx.map(k => companies[k]),
      sig: { ad_count: rint(1, 30), ad_days: rint(5, 340), views: rint(4e3, 3.6e6), engagement: Math.round((0.3 + rng() * 9) * 10) / 10 },
      code: rng() < 0.3 ? 'BULUNAMADI' : `${pfx(cat.entity || 'product').slice(0, 2)}${rint(100000, 999999)}`,
      supplier: rng() < 0.8 ? 'BULUNAMADI' : 'TEKLİF_ALINMALI',
    };
    p.rec = rid(pfx(p.entity));
    p.sellers.forEach(s => s.products.push(p));
    return p;
  });

  // Sinyal puanı (DEMO): sıralama için
  products.forEach(p => { p.score = 2 * Math.min(p.sig.ad_count, 3) + p.sig.ad_days / 90 + Math.log2(1 + p.sig.ad_count) + Math.min(p.sig.engagement, 10) / 2; });

  // ---- Reklam haritası verisi (satıcı × kategori)
  companies.forEach(c => config.categories.forEach(cat => {
    const has = c.products.filter(p => p.cat === cat).length;
    c.ads[cat.id] = has ? rint(2, 18) : (rng() < 0.45 ? rint(0, 6) : 0);
  }));

  const sceneDef = config.scenes;
  const sceneOf = kind => sceneDef.find(s => s.kind === kind);
  const mkScene = (def, extra = {}) => { const s = { id: def.id, order: scenes.length, kind: def.kind, title: def.title, subtitle: def.subtitle || '', card_ids: [], ...extra }; scenes.push(s); return s; };
  const put = (scene, c) => { c.scene_id = scene.id; scene.card_ids.push(c.id); return card(c); };

  for (const def of sceneDef) {
    if (def.kind === 'overview') {
      const s = mkScene(def);
      const totalAds = companies.reduce((a, c) => a + Object.values(c.ads).reduce((x, y) => x + y, 0), 0);
      const metrics = [
        ['Önerilen ürün', products.length],
        ['İncelenen satıcı', companies.length],
        ['İncelenen reklam', totalAds],
        ['Kategori', config.categories.length],
      ];
      const runId = 'DEMO-RESEARCH-2026-11-001';
      metrics.forEach(([label, v]) => put(s, {
        id: `${s.id}-m-${label}`, kind: 'metric', record_ref: { entity: 'research_run', id: runId, version: 1 },
        title: label, big: { value: fmt(v), label },
        fields: [{ key: 'value', label, value: fmt(v), data_type: 'DOĞRUDAN_GÖZLEM' }],
        evidence: ev(runId, 'DOĞRUDAN_GÖZLEM', { status: 'ACCEPTED', confidence: 'yüksek', note: 'DEMO: veritabanı sayımı.' }),
      }));
      put(s, {
        id: `${s.id}-method`, kind: 'text', record_ref: { entity: 'research_run', id: runId, version: 1 },
        title: 'Yöntem', subtitle: `${config.sector_name} · tedarik bölgesi: ${config.supply_region}`,
        body: [
          `${companies.length} satıcının sitesi, reklam kütüphanesi kayıtları ve sosyal medya etkileşimi incelendi (DEMO).`,
          'Ürün seçiminde ana ölçüt: reklam devamlılığı ve etkileşim endeksi.',
          'Her kart bir kayıt ID\'sine bağlıdır; kanıt ayrıntısı karta tıklayınca açılır.',
        ],
        evidence: ev(runId, 'DOĞRUDAN_GÖZLEM', { status: 'ACCEPTED', confidence: 'yüksek' }),
      });
      put(s, {
        id: `${s.id}-limits`, kind: 'text', record_ref: { entity: 'research_run', id: runId, version: 1 },
        title: 'Okurken unutma', subtitle: 'Sinyallerin sınırları',
        body: config.demo.overview_notes,
        evidence: ev(runId, 'ANALİST_YORUMU', { status: 'ACCEPTED', confidence: 'yüksek', note: 'Kanıt standardı sınırları.' }),
      });
    }

    if (def.kind === 'categories') {
      const s = mkScene(def);
      for (const cat of config.categories) {
        const ps = products.filter(p => p.cat === cat);
        const ads = companies.reduce((a, c) => a + c.ads[cat.id], 0);
        const maxDays = Math.max(0, ...ps.map(p => p.sig.ad_days));
        const eng = ps.length ? ps.reduce((a, p) => a + p.sig.engagement, 0) / ps.length : 0;
        const rec = rid(pfx('opportunity'));
        const c = put(s, {
          id: `${s.id}-${cat.id}`, kind: 'metric', category: cat.id, record_ref: { entity: 'opportunity', id: rec, version: 1 },
          title: cat.label, subtitle: `${ps.length} önerilen ürün`,
          big: { value: fmt(ads), label: 'reklam' },
          fields: [
            { key: 'ads', label: 'Reklam sayısı', value: fmt(ads), data_type: 'DOĞRUDAN_GÖZLEM' },
            { key: 'maxdays', label: 'En uzun reklam', value: fmt(maxDays), unit: 'gün', data_type: 'DOĞRUDAN_GÖZLEM' },
            { key: 'eng', label: 'Ort. etkileşim endeksi', value: eng.toFixed(1).replace('.', ','), data_type: 'DOĞRUDAN_GÖZLEM' },
            { key: 'n', label: 'Önerilen ürün', value: ps.length, data_type: 'TİCARİ_ÖNERİ' },
          ],
          bars: [ads, maxDays / 10, eng * 10],
          evidence: ev(rec, 'DOĞRUDAN_GÖZLEM', { source_type: 'meta_reklam_kutuphanesi', status: 'ACCEPTED' }),
        });
        const inf = inference(
          ads > 60 ? `${cat.label}: reklam yoğunluğu yüksek; satıcılar bu kategoride ısrarla reklam veriyor. Devamlılık sinyalidir, satış kanıtı değildir.`
            : `${cat.label}: sinyal sınırlı; karar için ek veri gerekebilir.`,
          ads > 60 ? 'orta' : 'düşük', [c.id], [c.id]);
        c.inference_ids.push(inf.id);
      }
    }

    if (def.kind === 'products') {
      const intro = mkScene(def, { is_chapter: true });
      put(intro, {
        id: `${intro.id}-list`, kind: 'text', record_ref: { entity: 'research_run', id: 'DEMO-RESEARCH-2026-11-001', version: 1 },
        title: `${products.length} ürün seçildi`,
        body: config.categories.map(c => `${c.label}: ${products.filter(p => p.cat === c).length}`),
        evidence: ev('list', 'TİCARİ_ÖNERİ', { status: 'ACCEPTED', confidence: 'orta', note: 'Seçim ölçütü: sinyal puanı (DEMO).' }),
      });
      const sorted = [...products].sort((a, b) => b.score - a.score);
      sorted.forEach((p, rank) => {
        const s = mkScene({ id: `p-${p.rec}`, kind: 'product', title: `${p.name} ${p.cat.short}`, subtitle: `${p.cat.label} · ${seg(p.segment).label} segment (öneri)` },
          { parent: def.id, category: p.cat.id, rank: rank + 1 });
        p.scene = s;
        const prices = p.sellers.map((c, j) => Math.round(p.base * (j === 0 ? 1 : 0.9 + rng() * 0.25) / 10) * 10);
        const pmin = Math.min(...prices), pmax = Math.max(...prices);
        const status = pickStatus();
        const fieldsP = [
          { key: 'category', label: 'Kategori', value: p.cat.label, data_type: 'DOĞRUDAN_GÖZLEM' },
          { key: 'segment', label: 'Segment (öneri)', value: seg(p.segment).label, data_type: 'TİCARİ_ÖNERİ' },
          { key: 'price', label: 'Gözlenen fiyat', value: pmin === pmax ? fmt(pmin) : `${fmt(pmin)} – ${fmt(pmax)}`, unit: cur, data_type: 'DOĞRUDAN_GÖZLEM' },
          { key: 'product_code', label: 'Ürün kodu', value: p.code, data_type: 'DOĞRUDAN_GÖZLEM' },
          ...config.product_fields.map(f => ({ key: f.key, label: f.label, value: f.demo ? pick(f.demo) : 'BULUNAMADI', data_type: 'DOĞRUDAN_GÖZLEM' })),
          { key: 'supplier', label: 'Üretici / tedarikçi', value: p.supplier, data_type: 'DOĞRUDAN_GÖZLEM' },
        ];
        const pc = put(s, {
          id: p.rec, kind: 'entity', category: p.cat.id, record_ref: { entity: p.entity, id: p.rec, version: 1 },
          title: `${p.name} ${p.cat.short}`, subtitle: `${E[p.entity].label} · ${p.sellers.length} satıcıda`,
          big: { value: pmin === pmax ? fmt(pmin) : `${fmt(pmin)}–${fmt(pmax)}`, label: cur },
          rank: rank + 1, fields: fieldsP,
          flags: [p.code === 'BULUNAMADI' ? 'BULUNAMADI' : null, p.supplier].filter(Boolean),
          evidence: ev(p.rec, 'DOĞRUDAN_GÖZLEM', { status }),
        });
        p.card = pc;
        // Fiyat gözlemleri — her satıcı ayrı kayıt
        p.priceCards = p.sellers.map((c, j) => {
          const prc = rid(pfx('price_observation'));
          const ml = j === 0 ? 'REFERANS' : pick(MATCH_LEVELS);
          const camp = rng() < 0.4 ? Math.round(prices[j] * 0.9 / 10) * 10 : null;
          const pcard = put(s, {
            id: prc, kind: 'entity', category: p.cat.id, record_ref: { entity: 'price_observation', id: prc, version: 1 },
            title: c.name, subtitle: `${fmt(prices[j])} ${cur}`,
            big: { value: fmt(prices[j]), label: cur },
            fields: [
              { key: 'company', label: 'Satıcı', value: c.name, data_type: 'DOĞRUDAN_GÖZLEM', ref: c.rec },
              { key: 'regular_price', label: 'Normal fiyat', value: fmt(prices[j]), unit: cur, data_type: 'DOĞRUDAN_GÖZLEM' },
              { key: 'campaign_price', label: 'Kampanya fiyatı', value: camp ? fmt(camp) : 'BULUNAMADI', unit: camp ? cur : '', data_type: 'DOĞRUDAN_GÖZLEM' },
              { key: 'vat_status', label: 'KDV', value: pick(['dahil', 'dahil', 'belirsiz']), data_type: 'DOĞRUDAN_GÖZLEM' },
              { key: 'match_level', label: 'Eşleşme', value: ml, data_type: ml === 'AYNI_MODEL_DOĞRULANDI' || ml === 'REFERANS' ? 'DOĞRUDAN_GÖZLEM' : 'ANALİST_YORUMU' },
            ],
            flags: ml === 'DOĞRULANAMADI' ? ['DOĞRULANAMADI'] : [],
            match_level: ml, company: c.name,
            evidence: ev(prc, 'DOĞRUDAN_GÖZLEM', { status: pick(['ACCEPTED', 'ACCEPTED', 'APPROVED']) }),
          });
          link(pc.id, pcard.id, 'sold_by');
          return pcard;
        });
        // Sinyal kartı
        const sigRec = rid(pfx('claim'));
        const sc = put(s, {
          id: sigRec, kind: 'metric', category: p.cat.id, record_ref: { entity: 'claim', id: sigRec, version: 1 },
          title: 'Reklam ve ilgi', subtitle: 'Reklam kütüphanesi + sosyal medya',
          big: { value: fmt(p.sig.ad_days), label: 'gün reklamda' },
          fields: config.signals.map(f => ({
            key: f.key, label: f.label, unit: f.unit || '', data_type: 'DOĞRUDAN_GÖZLEM',
            value: f.key === 'views' ? fmtK(p.sig.views) : f.key === 'engagement' ? String(p.sig.engagement).replace('.', ',') : fmt(p.sig[f.key] ?? 0),
          })),
          bars: [p.sig.ad_days / 3.4, Math.min(100, p.sig.engagement * 10), Math.min(100, Math.log10(p.sig.views) * 15)],
          evidence: ev(sigRec, 'DOĞRUDAN_GÖZLEM', { source_type: 'meta_reklam_kutuphanesi', status: 'ACCEPTED' }),
        });
        link(pc.id, sc.id, 'signal');
        // Medya kartları (kapak = kendi metin kartımız)
        const nMedia = rint(2, 3);
        const start = rint(0, DEMO_MEDIA.length - 1);
        for (let k = 0; k < nMedia; k++) {
          const tpl = DEMO_MEDIA[(start + k) % DEMO_MEDIA.length];
          const mid = rid(pfx('media'));
          const m = {
            id: mid, provider: tpl.provider, title: `${tpl.title} — ${p.name}`,
            source_url: tpl.source_url,
            embeds: tpl.embeds.map(e => ({ ...e, url: e.url ? e.url.replace('{seed}', mid) : undefined })),
            cover: { title: tpl.title, date: date(rint(1, 200)), label: p.sellers[k % p.sellers.length].name },
            demo_note: tpl.demo_note || null,
            record_ref: { entity: 'media', id: mid, version: 1 }, accessed_at: date(1),
          };
          media.push(m);
          const why = {
            youtube: `Ürünün kullanımını gösteren tanıtım; ${p.sellers[0].name} kaydına bağlı. İlgi sinyalidir, satış kanıtı değildir.`,
            video: `Kısa ürün videosu; etkileşim endeksi ${String(p.sig.engagement).replace('.', ',')} olan içerik. Etkileşim satış adedi değildir.`,
            instagram: `Hesap ortalamasının üzerinde izlenen reel (DEMO). Etkileşim satış adedi değildir.`,
            meta_ad_library: `${p.sig.ad_days} gündür yayında olan reklam: devamlılık sinyali. Harcama ve satış tahmin edilmez.`,
            image: `Ürünün görünüşü için kaynak görsel. Benzer görünüş aynı model kanıtı değildir.`,
          }[tpl.provider];
          const mc = put(s, {
            id: `${mid}`, kind: 'media', category: p.cat.id, record_ref: m.record_ref,
            title: m.cover.title, subtitle: `${m.cover.label} · ${m.cover.date}`, provider: tpl.provider,
            media_ids: [mid], fields: [{ key: 'provider', label: 'Kaynak türü', value: tpl.provider, data_type: 'DOĞRUDAN_GÖZLEM' }],
            evidence: ev(mid, 'DOĞRUDAN_GÖZLEM', { source_url: tpl.source_url, source_type: tpl.provider === 'meta_ad_library' ? 'meta_reklam_kutuphanesi' : 'resmi_sosyal', status: 'ACCEPTED' }),
          });
          const inf = inference(why, tpl.provider === 'image' ? 'düşük' : 'orta', [sc.id, pc.id], [mc.id]);
          mc.inference_ids.push(inf.id);
          link(pc.id, mc.id, 'media');
        }
        // Neden seçtik — ANALİST_YORUMU kartı
        const whyInf = inference(
          `${p.sig.ad_days} gün süren reklam, ${fmtK(p.sig.views)} izlenme ve ${p.sellers.length} satıcıda görülmesi bu ürünü öne çıkarıyor. Bunlar devamlılık ve ilgi sinyalidir; satış kanıtı değildir.`,
          p.sellers.length >= 3 ? 'yüksek' : p.sellers.length === 2 ? 'orta' : 'düşük',
          [sc.id, ...p.priceCards.map(c => c.id)], [pc.id]);
        const wc = put(s, {
          id: whyInf.id, kind: 'inference', category: p.cat.id, record_ref: { entity: 'inference', id: whyInf.id, version: 1 },
          title: 'Neden seçtik', body: [whyInf.text], inference_ids: [whyInf.id],
          evidence: ev(whyInf.id, 'ANALİST_YORUMU', { confidence: whyInf.confidence, status: 'ACCEPTED', note: 'Dayandığı kayıtlar: ' + whyInf.based_on_ids.join(', ') }),
        });
        pc.inference_ids.push(whyInf.id);
        link(pc.id, wc.id, 'why');
        link(wc.id, sc.id, 'based_on'); p.priceCards.forEach(c => link(wc.id, c.id, 'based_on'));
        // Birim ekonomisi — TAHMİN
        const ecRec = rid(pfx('claim'));
        const maxBuy = Math.round(pmin * (0.5 + rng() * 0.12) / 100) * 100;
        const costRatio = rint(16, 31);
        const ecFields = [
          { key: 'max_buy', label: 'Azami alış (temel senaryo)', value: fmt(maxBuy), unit: cur, data_type: 'TAHMİN' },
          { key: 'cost_ratio', label: 'Gider oranı', value: `%${costRatio}`, data_type: 'TAHMİN' },
          ...config.cost_terms.map(t => rng() < 0.45
            ? { key: t.key, label: t.label, value: 'TEKLİF_ALINMALI', data_type: 'TAHMİN' }
            : { key: t.key, label: t.label, value: fmt(pmin * (0.01 + rng() * 0.04)), unit: cur, data_type: 'TAHMİN' }),
        ];
        const ec = put(s, {
          id: ecRec, kind: 'metric', category: p.cat.id, record_ref: { entity: 'claim', id: ecRec, version: 1 },
          title: 'Biz neden alıp satabiliriz', subtitle: 'Birim ekonomisi (TAHMİN)',
          big: { value: fmt(maxBuy), label: `${cur} altına alınırsa` },
          fields: ecFields,
          flags: ecFields.some(f => f.value === 'TEKLİF_ALINMALI') ? ['TEKLİF_ALINMALI'] : [],
          evidence: ev(ecRec, 'TAHMİN', { confidence: 'orta', status: 'ACCEPTED', note: 'Yöntem: en düşük gözlenen fiyat − gider kalemleri − hedef marj (DEMO senaryo).' }),
        });
        link(pc.id, ec.id, 'economics');
        // Konumlandırma önerisi — TİCARİ_ÖNERİ
        const recRec = rid(pfx('opportunity'));
        const tag = pick(DECISION_TAGS);
        const rc = put(s, {
          id: recRec, kind: 'recommendation', category: p.cat.id, record_ref: { entity: 'opportunity', id: recRec, version: 1 },
          title: 'Sitemizde', subtitle: `${seg(p.segment).label} segment`,
          big: { value: `${fmt(Math.round(pmin * 0.96 / 100) * 100)}`, label: `${cur} hedef fiyat` },
          fields: [
            { key: 'segment', label: 'Önerilen segment', value: seg(p.segment).label, data_type: 'TİCARİ_ÖNERİ' },
            { key: 'band', label: 'Fiyat bandı', value: `${fmt(pmin * 0.94)} – ${fmt(pmin * 1.0)}`, unit: cur, data_type: 'TİCARİ_ÖNERİ' },
            { key: 'decision_tag', label: 'Karar etiketi', value: tag, data_type: 'TİCARİ_ÖNERİ' },
          ],
          evidence: ev(recRec, 'TİCARİ_ÖNERİ', { confidence: 'orta', status: 'ACCEPTED', note: 'Öneri; karar kullanıcıdadır.' }),
        });
        link(pc.id, rc.id, 'positioning');
        if (p.supplier === 'BULUNAMADI') {
          const gc = put(s, {
            id: `${p.rec}-gap`, kind: 'gap', category: p.cat.id, record_ref: { entity: 'supplier', id: 'BULUNAMADI', version: 1 },
            title: 'Üretici bulunamadı', body: [`Bu ürünün üreticisi ${config.supply_region} tedarik araştırmasında henüz eşleşmedi. Üretici araştırması kullanıcı tarafından yapılacak.`],
            flags: ['BULUNAMADI'],
            evidence: ev(`${p.rec}-gap`, 'DOĞRUDAN_GÖZLEM', { evidence_level: 'BULUNAMADI', confidence: 'yüksek', status: 'ACCEPTED' }),
          });
          link(pc.id, gc.id, 'gap');
        }
      });
    }

    if (def.kind === 'sellers') {
      const s = mkScene(def);
      companies.forEach(c => {
        const ads = Object.values(c.ads).reduce((a, b) => a + b, 0);
        const cc = put(s, {
          id: c.rec, kind: 'entity', record_ref: { entity: 'company', id: c.rec, version: 1 },
          title: c.name, subtitle: `${c.products.length} seçilen üründe satıcı`,
          big: { value: c.products.length, label: 'ürün' },
          fields: [
            { key: 'products', label: 'Seçilen ürünlerde', value: c.products.length, data_type: 'DOĞRUDAN_GÖZLEM' },
            { key: 'ads', label: 'Reklam sayısı', value: ads, data_type: 'DOĞRUDAN_GÖZLEM' },
            { key: 'region', label: 'Tedarik bölgesi', value: config.supply_region, data_type: 'BİRİNCİL_KAYNAK' },
          ],
          evidence: ev(c.rec, 'DOĞRUDAN_GÖZLEM', { status: pick(['ACCEPTED', 'APPROVED']) }),
        });
        c.card = cc;
        c.products.forEach(p => link(cc.id, p.card.id, 'sells'));
      });
      products.filter(p => p.sellers.length >= 2).sort((a, b) => b.sellers.length - a.sellers.length).slice(0, Math.max(6, Math.round(products.length / 3))).forEach(p => {
        const unverified = p.priceCards.some(c => c.match_level === 'DOĞRULANAMADI' || c.match_level === 'GÖRSEL_BENZERLİK');
        const g = put(s, {
          id: `${p.rec}-same`, kind: 'entity', category: p.cat.id, record_ref: { entity: p.entity, id: p.rec, version: 1 },
          title: `${p.name} ${p.cat.short}`, subtitle: `${p.sellers.length} satıcı`,
          big: { value: p.sellers.length, label: 'satıcı' },
          fields: p.priceCards.map(c => ({ key: c.id, label: c.company, value: `${c.subtitle} · ${c.match_level}`, data_type: c.match_level === 'AYNI_MODEL_DOĞRULANDI' || c.match_level === 'REFERANS' ? 'DOĞRUDAN_GÖZLEM' : 'ANALİST_YORUMU', ref: c.id })),
          flags: unverified ? ['DOĞRULANAMADI'] : [],
          evidence: ev(`${p.rec}-same`, 'ANALİST_YORUMU', { confidence: unverified ? 'düşük' : 'orta', status: 'ACCEPTED', note: 'Muhtemel aynı ürün — eşleşme düzeyi her satırda ayrı. Benzer görünüş aynı model kanıtı değildir.' }),
        });
        link(g.id, p.card.id, 'same_product');
        p.priceCards.forEach(c => link(g.id, c.id, 'based_on'));
      });
    }

    if (def.kind === 'admap') {
      const s = mkScene(def);
      const rows = [...companies].sort((a, b) => Object.values(b.ads).reduce((x, y) => x + y, 0) - Object.values(a.ads).reduce((x, y) => x + y, 0));
      const ads = {};
      rows.forEach(c => config.categories.forEach(cat => {
        const n = c.ads[cat.id];
        ads[`${c.rec}|${cat.id}`] = Array.from({ length: n }, (_, k) => {
          const days = rint(3, 340);
          return {
            id: `DEMO-AD-${c.rec.slice(-4)}${cat.id.slice(0, 2)}${k}`, company: c.name, category: cat.label,
            text: `DEMO reklam metni ${k + 1}: ${cat.label} — mesajla bilgi alın.`,
            start: date(days), days, active: rng() < 0.6, library_url: 'https://www.facebook.com/ads/library/',
          };
        });
      }));
      put(s, {
        id: `${s.id}-matrix`, kind: 'matrix', record_ref: { entity: 'claim', id: 'DEMO-ADMAP', version: 1 },
        title: def.title, subtitle: 'Hücre = reklam sayısı. Tıkla: reklam listesi',
        matrix: {
          rows: rows.map(c => ({ id: c.rec, label: c.name })),
          cols: config.categories.map(c => ({ id: c.id, label: c.short, color: c.color })),
          values: rows.map(c => config.categories.map(cat => c.ads[cat.id])),
          ads,
        },
        evidence: ev('admap', 'DOĞRUDAN_GÖZLEM', { source_type: 'meta_reklam_kutuphanesi', status: 'ACCEPTED', confidence: 'yüksek', note: 'Reklam kütüphanesi sayımı (DEMO). Reklam sayısı harcama veya satış göstermez.' }),
      });
      const top = config.categories.map(cat => [cat, companies.reduce((a, c) => a + c.ads[cat.id], 0)]).sort((a, b) => b[1] - a[1])[0];
      const inf = inference(`En yoğun reklam ${top[0].label} kategorisinde (${top[1]} reklam). Satıcıların bu kategoride ısrar etmesi talep sinyali olabilir; satış kanıtı değildir.`, 'orta', [`${s.id}-matrix`], [`${s.id}-matrix`]);
      put(s, {
        id: inf.id, kind: 'inference', record_ref: { entity: 'inference', id: inf.id, version: 1 },
        title: 'Haritadan çıkan', body: [inf.text], inference_ids: [inf.id],
        evidence: ev(inf.id, 'ANALİST_YORUMU', { confidence: 'orta', status: 'ACCEPTED' }),
      });
      byId.get(`${s.id}-matrix`).inference_ids.push(inf.id);
      link(inf.id, `${s.id}-matrix`, 'based_on');
    }

    if (def.kind === 'economics') {
      const s = mkScene(def);
      config.categories.forEach(cat => {
        const ps = products.filter(p => p.cat === cat);
        if (!ps.length) return;
        const rec = rid(pfx('claim'));
        const med = ps.map(p => p.base * 0.55).sort((a, b) => a - b)[Math.floor(ps.length / 2)];
        const c = put(s, {
          id: rec, kind: 'metric', category: cat.id, record_ref: { entity: 'claim', id: rec, version: 1 },
          title: cat.label, subtitle: 'Kategori medyanı (TAHMİN)',
          big: { value: fmt(Math.round(med / 100) * 100), label: `${cur} azami alış` },
          fields: [
            { key: 'max_buy', label: 'Medyan azami alış', value: fmt(Math.round(med / 100) * 100), unit: cur, data_type: 'TAHMİN' },
            { key: 'ratio', label: 'Gider oranı', value: `%${rint(15, 20)} – %${rint(24, 33)}`, data_type: 'TAHMİN' },
            { key: 'n', label: 'Ürün', value: ps.length, data_type: 'DOĞRUDAN_GÖZLEM' },
          ],
          evidence: ev(rec, 'TAHMİN', { confidence: 'orta', status: 'ACCEPTED', note: 'Yöntem: 3 senaryo (iyimser/temel/kötümser) — DEMO.' }),
        });
        ps.forEach(p => link(c.id, p.card.id, 'aggregates'));
      });
      put(s, {
        id: `${s.id}-quotes`, kind: 'gap', record_ref: { entity: 'claim', id: 'TEKLİF_ALINMALI', version: 1 },
        title: 'Teklif alınmadan kesinleşmez', body: config.cost_terms.map(t => `${t.label}: TEKLİF_ALINMALI`),
        flags: ['TEKLİF_ALINMALI'],
        evidence: ev('quotes', 'TAHMİN', { evidence_level: 'DOĞRULANAMADI', confidence: 'düşük', status: 'ACCEPTED', note: 'Bilinmeyen maliyet sıfır sayılmaz.' }),
      });
    }

    if (def.kind === 'positioning') {
      const s = mkScene(def);
      config.categories.forEach(cat => {
        const ps = products.filter(p => p.cat === cat).sort((a, b) => b.score - a.score);
        if (!ps.length) return;
        const rec = rid(pfx('collection'));
        const segs = [...new Set(ps.map(p => seg(p.segment).label))];
        const c = put(s, {
          id: rec, kind: 'recommendation', category: cat.id, record_ref: { entity: 'collection', id: rec, version: 1 },
          title: cat.label, subtitle: `${segs.join(' / ')} segment`,
          big: { value: ps.length, label: 'ürünle gir' },
          fields: [
            { key: 'products', label: 'Ürünler', value: ps.map(p => p.name).join(', '), data_type: 'TİCARİ_ÖNERİ' },
            { key: 'segment', label: 'Segment', value: segs.join(' / '), data_type: 'TİCARİ_ÖNERİ' },
            { key: 'tag', label: 'Karar etiketi', value: pick(DECISION_TAGS), data_type: 'TİCARİ_ÖNERİ' },
          ],
          evidence: ev(rec, 'TİCARİ_ÖNERİ', { confidence: 'orta', status: 'ACCEPTED', note: 'Öneri; segment sınırları kullanıcı onayı bekliyor.' }),
        });
        ps.forEach(p => link(c.id, p.card.id, 'includes'));
      });
    }

    if (def.kind === 'gaps') {
      const s = mkScene(def);
      const noSup = products.filter(p => p.supplier === 'BULUNAMADI');
      const noCode = products.filter(p => p.code === 'BULUNAMADI');
      const unv = products.filter(p => p.priceCards.some(c => c.match_level === 'DOĞRULANAMADI'));
      const quote = products.filter(p => p.supplier === 'TEKLİF_ALINMALI');
      [
        ['Üretici eşleşmesi yok', noSup, 'BULUNAMADI'],
        ['Ürün kodu bulunamadı', noCode, 'BULUNAMADI'],
        ['Eşleşme doğrulanamadı', unv, 'DOĞRULANAMADI'],
        ['Tedarikçiden teklif alınmalı', quote, 'TEKLİF_ALINMALI'],
      ].forEach(([title, ps, flag], k) => {
        const c = put(s, {
          id: `${s.id}-${k}`, kind: 'gap', record_ref: { entity: 'claim', id: flag, version: 1 },
          title, big: { value: ps.length, label: 'ürün' },
          body: ps.slice(0, 8).map(p => `${p.name} ${p.cat.short} (${p.rec})`).concat(ps.length > 8 ? [`… +${ps.length - 8}`] : []),
          flags: [flag],
          evidence: ev(`${s.id}-${k}`, 'DOĞRUDAN_GÖZLEM', { evidence_level: flag === 'TEKLİF_ALINMALI' ? 'DOĞRULANAMADI' : 'BULUNAMADI', confidence: 'yüksek', status: 'ACCEPTED' }),
        });
        ps.forEach(p => link(c.id, p.card.id, 'gap'));
      });
    }
  }

  // İlişkili kartlar (iki yönlü)
  for (const l of links) {
    const a = byId.get(l.from), b = byId.get(l.to);
    if (a && b) { if (!a.related_card_ids.includes(b.id)) a.related_card_ids.push(b.id); if (!b.related_card_ids.includes(a.id)) b.related_card_ids.push(a.id); }
  }

  return {
    meta: { title: config.title, subtitle: config.subtitle, sector_config: config.id, built_at: new Date().toISOString(), data_mode: 'DEMO' },
    scenes, cards, media, inferences, links,
  };
}
