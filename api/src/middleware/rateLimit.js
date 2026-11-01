// Limitation simple en mémoire (une seule instance d'API) : N échecs par clé sur une fenêtre glissante
function createLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();

  function prune(key, now) {
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  }

  return {
    // Renvoie le nombre de secondes à attendre si la clé est bloquée, sinon 0
    blockedFor(key, now = Date.now()) {
      const list = prune(key, now);
      return list.length >= max ? Math.ceil((windowMs - (now - list[0])) / 1000) : 0;
    },
    fail(key, now = Date.now()) {
      const list = prune(key, now);
      list.push(now);
      hits.set(key, list);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

module.exports = { createLimiter };
