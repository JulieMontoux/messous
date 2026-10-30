import { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw, Wifi, WifiOff, Sparkles, AlertCircle } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import {
  TOBACCO_PRICES, FUEL_PRICES, FUEL_TIPS, GROCERY_BRANDS, GROCERY_TIPS, SAVINGS_TIPS,
} from '../data/staticPrices';
import { fmt, fmtDec } from '../utils/budget';
import { fetchFuelPrices } from '../utils/fuelApi';
import { SUPERMARKETS, getSupermarket } from '../data/supermarkets';
import { api } from '../api/client';
import { getTobaccoType, tobaccoMonthlyBudget } from '../data/defaults';
import PageHeader from '../components/PageHeader';

// Tabac : coût réel selon le profil (type + prix modifiable) et pistes d'économie
function TobaccoSection({ profile, navigate }) {
  const type = getTobaccoType(profile.tobaccoType);
  const price = Number(profile.tobaccoPackPrice) || type.defaultPrice;
  const perWeek = Number(profile.tobaccoPacksPerWeek) || 0;
  const monthly = tobaccoMonthlyBudget(profile);
  const yearly = Math.round(price * perWeek * 52);
  const cheapest = [...TOBACCO_PRICES].sort((a, b) => a.price - b.price)[0];
  const indusSaving = type.id === 'indus' && price > cheapest.price
    ? Math.round((price - cheapest.price) * perWeek * 52 / 12)
    : 0;
  const lessOne = perWeek > 0 ? Math.round(price * Math.min(1, perWeek) * 52 / 12) : 0;

  return (
    <Section title="Tabac" emoji="🚬">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-600">
          {type.icon} {type.label} · <strong>{fmtDec(price)}</strong> / {type.unit} · {perWeek} / semaine
        </p>
        <button onClick={() => navigate?.('settings')} className="text-xs text-primary font-medium">Modifier</button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl bg-warn/5 border border-warn/20 p-3 text-center">
          <p className="text-lg font-bold text-warn">{fmt(monthly)}</p>
          <p className="text-xs text-slate-400">/ mois</p>
        </div>
        <div className="rounded-xl bg-danger/5 border border-danger/20 p-3 text-center">
          <p className="text-lg font-bold text-danger">{fmt(yearly)}</p>
          <p className="text-xs text-slate-400">/ an</p>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm text-slate-600 mb-3">
        {indusSaving > 0 && (
          <li>💚 Passer à <strong>{cheapest.brand}</strong> ({fmtDec(cheapest.price)}) : <strong className="text-savings">−{fmt(indusSaving)} / mois</strong></li>
        )}
        {type.id === 'indus' && (
          <li>🌿 Le tabac à rouler ou à tuber revient en général 30 à 50 % moins cher par cigarette.</li>
        )}
        {type.id !== 'indus' && (
          <li>👍 Bon choix côté budget : {type.short.toLowerCase()} revient moins cher que les cigarettes industrielles.</li>
        )}
        {lessOne > 0 && (
          <li>📉 Un {type.unit} de moins par semaine = <strong className="text-savings">−{fmt(lessOne)} / mois</strong></li>
        )}
        <li>🔔 Active l'alerte e-mail dans ton profil pour être prévenu(e) quand le budget tabac est épuisé.</li>
      </ul>
      {type.id === 'indus' && (
        <div className="space-y-2">
          {TOBACCO_PRICES.map(({ brand, price: p, tip }) => (
            <div key={brand} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-700">{brand}</p>
                {tip && <p className="text-xs text-slate-400">{tip}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-800">{fmtDec(p)}</p>
                <p className="text-xs text-slate-400">/paquet</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Section({ title, emoji, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <h2 className="font-semibold text-slate-800">{emoji} {title}</h2>
        <span className="text-slate-400 text-lg">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function parseAdvice(text) {
  return text
    .split(/\n(?=\d+\.)/)
    .map(s => s.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

function AdviceList({ text }) {
  const lines = parseAdvice(text);
  if (!lines.length) {
    return <p className="text-sm text-slate-500 whitespace-pre-wrap leading-relaxed">{text}</p>;
  }
  return (
    <ol className="space-y-3">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
            {i + 1}
          </span>
          <p className="text-sm text-slate-600 leading-relaxed">{line}</p>
        </li>
      ))}
    </ol>
  );
}

function AiSection() {
  const [streamText, setStreamText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const data = await api.get('/api/ai/history');
      setHistory(data);
    } catch {}
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setStreamText('');

    const token = localStorage.getItem('messous_token');
    let res;
    try {
      res = await fetch('/api/ai/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
    } catch {
      setError('Impossible de contacter le serveur');
      setLoading(false);
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
      setError(err.error || 'Erreur serveur');
      setLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.error) { setError(data.error); break; }
          if (data.token) setStreamText(prev => prev + data.token);
          if (data.done) { await loadHistory(); }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles size={16} className="text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Conseils IA personnalisés</h2>
            <p className="text-xs text-slate-400">llama3.1:8b · local · privé</p>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="btn-primary flex items-center gap-1.5 py-2 text-sm disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {streamText ? 'Régénérer' : 'Analyser'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-danger/5 rounded-xl p-3 mb-3">
          <AlertCircle size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-danger">Ollama indisponible</p>
            <p className="text-xs text-slate-500 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {(streamText || loading) && (
        <div className="mb-2">
          {streamText
            ? <AdviceList text={streamText} />
            : (
              <div className="py-6 text-center">
                <RefreshCw size={22} className="animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-slate-500">Analyse en cours…</p>
                <p className="text-xs text-slate-400 mt-1">1–3 min sur CPU</p>
              </div>
            )
          }
          {loading && streamText && (
            <span className="inline-block w-1.5 h-4 bg-primary rounded-sm animate-pulse ml-1 align-middle" />
          )}
        </div>
      )}

      {!loading && !error && !streamText && (
        <p className="text-sm text-slate-400 text-center py-4">
          Conseils personnalisés basés sur ton profil, tes enveloppes et ton historique d'épargne.
        </p>
      )}

      {/* Historique */}
      {history.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Historique ({history.length})
            </span>
            <span className="text-slate-400 text-sm">{historyOpen ? '−' : '+'}</span>
          </button>
          {historyOpen && (
            <div className="mt-3 space-y-3">
              {history.map(h => (
                <div key={h.id} className="border border-slate-100 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-2">
                    {new Date(h.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                  <AdviceList text={h.content} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Suggestions({ navigate }) {
  const { state } = useBudget();
  const { profile } = state;

  const [gasData, setGasData] = useState(null); // { prices, date, source }
  const [gasLoading, setGasLoading] = useState(false);
  const [gasError, setGasError] = useState(false);

  async function loadGasPrices() {
    setGasLoading(true);
    setGasError(false);
    const result = await fetchFuelPrices();
    if (result) {
      setGasData(result);
    } else {
      setGasError(true);
    }
    setGasLoading(false);
  }

  useEffect(() => { loadGasPrices(); }, []);

  // Use live prices if available, fall back to static
  const displayPrices = gasData?.prices || Object.fromEntries(
    Object.entries(FUEL_PRICES).map(([k, v]) => [k, v.price])
  );

  return (
    <div className="pt-6 pb-4 space-y-4">
      <PageHeader
        title="Astuces & Prix"
        subtitle={gasData?.source === 'live' ? `Données en direct — ${gasData.date}` :
          gasData?.source === 'cache' ? `Cache — ${gasData.date}` :
          gasLoading ? 'Chargement des prix…' : 'Données statiques (API indisponible)'}
      />

      <AiSection />

      {/* Carburant */}
      <Section title="Carburant" emoji="⛽">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {gasLoading ? (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <RefreshCw size={11} className="animate-spin" /> Calcul des moyennes…
              </span>
            ) : gasData?.source === 'live' ? (
              <span className="flex items-center gap-1 text-xs text-savings"><Wifi size={11} /> En direct</span>
            ) : gasData?.source === 'cache' ? (
              <span className="text-xs text-slate-400">Cache {gasData.date}</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-warn"><WifiOff size={11} /> Données statiques</span>
            )}
          </div>
          <button
            onClick={loadGasPrices}
            disabled={gasLoading}
            className="flex items-center gap-1 text-xs text-primary font-medium disabled:opacity-40"
          >
            <RefreshCw size={12} className={gasLoading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>

        {gasLoading && !gasData && (
          <div className="py-4 text-center">
            <RefreshCw size={20} className="animate-spin text-primary mx-auto mb-2" />
            <p className="text-xs text-slate-400">Chargement…</p>
          </div>
        )}

        <div className="space-y-2 mb-4">
          {Object.entries(FUEL_PRICES).map(([key, { label, note }]) => {
            const price = displayPrices[key] ?? null;
            return (
              <div key={key} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <p className="text-xs text-slate-400">{note}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">
                    {price != null ? fmtDec(price) : '—'}
                  </p>
                  <p className="text-xs text-slate-400">/L</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 mb-3">
          {FUEL_TIPS.map((tip, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span>{tip.icon}</span>
              <span className="text-slate-600">{tip.tip}</span>
            </div>
          ))}
        </div>
        <a
          href="https://www.prix-carburants.gouv.fr/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-primary font-medium hover:text-primary-dark"
        >
          Trouver la station la moins chère près de chez toi
          <ExternalLink size={13} />
        </a>
      </Section>

      {/* Tabac */}
      {profile.isSmoker && <TobaccoSection profile={profile} navigate={navigate} />}

      {/* Courses */}
      <Section title="Courses alimentaires" emoji="🛒">
        {/* Comparatif supermarchés */}
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Comparatif supermarchés</p>
        <div className="space-y-1.5 mb-4">
          {SUPERMARKETS.filter(s => s.id !== 'autre').map(s => {
            const isCurrent = profile.supermarket === s.id;
            const cheaper = s.index < (getSupermarket(profile.supermarket)?.index || 100);
            return (
              <div key={s.id} className={`flex items-center gap-2 py-2 px-3 rounded-xl ${isCurrent ? 'bg-primary/5 border border-primary/20' : 'bg-slate-50'}`}>
                <span className="text-base">{s.logo}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isCurrent ? 'text-primary' : 'text-slate-700'}`}>
                    {s.name} {isCurrent && <span className="text-xs font-normal text-primary/70">← ton magasin</span>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    s.index <= 80 ? 'bg-savings/10 text-savings' :
                    s.index <= 92 ? 'bg-blue-50 text-blue-600' :
                    s.index <= 100 ? 'bg-slate-100 text-slate-600' :
                    'bg-warn/10 text-warn'
                  }`}>
                    indice {s.index}
                  </span>
                  {!isCurrent && cheaper && (
                    <p className="text-xs text-savings mt-0.5">
                      -{Math.round(((getSupermarket(profile.supermarket)?.index || 100) - s.index))}% moins cher
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-2 mb-4">
          {GROCERY_TIPS.map((item, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span>{item.icon}</span>
              <span className="text-slate-600">{item.tip}</span>
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">MDD vs Grande marque</p>
        <div className="space-y-2">
          {GROCERY_BRANDS.map(({ product, economic, quality, saving }) => (
            <div key={product} className="flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-700 truncate">{product}</p>
                <div className="flex gap-2 text-xs text-slate-400">
                  <span className="text-savings">{economic}</span>
                  <span>vs</span>
                  <span>{quality}</span>
                </div>
              </div>
              <span className="badge bg-savings/10 text-savings flex-shrink-0">-{saving}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Épargne */}
      <Section title="Épargne & bons réflexes" emoji="💰">
        <div className="space-y-3">
          {SAVINGS_TIPS.map((item, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="text-xl">{item.icon}</span>
              <p className="text-sm text-slate-600">{item.tip}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
