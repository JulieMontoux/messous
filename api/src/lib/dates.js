// Dates locales (le conteneur tourne avec TZ=Europe/Paris)
const pad = n => String(n).padStart(2, '0');

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function daysInMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function isLastDayOfMonth(d = new Date()) {
  return d.getDate() === daysInMonth(d);
}

module.exports = { localDate, monthKey, daysInMonth, isLastDayOfMonth };
