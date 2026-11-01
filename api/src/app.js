const express = require('express');
const cors = require('cors');

// Application Express (sans démarrage du serveur) — utilisée par index.js et par les tests
const app = express();

// Derrière nginx : l'IP du client vient de X-Forwarded-For (limitation des tentatives de connexion)
app.set('trust proxy', 1);

// Le front est servi par le même domaine (nginx) : CORS seulement si une origine est configurée
const corsOrigin = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*' ? process.env.CORS_ORIGIN.split(',') : false;
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path !== '/api/health' && process.env.NODE_ENV !== 'test')
      console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/charges', require('./routes/charges'));
app.use('/api/envelopes', require('./routes/envelopes'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/savings', require('./routes/savings'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/recurring', require('./routes/recurring'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/withdrawals', require('./routes/withdrawals'));
app.use('/api/bank', require('./routes/bank'));
app.use('/api/advances', require('./routes/advances'));
app.use('/api/push', require('./routes/push'));
app.use('/api/export', require('./routes/export'));

app.get('/api/health', (_, res) => res.json({ ok: true }));

module.exports = app;
