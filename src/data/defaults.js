import { adjustGroceryBudget } from './supermarkets.js';

export const ENVELOPE_CATEGORIES = [
  { id: 'groceries', name: 'Courses', icon: '🛒', colorKey: 'needs', type: 'need' },
  { id: 'fuel', name: 'Essence', icon: '⛽', colorKey: 'needs', type: 'need' },
  { id: 'tobacco', name: 'Tabac', icon: '🚬', colorKey: 'wants', type: 'want' },
  { id: 'restaurant', name: 'Restaurants / Livraisons', icon: '🍽️', colorKey: 'wants', type: 'want' },
  { id: 'pleasure', name: 'Achats plaisirs', icon: '🛍️', colorKey: 'wants', type: 'want' },
  { id: 'leisure', name: 'Sorties / Loisirs', icon: '🎉', colorKey: 'wants', type: 'want' },
  { id: 'health', name: 'Santé / Pharmacie', icon: '💊', colorKey: 'needs', type: 'need' },
  { id: 'beauty', name: 'Coiffure / Beauté', icon: '✂️', colorKey: 'wants', type: 'want' },
  { id: 'pets', name: 'Animaux', icon: '🐾', colorKey: 'wants', type: 'want' },
  { id: 'clothing', name: 'Vêtements', icon: '👗', colorKey: 'wants', type: 'want' },
  { id: 'transport', name: 'Transports', icon: '🚌', colorKey: 'needs', type: 'need' },
  { id: 'car_maintenance', name: 'Entretien voiture', icon: '🔧', colorKey: 'needs', type: 'need' },
  { id: 'gifts', name: 'Cadeaux', icon: '🎁', colorKey: 'wants', type: 'want' },
  { id: 'vacation', name: 'Vacances', icon: '✈️', colorKey: 'wants', type: 'want' },
  { id: 'other', name: 'Divers', icon: '📦', colorKey: 'fixed', type: 'need' },
  { id: 'livret', name: 'Livret A / LEP', icon: '🏦', colorKey: 'saving', type: 'saving' },
  { id: 'saving_project', name: 'Projet épargne', icon: '🎯', colorKey: 'saving', type: 'saving' },
  { id: 'assurance_vie', name: 'Assurance-vie / PEA', icon: '📈', colorKey: 'saving', type: 'saving' },
  { id: 'emergency', name: 'Fonds d\'urgence', icon: '🛡️', colorKey: 'saving', type: 'saving' },
];

export const FIXED_CATEGORIES = [
  { id: 'housing', name: 'Logement', icon: '🏠' },
  { id: 'energy', name: 'Énergie', icon: '⚡' },
  { id: 'water', name: 'Eau', icon: '💧' },
  { id: 'telecom', name: 'Télécom', icon: '📱' },
  { id: 'insurance', name: 'Assurances', icon: '🛡️' },
  { id: 'mutuelle', name: 'Mutuelle', icon: '🏥' },
  { id: 'subscription', name: 'Abonnements', icon: '📺' },
  { id: 'loan', name: 'Crédits', icon: '💳' },
  { id: 'school', name: 'Cantine / Frais scolaires', icon: '🏫' },
  { id: 'savings', name: 'Épargne programmée', icon: '🐷' },
  { id: 'other_fixed', name: 'Autres', icon: '📌' },
];

export const REGIONS = [
  'Île-de-France',
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Bretagne',
  'Centre-Val de Loire',
  'Corse',
  'Grand Est',
  'Hauts-de-France',
  'Normandie',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Pays de la Loire',
  "Provence-Alpes-Côte d'Azur",
  'DOM-TOM',
];

export const COLOR_MAP = {
  needs: { bg: '#dbeafe', text: '#2563eb', ring: '#3b82f6' },
  wants: { bg: '#ede9fe', text: '#7c3aed', ring: '#8b5cf6' },
  saving: { bg: '#d1fae5', text: '#059669', ring: '#10b981' },
  fixed: { bg: '#f1f5f9', text: '#475569', ring: '#64748b' },
  danger: { bg: '#ffe4e6', text: '#e11d48', ring: '#f43f5e' },
  warn: { bg: '#fef3c7', text: '#d97706', ring: '#f59e0b' },
};

export function generateId() {
  return crypto.randomUUID();
}

export function suggestEnvelopes(profile) {
  const { netSalary, householdAdults, householdChildren, pets, isSmoker, hasCar, supermarket } = profile;
  const adults = Math.max(1, householdAdults);
  const children = householdChildren || 0;
  const totalPets = (pets?.dogs || 0) + (pets?.cats || 0) + (pets?.other || 0);

  // Base grocery estimate (indice 100 = moyenne nationale)
  const baseGroceries = Math.round(
    ((adults * 280) + (children * 140) + ((pets?.dogs || 0) * 80) + ((pets?.cats || 0) * 50) + ((pets?.other || 0) * 30)) / 10
  ) * 10;

  const groceries = adjustGroceryBudget(baseGroceries, supermarket || 'autre');

  const fuel = hasCar ? Math.round((adults * 120) / 10) * 10 : 0;
  const tobacco = isSmoker ? Math.round((adults * 13 * 20) / 10) * 10 : 0;
  const health = Math.round(((adults + children) * 30) / 10) * 10;
  const petsAmt = totalPets > 0
    ? Math.round(((pets?.dogs || 0) * 70 + (pets?.cats || 0) * 45 + (pets?.other || 0) * 25) / 10) * 10
    : 0;
  const transport = !hasCar ? Math.round((adults * 85) / 10) * 10 : 0;

  const restaurant = Math.round((adults * 60) / 10) * 10;
  const beauty = Math.round((adults * 30) / 10) * 10;
  const carMaintenance = hasCar ? Math.round((adults * 60) / 10) * 10 : 0;
  const gifts = Math.round(((adults * 25) + (children * 10)) / 10) * 10;
  const vacation = Math.round(((adults * 80) + (children * 40)) / 10) * 10;

  const afterFixed = netSalary * 0.5;
  const baseLeft = afterFixed - groceries - fuel - tobacco - health - petsAmt - transport - restaurant - beauty - carMaintenance;
  const pleasure = Math.max(30, Math.round(baseLeft * 0.3 / 10) * 10);
  const leisure = Math.max(30, Math.round(baseLeft * 0.3 / 10) * 10);

  return { groceries, fuel, tobacco, restaurant, health, beauty, pets: petsAmt, clothing: Math.round((adults * 40) / 10) * 10, transport, car_maintenance: carMaintenance, gifts, vacation, pleasure, leisure };
}

export function defaultFixedCharges() {
  return [
    { id: generateId(), name: 'Loyer / Crédit immo', categoryId: 'housing', amount: 700 },
    { id: generateId(), name: 'Électricité / Gaz', categoryId: 'energy', amount: 100 },
    { id: generateId(), name: 'Eau', categoryId: 'water', amount: 30 },
    { id: generateId(), name: 'Internet', categoryId: 'telecom', amount: 32 },
    { id: generateId(), name: 'Téléphone mobile', categoryId: 'telecom', amount: 20 },
    { id: generateId(), name: 'Mutuelle', categoryId: 'mutuelle', amount: 50 },
    { id: generateId(), name: 'Assurance habitation', categoryId: 'insurance', amount: 25 },
    { id: generateId(), name: 'Assurance auto', categoryId: 'insurance', amount: 60 },
  ];
}
