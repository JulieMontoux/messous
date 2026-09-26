const CACHE_KEY = 'messous_fuel_v2';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4h

const API_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
  'prix-des-carburants-en-france-flux-instantane-v2/records' +
  '?select=avg(gazole_prix)%20as%20gazole%2C' +
  'avg(sp95_prix)%20as%20sp95%2C' +
  'avg(e10_prix)%20as%20e10%2C' +
  'avg(sp98_prix)%20as%20sp98%2C' +
  'avg(e85_prix)%20as%20e85%2C' +
  'avg(gplc_prix)%20as%20gpl' +
  '&limit=1';

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

export async function fetchFuelPrices() {
  // Return cache if still fresh
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { prices: cached.prices, date: cached.date, source: 'cache' };
    }
  } catch {}

  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const raw = json.results?.[0];
    if (!raw) throw new Error('empty response');

    const prices = {
      gazole: round3(raw.gazole),
      sp95: round3(raw.sp95),
      e10: round3(raw.e10),
      sp98: round3(raw.sp98),
      e85: round3(raw.e85),
      gpl: round3(raw.gpl),
    };

    const date = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    localStorage.setItem(CACHE_KEY, JSON.stringify({ prices, date, ts: Date.now() }));
    return { prices, date, source: 'live' };
  } catch {
    return null;
  }
}
