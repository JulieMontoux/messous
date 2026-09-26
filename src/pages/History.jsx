import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PiggyBank, TrendingUp, Calendar, Award, ArrowUpRight } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { fmt } from '../utils/budget';

const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatMonth(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  return `${MONTH_FR[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

function formatMonthLong(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  return `${MONTH_FR[parseInt(m, 10) - 1]} ${y}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-savings' }) {
  return (
    <div className="card text-center py-4">
      <Icon size={18} className={`${color} mx-auto mb-1`} />
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-3 text-sm min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map(p => p.value > 0 && (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-slate-500 flex-1">{p.name}</span>
          <span className="font-semibold text-slate-800">{fmt(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-slate-100 mt-1.5 pt-1.5 flex justify-between text-xs">
        <span className="text-slate-500">Total planifié</span>
        <span className="font-bold text-savings">{fmt(total)}</span>
      </div>
    </div>
  );
};

export default function History() {
  const { state } = useBudget();
  const { savingsHistory, profile, transactions, envelopes } = state;

  const savingEnvIds = new Set(envelopes.filter(e => e.type === 'saving').map(e => e.id));

  // Actual transferred per month from saving envelope transactions
  const actualByMonth = {};
  transactions.forEach(t => {
    if (!savingEnvIds.has(t.envelopeId)) return;
    const month = t.date.slice(0, 7);
    actualByMonth[month] = (actualByMonth[month] || 0) + Number(t.amount || 0);
  });

  const history = savingsHistory.filter(s => s.totalSavings > 0 || s.programmedSavings > 0 || s.savingEnvelopes > 0);

  const totalPlanned = history.reduce((s, m) => s + m.totalSavings, 0);
  const totalActual = Object.values(actualByMonth).reduce((s, v) => s + v, 0);
  const avgMonthly = history.length > 0 ? Math.round(totalPlanned / history.length) : 0;
  const bestMonth = history.length > 0
    ? history.reduce((best, m) => m.totalSavings > best.totalSavings ? m : best, history[0])
    : null;

  const regDate = profile.registrationDate
    ? new Date(profile.registrationDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : null;

  const hasActual = totalActual > 0;
  const cm = currentMonth();

  const chartData = history.map(snap => ({
    name: formatMonth(snap.month),
    'Prog. fixes': snap.programmedSavings || 0,
    'Env. épargne': snap.savingEnvelopes || 0,
    'Reste': snap.remainder || 0,
  }));

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Historique</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {regDate ? `Depuis ${regDate}` : 'Épargne mensuelle cumulée'}
        </p>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium">Aucun historique pour l'instant</p>
          <p className="text-sm mt-1">Les données s'accumulent mois après mois</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={PiggyBank}
              label="Épargne planifiée"
              value={fmt(totalPlanned)}
              sub={`sur ${history.length} mois`}
            />
            {hasActual ? (
              <StatCard
                icon={ArrowUpRight}
                label="Réellement viré"
                value={fmt(totalActual)}
                sub="env. épargne"
                color="text-emerald-600"
              />
            ) : (
              <StatCard
                icon={TrendingUp}
                label="Moyenne / mois"
                value={fmt(avgMonthly)}
                color="text-primary"
              />
            )}
            <StatCard
              icon={Calendar}
              label="Mois enregistrés"
              value={history.length}
              sub="mois"
              color="text-slate-600"
            />
            <StatCard
              icon={Award}
              label="Meilleur mois"
              value={bestMonth ? fmt(bestMonth.totalSavings) : '—'}
              sub={bestMonth ? formatMonthLong(bestMonth.month) : ''}
              color="text-warn"
            />
          </div>

          {/* Bar chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <p className="text-sm font-semibold text-slate-700 mb-4">Épargne planifiée par mois</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="Prog. fixes" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Env. épargne" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Reste" stackId="a" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly breakdown list */}
          <div className="card overflow-y-auto max-h-[320px] lg:max-h-none">
            <p className="text-sm font-semibold text-slate-700 mb-3">Détail mensuel</p>
            <div className="space-y-0">
              {[...history].reverse().map((snap, i) => {
                const isCurrentMonth = snap.month === cm;
                const actualTransferred = actualByMonth[snap.month] || 0;
                return (
                  <div key={snap.month} className={`py-3 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-700 text-sm">{formatMonthLong(snap.month)}</p>
                        {isCurrentMonth && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">en cours</span>
                        )}
                      </div>
                      <p className="font-bold text-savings">{fmt(snap.totalSavings)}</p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                      <span>Salaire <strong className="text-slate-600">{fmt(snap.salary)}</strong></span>
                      <span>Fixes <strong className="text-slate-600">{fmt(snap.totalFixed)}</strong></span>
                      <span>Envelo. <strong className="text-slate-600">{fmt(snap.totalEnvelopes)}</strong></span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                      {(snap.programmedSavings || 0) > 0 && (
                        <span>
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-700 mr-1" />
                          Prog. <strong className="text-slate-600">{fmt(snap.programmedSavings)}</strong>
                        </span>
                      )}
                      {(snap.savingEnvelopes || 0) > 0 && (
                        <span>
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                          Env. ép. <strong className="text-slate-600">{fmt(snap.savingEnvelopes)}</strong>
                        </span>
                      )}
                      {(snap.remainder || 0) > 0 && (
                        <span>
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-200 mr-1" />
                          Reste <strong className="text-slate-600">{fmt(snap.remainder)}</strong>
                        </span>
                      )}
                    </div>
                    {actualTransferred > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                        <ArrowUpRight size={12} className="text-emerald-600" />
                        <span className="text-slate-500">Réellement viré :</span>
                        <span className="font-bold text-emerald-600">{fmt(actualTransferred)}</span>
                        {snap.totalSavings > 0 && (
                          <span className="text-slate-400">
                            ({Math.round((actualTransferred / snap.totalSavings) * 100)}% du planifié)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </div>{/* end grid */}
        </>
      )}
    </div>
  );
}
