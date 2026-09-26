export const LAST_UPDATE = '1er septembre 2026';

// Source : arrêté du 5 août 2026, DGDDI — prix homologués paquet de 20 cigarettes
// Profil "filtre blanc, légères, format standard" = Marlboro Crafted et alternatives
export const TOBACCO_PRICES = [
  { brand: 'Benson & Hedges blue',  price: 11.00, tip: '💚 Filtre blanc, légères — moins cher que Marlboro Crafted' },
  { brand: 'Fortuna',               price: 11.40, tip: '💚 Filtre blanc, légères — alternative économique' },
  { brand: 'Marlboro Crafted',      price: 11.50, tip: '⭐ Filtre blanc, légères, format standard' },
  { brand: 'Winston Selection',     price: 11.50, tip: '👍 Filtre blanc, légères — même prix que Marlboro Crafted' },
  { brand: 'Camel',                 price: 13.00, tip: null },
  { brand: 'Chesterfield',          price: 13.00, tip: null },
  { brand: 'Gauloises Blondes',     price: 13.00, tip: null },
  { brand: 'Lucky Strike',          price: 13.00, tip: null },
  { brand: 'Philip Morris',         price: 13.00, tip: null },
  { brand: 'Winston Classic',       price: 13.00, tip: null },
  { brand: 'Marlboro Red',          price: 13.50, tip: null },
  { brand: 'Marlboro Gold',         price: 13.50, tip: null },
  { brand: 'Gauloises Brunes',      price: 14.20, tip: '🟤 Filtre brun, fortes' },
  { brand: 'Gitanes',               price: 14.60, tip: '💸 Le plus cher — filtre brun, très fortes' },
];

// Clés alignées avec l'API (gazole, sp95, e10, sp98, e85, gpl)
// Valeurs = fallback si API indisponible (moyennes nationales sept. 2026)
export const FUEL_PRICES = {
  e10:    { price: 2.168, label: 'Sans plomb 95-E10', note: 'Le plus courant' },
  sp98:   { price: 2.273, label: 'Sans plomb 98',     note: 'Moteurs récents' },
  gazole: { price: 2.397, label: 'Diesel',            note: 'Voitures diesel' },
  gpl:    { price: 1.051, label: 'GPL / Autogas',     note: 'Avec conversion (~1500€)' },
  e85:    { price: 0.896, label: 'E85 Bioéthanol',    note: 'Avec boîtier flex-fuel (~800€)' },
  sp95:   { price: 2.221, label: 'Sans plomb 95',     note: 'Moins répandu' },
};

export const FUEL_TIPS = [
  { tip: 'Stations supermarché (Leclerc, Intermarché) = 8-12 cts/L moins cher', icon: '🏪' },
  { tip: 'Remplissez lundi/mardi matin — prix montent le week-end', icon: '📅' },
  { tip: 'Comparez en temps réel sur prix-carburants.gouv.fr', icon: '🗺️' },
  { tip: 'E85 coûte 2× moins cher que SP95 avec boîtier flex-fuel (~800€)', icon: '🌿' },
  { tip: 'Gonflage des pneus correct = économie de 3-5% de carburant', icon: '🔧' },
];

export const GROCERY_BRANDS = [
  { product: 'Beurre 250g', economic: 'MDD ~1.80€', quality: 'Président ~2.90€', saving: '38%' },
  { product: 'Lait entier 1L', economic: 'MDD ~0.90€', quality: 'Candia ~1.35€', saving: '33%' },
  { product: 'Pâtes 500g', economic: 'MDD ~0.60€', quality: 'Barilla ~1.50€', saving: '60%' },
  { product: 'Riz 1kg', economic: 'MDD ~1.20€', quality: 'Uncle Ben\'s ~2.80€', saving: '57%' },
  { product: 'Yaourt nature x4', economic: 'MDD ~0.65€', quality: 'Danone ~1.20€', saving: '46%' },
  { product: 'Jus d\'orange 1L', economic: 'MDD ~1.40€', quality: 'Tropicana ~3.50€', saving: '60%' },
];

export const GROCERY_TIPS = [
  { tip: 'Marques distributeur (MDD) = 30-50% moins cher à qualité comparable', icon: '🏷️' },
  { tip: 'Lidl et Leclerc = meilleurs prix moyens en France (2025)', icon: '🏪' },
  { tip: 'Fruits/légumes de saison = 2-3× moins cher hors saison', icon: '🥦' },
  { tip: 'Too Good To Go et Phenix : paniers anti-gaspillage à -70%', icon: '♻️' },
  { tip: 'Lentilles et pois chiches : protéines à 1/5 du prix de la viande', icon: '🫘' },
  { tip: 'Acheter en lot lors des promos et congeler', icon: '🧊' },
  { tip: 'Liste de courses stricte = -20% de dépenses impulsives', icon: '📝' },
];

export const SAVINGS_TIPS = [
  { tip: 'Livret A : 2.4% garantis, sans risque, disponible', icon: '🏦', cta: null },
  { tip: 'LEP : 3.5% si éligible (revenus < 21 393€/an pour 1 part)', icon: '💚', cta: null },
  { tip: 'Automatiser virement épargne le jour de la paie', icon: '🔄', cta: null },
  { tip: 'Règle des 24h avant achat plaisir > 50€', icon: '⏳', cta: null },
  { tip: 'PEA : investissement actions avec fiscalité avantageuse après 5 ans', icon: '📈', cta: null },
];

export function tobaccoMonthlyCost(packsPerDay, brandPrice) {
  return Math.round(packsPerDay * brandPrice * 30.4 * 100) / 100;
}

export function tobaccoYearlyCost(packsPerDay, brandPrice) {
  return Math.round(packsPerDay * brandPrice * 365 * 100) / 100;
}
