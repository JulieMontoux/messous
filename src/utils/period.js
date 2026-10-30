// Dates manipulées en chaînes locales 'YYYY-MM-DD' : pas de décalage de fuseau horaire
const pad = n => String(n).padStart(2, '0');

export function toLocalDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseLocalDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function previousMonthKey(d = new Date()) {
  return monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

export function daysInMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function isLastDayOfMonth(d = new Date()) {
  return d.getDate() === daysInMonth(d);
}

export function addDays(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

export function daysBetween(fromStr, toStr) {
  return Math.round((parseLocalDate(toStr) - parseLocalDate(fromStr)) / 86400000);
}

export function mondayOf(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toLocalDate(d);
}

// Dernier retrait enregistré à aujourd'hui ou avant
export function lastWithdrawal(withdrawals = [], now = new Date()) {
  const today = toLocalDate(now);
  return withdrawals
    .filter(w => w.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

// Début de la semaine budgétaire : calée sur le jour du dernier retrait (cycles de 7 jours),
// sinon lundi.
export function weekStart(now = new Date(), withdrawals = []) {
  const last = lastWithdrawal(withdrawals, now);
  if (!last) return mondayOf(now);
  const elapsed = daysBetween(last.date, toLocalDate(now));
  return addDays(last.date, Math.floor(elapsed / 7) * 7);
}

export function periodStart(mode, { now = new Date(), withdrawals = [] } = {}) {
  if (mode === 'weekly') return weekStart(now, withdrawals);
  return `${monthKey(now)}-01`;
}

export function periodEnd(mode, opts = {}) {
  const { now = new Date() } = opts;
  if (mode === 'weekly') return addDays(periodStart(mode, opts), 6);
  return `${monthKey(now)}-${pad(daysInMonth(now))}`;
}

export function formatDay(dateStr, opts = { day: 'numeric', month: 'short' }) {
  return parseLocalDate(dateStr).toLocaleDateString('fr-FR', opts);
}
