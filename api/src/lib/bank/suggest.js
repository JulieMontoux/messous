// Suggestion de classement pour les opérations à classer :
// 1) marchands connus → catégorie (instantané), 2) IA locale (Ollama) pour le reste.
const { merchantKey } = require('./common');

// Mots-clés → catégorie d'enveloppe (categoryId) ou de charge fixe (fixed:categoryId)
const KEYWORDS = [
  [/LIDL|ALDI|CARREFOUR|AUCHAN|LECLERC|INTERMARCHE|MONOPRIX|FRANPRIX|CASINO|SUPER U|HYPER U|\bU EXPRESS|SYSTEME U|NETTO|LEADER PRICE|PICARD|GRAND FRAIS|BIOCOOP|NATURALIA|CORA|MATCH|SPAR|PROXI|BOULANGERIE|BOUCHERIE|PRIMEUR/, 'groceries'],
  [/TOTAL|ESSO|\bBP\b|SHELL|AVIA|STATION|CARBURANT|DYNEFF|AGIP/, 'fuel'],
  [/TABAC|CIVETTE|BUREAU DE TABAC/, 'tobacco'],
  [/PHARMA|PARAPHARM|MEDECIN|DOCTEUR|DENTISTE|OPTIC|LABORATOIRE|KINE/, 'health'],
  [/UBER ?EATS|DELIVEROO|JUST ?EAT|MC ?DONALD|MCDO|BURGER KING|KFC|RESTAURANT|BRASSERIE|PIZZ|SUSHI|STARBUCKS|PAUL\b|CAFE/, 'restaurant'],
  [/SNCF|RATP|NAVIGO|TRANSILIEN|\bTER\b|BLABLACAR|UBER\b(?! ?EATS)|BOLT|LIME|VELIB|TCL|TISSEO|PEAGE|PARKING|SANEF|VINCI AUTO|APRR/, 'transport'],
  [/CINEMA|UGC|PATHE|GAUMONT|FNAC|CULTURA|DECATHLON|STEAM|PLAYSTATION|NINTENDO|CONCERT|TICKETMASTER/, 'leisure'],
  [/ZARA|H ?& ?M|KIABI|PRIMARK|UNIQLO|CELIO|JULES|SHEIN|VINTED|BERSHKA|GO SPORT|CHAUSS/, 'clothing'],
  [/COIFF|BARBIER|ESTHETIQUE|SEPHORA|NOCIBE|YVES ROCHER|MARIONNAUD/, 'beauty'],
  [/ANIMAL|ZOOPLUS|VETERINAIRE|VETO|MAXI ZOO|TRUFFAUT/, 'pets'],
  [/AMAZON(?! PRIME)|CDISCOUNT|ALIEXPRESS|ETSY|IKEA|ACTION\b|GIFI|LA FOIR/, 'pleasure'],
  [/NORAUTO|FEU VERT|SPEEDY|MIDAS|GARAGE|CONTROLE TECHNIQUE/, 'car_maintenance'],
  [/NETFLIX|SPOTIFY|DISNEY|DEEZER|CANAL|AMAZON PRIME|APPLE\.COM|ICLOUD|GOOGLE ?(ONE|STORAGE)|YOUTUBE PREMIUM|PRIME VIDEO/, 'fixed:subscription'],
  [/EDF|ENGIE|TOTALENERGIES ELEC|ENI GAS|EKWATEUR|GAZ DE BORDEAUX/, 'fixed:energy'],
  [/VEOLIA|SUEZ|SAUR|EAU DE/, 'fixed:water'],
  [/FREE MOBILE|FREE TELECOM|ORANGE|SFR|BOUYGUES|SOSH|RED BY SFR|B ?& ?YOU/, 'fixed:telecom'],
  [/MUTUELLE|HARMONIE|MGEN|ALAN\b|SWISS ?LIFE/, 'fixed:mutuelle'],
  [/AXA|MAIF|MACIF|MATMUT|ALLIANZ|GMF|MMA|GROUPAMA|DIRECT ASSURANCE|ASSURANCE/, 'fixed:insurance'],
  [/LOYER|FONCIA|NEXITY|CITYA|BAILLEUR|OPH|HLM/, 'fixed:housing'],
];

function keywordTarget(label, envelopes, charges) {
  const text = String(label || '').toUpperCase();
  for (const [re, cat] of KEYWORDS) {
    if (!re.test(text)) continue;
    if (cat.startsWith('fixed:')) {
      const c = charges.find(x => x.category_id === cat.slice(6));
      if (c) return `fix:${c.id}`;
    } else {
      const e = envelopes.find(x => x.category_id === cat);
      if (e) return `env:${e.id}`;
    }
  }
  return null;
}

async function ollamaTargets(items, envelopes, charges) {
  const url = process.env.OLLAMA_URL;
  if (!url || !items.length) return {};
  const options = [
    ...envelopes.map((e, i) => ({ code: `E${i + 1}`, target: `env:${e.id}`, label: `${e.name} (enveloppe)` })),
    ...charges.map((c, i) => ({ code: `F${i + 1}`, target: `fix:${c.id}`, label: `${c.name} (charge fixe)` })),
  ];
  const prompt = `Tu classes des opérations bancaires françaises dans le budget d'une personne.
Catégories possibles (code : nom) :
${options.map(o => `${o.code} : ${o.label}`).join('\n')}

Opérations (numéro : libellé bancaire) :
${items.map((it, i) => `${i + 1} : ${it.label}`).join('\n')}

Réponds uniquement en JSON : {"1": "E2", "2": "F1", ...}. Mets null si tu n'es pas sûr.`;
  const res = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
      prompt,
      format: 'json',
      stream: false,
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.response || '{}');
  const out = {};
  items.forEach((it, i) => {
    const code = parsed[String(i + 1)];
    const opt = options.find(o => o.code === code);
    if (opt) out[it.id] = opt.target;
  });
  return out;
}

// items : [{ id, label }] → { [id]: { target, source: 'keyword' | 'ai' } }
async function suggestTargets(items, envelopes, charges, { useAi = true } = {}) {
  const result = {};
  const rest = [];
  for (const it of items) {
    const t = keywordTarget(it.label, envelopes, charges);
    if (t) result[it.id] = { target: t, source: 'keyword' };
    else rest.push(it);
  }
  let aiError = null;
  if (useAi && rest.length) {
    // Une seule question par marchand (les libellés d'un même marchand se répètent)
    const byMerchant = new Map();
    for (const it of rest) {
      const key = merchantKey(it.label) || it.label;
      if (!byMerchant.has(key)) byMerchant.set(key, { id: it.id, label: it.label, ids: [] });
      byMerchant.get(key).ids.push(it.id);
    }
    const unique = [...byMerchant.values()].slice(0, 40);
    try {
      const ai = await ollamaTargets(unique, envelopes, charges);
      for (const u of unique) {
        if (ai[u.id]) u.ids.forEach(id => { result[id] = { target: ai[u.id], source: 'ai' }; });
      }
    } catch (err) {
      aiError = err.message;
    }
  }
  return { suggestions: result, aiError };
}

module.exports = { suggestTargets, keywordTarget };
