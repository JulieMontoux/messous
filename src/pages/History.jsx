import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PiggyBank, TrendingUp, Award, ArrowUpRight, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { fmt, realSavings } from '../utils/budget';
import { api } from '../api/client';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';

function CloseMonthModal({ snap, onSave, onClose }) {
  const planned = (snap.programmedSavings || 0) + (snap.savingEnvelopes || 0);
  const [form, setForm] = useState({
    actualSavings: snap.actualSavings ?? planned,
    actualRemainder: snap.actualRemainder ?? Math.max(0, snap.remainder || 0),
    remainderToGoalId: snap.remainderToGoalId || '',
  });
  const [goals, setGoals] = useState([]);

  useEffect(() => { api.get('/api/goals').then(setGoals).catch(() => {}); }, []);

  const total = (Number(form.actualSavings) || 0) + (form.remainderToGoalId ? Number(form.actualRemainder) || 0 : 0);

  return (
    <Modal
      title={`Clôturer ${formatMonthLong(snap.month)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button
            className="btn-primary"
            onClick={() => onSave({
              month: snap.month,
              actualSavings: Number(form.actualSavings) || 0,
              actualRemainder: Number(form.actualRemainder) || 0,
              remainderToGoalId: form.remainderToGoalId || null,
            })}
          >Enregistrer</button>
        </>
      }
    >
      <p className="text-xs text-slate-500">
        Note ce qui s'est <strong>réellement</strong> passé ce mois-ci : l'historique comparera au prévu.
      </p>
      <div>
        <label className="label">Épargne réellement versée</label>
        <input className="input text-lg font-semibold" type="number" min="0" value={form.actualSavings}
          onChange={e => setForm(f => ({ ...f, actualSavings: e.target.value }))} />
        <p className="text-xs text-slate-400 mt-1">Prévu : {fmt(planned)} (virements programmés + enveloppes épargne)</p>
      </div>
      <div>
        <label className="label">Reste en fin de mois</label>
        <input className="input text-lg font-semibold" type="number" value={form.actualRemainder}
          onChange={e => setForm(f => ({ ...f, actualRemainder: e.target.value }))} />
        <p className="text-xs text-slate-400 mt-1">Ce qu'il reste réellement sur le compte · prévu : {fmt(Math.max(0, snap.remainder || 0))}</p>
      </div>
      {goals.length > 0 && Number(form.actualRemainder) > 0 && (
        <div>
          <label className="label">Que faire du reste ?</label>
          <select className="input" value={form.remainderToGoalId} onChange={e => setForm(f => ({ ...f, remainderToGoalId: e.target.value }))}>
            <option value="">Le garder sur le compte</option>
            {goals.map(g => <option key={g.id} value={g.id}>Le verser sur {g.icon} {g.name}</option>)}
          </select>
        </div>
      )}
      <div className="bg-savings/5 rounded-xl p-3 flex justify-between items-center">
        <span className="text-sm text-slate-600">Épargne réelle du mois</span>
        <span className="text-xl font-bold text-savings">{fmt(total)}</span>
      </div>
    </Modal>
  );
}

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

export default function History({ params = {} }) {
  const { state, dispatch } = useBudget();
  const { savingsHistory, profile, transactions, envelopes } = state;
  const [closing, setClosing] = useState(() => params.close || null);

  const savingEnvIds = new Set(envelopes.filter(e => e.type === 'saving').map(e => e.id));

  // Actual transferred per month from saving envelope transactions
  const actualByMonth = {};
  transactions.forEach(t => {
    if (!savingEnvIds.has(t.envelopeId)) return;
    const month = t.date.slice(0, 7);
    actualByMonth[month] = (actualByMonth[month] || 0) + Number(t.amount || 0);
  });

  const cm = currentMonth();
  const history = savingsHistory.filter(s => s.totalSavings > 0 || s.programmedSavings > 0 || s.savingEnvelopes > 0 || s.closedAt);

  // Le mois en cours n'est pas terminé : il n'entre ni dans la moyenne ni dans le « meilleur mois »
  const finished = history.filter(s => s.month < cm);
  const closed = history.filter(s => s.closedAt);
  // Pour un mois clôturé on retient le réel, sinon le prévu
  const valueOf = s => realSavings(s) ?? s.totalSavings;
  const totalPlanned = history.reduce((s, m) => s + m.totalSavings, 0);
  const totalReal = closed.reduce((s, m) => s + realSavings(m), 0);
  const avgMonthly = finished.length > 0 ? Math.round(finished.reduce((s, m) => s + valueOf(m), 0) / finished.length) : 0;
  const bestMonth = finished.length > 0
    ? finished.reduce((best, m) => valueOf(m) > valueOf(best) ? m : best, finished[0])
    : null;
  const closingSnap = closing ? (savingsHistory.find(s => s.month === closing) || { month: closing }) : null;

  const regDate = profile.registrationDate
    ? new Date(profile.registrationDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : null;

  const chartData = history.map(snap => ({
    name: formatMonth(snap.month),
    'Prog. fixes': snap.programmedSavings || 0,
    'Env. épargne': snap.savingEnvelopes || 0,
    'Reste': snap.remainder || 0,
    'Réel': realSavings(snap) ?? 0,
  }));
  const currentSnap = history.find(s => s.month === cm);

  return (
    <div className="pt-6 pb-4 space-y-4">
      <PageHeader title="Historique" subtitle={regDate ? `Depuis ${regDate}` : 'Épargne mensuelle cumulée'}>
        <button onClick={() => setClosing(cm)} className="btn-secondary flex items-center gap-1.5 py-2 text-sm">
          <ClipboardCheck size={15} /> {currentSnap?.closedAt ? 'Modifier la clôture' : 'Clôturer le mois'}
        </button>
      </PageHeader>

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
            <StatCard
              icon={ArrowUpRight}
              label="Réellement épargné"
              value={closed.length ? fmt(totalReal) : '—'}
              sub={closed.length ? `${closed.length} mois clôturé${closed.length > 1 ? 's' : ''}` : 'clôture tes mois'}
              color="text-emerald-600"
            />
            <StatCard
              icon={TrendingUp}
              label="Moyenne / mois"
              value={finished.length ? fmt(avgMonthly) : '—'}
              sub={finished.length ? 'mois terminés' : 'dès le mois prochain'}
              color="text-primary"
            />
            <StatCard
              icon={Award}
              label="Meilleur mois"
              value={bestMonth ? fmt(valueOf(bestMonth)) : '—'}
              sub={bestMonth ? formatMonthLong(bestMonth.month) : ''}
              color="text-warn"
            />
          </div>

          {/* Bar chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <p className="text-sm font-semibold text-slate-700 mb-4">Épargne prévue vs réelle</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="Prog. fixes" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Env. épargne" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Reste" stackId="a" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
                {closed.length > 0 && <Bar dataKey="Réel" fill="#6366f1" radius={[4, 4, 0, 0]} />}
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
                const real = realSavings(snap);
                return (
                  <div key={snap.month} className={`py-3 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-700 text-sm">{formatMonthLong(snap.month)}</p>
                        {isCurrentMonth && !snap.closedAt && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">en cours · prévisionnel</span>
                        )}
                        {snap.closedAt && (
                          <span className="text-[10px] bg-savings/10 text-savings px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><CheckCircle2 size={10} /> clôturé</span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-savings">{fmt(real ?? snap.totalSavings)}</p>
                        {real != null && <p className="text-[10px] text-slate-400">prévu {fmt(snap.totalSavings)}</p>}
                      </div>
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
                    {snap.closedAt && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span>Versé <strong className="text-slate-700">{fmt(snap.actualSavings || 0)}</strong></span>
                        <span>Reste réel <strong className="text-slate-700">{fmt(snap.actualRemainder || 0)}</strong>
                          {snap.remainderToGoalId ? ' → objectif' : ''}</span>
                      </div>
                    )}
                    {!snap.closedAt && snap.month <= cm && (
                      <button onClick={() => setClosing(snap.month)} className="mt-1.5 text-xs font-medium text-primary hover:text-primary-dark">
                        Enregistrer l'épargne réelle et le reste →
                      </button>
                    )}
                    {snap.closedAt && (
                      <button onClick={() => setClosing(snap.month)} className="mt-1 text-[11px] text-slate-400 hover:text-primary">Modifier</button>
                    )}
                    {actualTransferred > 0 && !snap.closedAt && (
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

      {closingSnap && (
        <CloseMonthModal
          snap={closingSnap}
          onClose={() => setClosing(null)}
          onSave={payload => { dispatch({ type: 'CLOSE_MONTH', payload }); setClosing(null); }}
        />
      )}
    </div>
  );
}
