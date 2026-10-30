const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

// GET history — last 10 saved analyses
router.get('/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, content, created_at FROM ai_suggestions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [req.user.userId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /suggestions — streaming SSE
router.post('/suggestions', async (req, res) => {
  const userId = req.user.userId;
  try {
    const [profileRes, chargesRes, envelopesRes, txRes, savingsRes, trendsRes] = await Promise.all([
      pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM fixed_charges WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM envelopes WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT 60', [userId]),
      pool.query('SELECT * FROM savings_history WHERE user_id = $1 ORDER BY month DESC LIMIT 6', [userId]),
      pool.query(
        `SELECT TO_CHAR(date, 'YYYY-MM') AS month, envelope_id, SUM(amount) AS total
         FROM transactions
         WHERE user_id = $1 AND date >= NOW() - INTERVAL '5 months'
         GROUP BY month, envelope_id
         ORDER BY month DESC`,
        [userId]
      ),
    ]);

    const profile = profileRes.rows[0];
    if (!profile) return res.status(400).json({ error: 'Profil introuvable' });

    const charges = chargesRes.rows;
    const envelopes = envelopesRes.rows;
    const transactions = txRes.rows;
    const savingsHistory = savingsRes.rows;
    const trendsRows = trendsRes.rows;

    const salary = Number(profile.net_salary) || 0;
    const perMonth = c => Number(c.amount) / ({ yearly: 12, quarterly: 3 }[c.frequency] || 1);
    const totalFixed = Math.round(charges.reduce((s, c) => s + perMonth(c), 0));
    const totalEnv = envelopes.filter(e => e.type !== 'saving').reduce((s, e) => s + Number(e.budget_monthly), 0);
    const totalSaving = envelopes.filter(e => e.type === 'saving').reduce((s, e) => s + Number(e.budget_monthly), 0);
    const remainder = salary - totalFixed - totalEnv - totalSaving;

    // Spending this month per envelope
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTx = transactions.filter(t => new Date(t.date) >= monthStart);
    const spentByEnv = {};
    for (const t of monthTx) {
      spentByEnv[t.envelope_id] = (spentByEnv[t.envelope_id] || 0) + Number(t.amount);
    }

    const prompt = buildPrompt(profile, charges, envelopes, spentByEnv, savingsHistory, trendsRows, {
      salary, totalFixed, totalEnv, totalSaving, remainder,
    });

    const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';

    const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: { temperature: 0.7, num_predict: 600 },
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!ollamaRes.ok) throw new Error(`Ollama ${ollamaRes.status}`);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        let data;
        try { data = JSON.parse(line); } catch { continue; }

        if (data.response) {
          fullText += data.response;
          res.write(`data: ${JSON.stringify({ token: data.response })}\n\n`);
        }

        if (data.done) {
          // Persist to DB
          await pool.query(
            'INSERT INTO ai_suggestions (user_id, content) VALUES ($1, $2)',
            [userId, fullText]
          ).catch(() => {});
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
      }
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      res.status(isTimeout ? 504 : 503).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

function buildPrompt(profile, charges, envelopes, spentByEnv, savingsHistory, trendsRows, summary) {
  const { salary, totalFixed, totalEnv, totalSaving, remainder } = summary;
  const savingsRate = salary > 0 ? Math.round((totalSaving / salary) * 100) : 0;

  const chargeLines = charges.length
    ? charges.map(c => `  - ${c.name}: ${Number(c.amount)}€${c.frequency === 'yearly' ? ' par an' : c.frequency === 'quarterly' ? ' par trimestre' : ''}`).join('\n')
    : '  (aucune)';

  const envLines = envelopes.length
    ? envelopes.map(e => {
        const spent = spentByEnv[e.id] || 0;
        const budget = Number(e.budget_monthly);
        const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
        const status = spent > budget ? `⚠️ dépassement +${Math.round(spent - budget)}€` : pct >= 80 ? `⚡ ${pct}% utilisé` : `✓`;
        return `  - ${e.name}: ${spent}€/${budget}€ ${status} (${e.type})`;
      }).join('\n')
    : '  (aucune)';

  const savingsLines = savingsHistory.length
    ? savingsHistory.map(s =>
        `  - ${s.month}: épargne ${Number(s.total_savings)}€, reste libre ${Number(s.remainder)}€`
      ).join('\n')
    : '  (pas encore d\'historique)';

  // Build spending trends per envelope (last 5 months)
  const trendsByEnv = {};
  for (const row of trendsRows) {
    if (!trendsByEnv[row.envelope_id]) trendsByEnv[row.envelope_id] = [];
    trendsByEnv[row.envelope_id].push({ month: row.month, total: Number(row.total) });
  }
  const trendLines = envelopes
    .filter(e => trendsByEnv[e.id]?.length >= 2)
    .map(e => {
      const months = trendsByEnv[e.id];
      const vals = months.map(m => `${m.month}: ${Math.round(m.total)}€`).join(', ');
      const last = months[0]?.total || 0;
      const prev = months[1]?.total || 0;
      const trend = prev > 0 ? ((last - prev) / prev * 100).toFixed(0) : null;
      const arrow = trend > 10 ? ` ↑+${trend}%` : trend < -10 ? ` ↓${trend}%` : '';
      return `  - ${e.name}: ${vals}${arrow}`;
    })
    .join('\n');

  return `Tu es un conseiller financier expert en budget personnel français. \
Analyse ce budget et génère exactement 5 conseils personnalisés, concis et actionnables. \
Utilise les chiffres réels. Signale les dépassements d'enveloppes. \
Réponds uniquement avec les 5 conseils numérotés (1. 2. 3. 4. 5.), sans introduction ni conclusion.

PROFIL:
- Salaire net: ${salary}€/mois
- Foyer: ${profile.household_adults} adulte(s), ${profile.household_children} enfant(s)
- Région: ${profile.region || 'France'}
- Supermarché: ${profile.supermarket || 'non précisé'}
- Fumeur: ${profile.is_smoker ? 'oui' : 'non'}
- Voiture: ${profile.has_car ? 'oui' : 'non'}

RÉPARTITION MENSUELLE:
- Charges fixes: ${totalFixed}€ (${salary > 0 ? Math.round((totalFixed / salary) * 100) : 0}% du salaire)
- Enveloppes variables: ${totalEnv}€
- Épargne: ${totalSaving}€ (taux ${savingsRate}%)
- Reste libre: ${remainder}€

CHARGES FIXES:
${chargeLines}

ENVELOPPES (dépenses mois en cours):
${envLines}

HISTORIQUE ÉPARGNE (6 derniers mois):
${savingsLines}
${trendLines ? `\nTENDANCES DÉPENSES PAR ENVELOPPE (5 derniers mois):\n${trendLines}` : ''}`;
}

module.exports = router;
