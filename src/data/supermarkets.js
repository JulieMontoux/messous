// Indices prix basés sur comparatifs consommateurs 2025-2026
// Base 100 = panier moyen national. Source : enquêtes Que Choisir, LSA, UFC.
export const SUPERMARKETS = [
  { id: 'lidl',        name: 'Lidl',             index: 75,  logo: '🟡', tip: 'Le moins cher de France en panier moyen' },
  { id: 'aldi',        name: 'Aldi',              index: 76,  logo: '🔵', tip: 'Très compétitif, fort en MDD' },
  { id: 'leclerc',     name: 'E.Leclerc',         index: 82,  logo: '🔵', tip: 'Meilleur rapport qualité/prix des grandes surfaces' },
  { id: 'intermarch',  name: 'Intermarché',        index: 88,  logo: '🔴', tip: 'Bon pour la viande et les promos' },
  { id: 'carrefour',   name: 'Carrefour',          index: 93,  logo: '🔵', tip: 'Large choix, fidélité payante' },
  { id: 'superu',      name: 'Super U',            index: 91,  logo: '🔴', tip: 'Bon ancrage local, MDD compétitives' },
  { id: 'auchan',      name: 'Auchan',             index: 94,  logo: '🔴', tip: 'Bon en hypermarché, promos régulières' },
  { id: 'casino',      name: 'Casino / Géant',     index: 102, logo: '🟢', tip: 'Dans la moyenne haute' },
  { id: 'franprix',    name: 'Franprix',           index: 115, logo: '🔴', tip: 'Pratique en ville, mais plus cher' },
  { id: 'monoprix',    name: 'Monoprix',           index: 128, logo: '🟤', tip: 'Le plus cher — qualité et emplacement premium' },
  { id: 'autre',       name: 'Autre / Mixte',      index: 100, logo: '🛒', tip: 'Estimation sur base nationale moyenne' },
];

export const DEFAULT_SUPERMARKET = 'leclerc';

export function getSupermarket(id) {
  return SUPERMARKETS.find(s => s.id === id) || SUPERMARKETS.find(s => s.id === 'autre');
}

export function adjustGroceryBudget(baseBudget, supermarketId) {
  const s = getSupermarket(supermarketId);
  return Math.round((baseBudget * s.index) / 100 / 10) * 10;
}
