import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useBudget } from '../context/BudgetContext';
import {
  fmt, totalFixedExSavings, totalProgrammedSavings,
  totalExpenseEnvelopes, totalSavingEnvelopesBudget,
  computedSavings, totalSavings, budgetHealth, HEALTH_CONFIG, donutData, weeklyAmount,
  realSpending, envelopeForecast, periodDaysFor,
} from '../utils/budget';
import { periodStart, monthKey, previousMonthKey, isLastDayOfMonth, daysInMonth } from '../utils/period';
import { TrendingUp, PiggyBank, ArrowUpRight, Wallet, Receipt, CalendarCheck, ChevronRight, CreditCard } from 'lucide-react';
import { cn } from '../lib/utils';

const MONTH_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Rappel de clôture : le dernier jour du mois, ou tant que le mois précédent n'est pas clôturé
function MonthCloseBanner({ savingsHistory, navigate }) {
  const now = new Date();
  const prev = previousMonthKey(now);
  const prevSnap = savingsHistory.find(s => s.month === prev);
  let month = null;
  if (isLastDayOfMonth(now) && !savingsHistory.find(s => s.month === monthKey(now))?.closedAt) month = monthKey(now);
  else if (prevSnap && !prevSnap.closedAt) month = prev;
  if (!month) return null;
  const label = MONTH_LONG[Number(month.slice(5)) - 1];

  return (
    <button
      onClick={() => navigate('history', { close: month })}
      className="w-full flex items-center gap-3 rounded-2xl border border-savings/30 bg-savings/5 p-4 text-left hover:bg-savings/10 transition-colors"
    >
      <CalendarCheck size={20} className="text-savings flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-700">
          {month === monthKey(now) ? `Dernier jour de ${label} 🐷` : `Clôture ${label}`}
        </p>
        <p className="text-xs text-slate-500">Enregistre ton épargne réelle et ce qu'il reste sur le compte</p>
      </div>
      <ChevronRight size={16} className="text-slate-400" />
    </button>
  );
}

// Dépenses réelles du mois, en temps réel (enveloppes + carte non classée).
// Le mois est en cours : la prévision reste indicative, seul un dépassement réel est signalé en rouge.
function LiveMonthCard({ state, navigate }) {
  const { transactions, envelopes, bankTransactions } = state;
  const now = new Date();
  const since = periodStart('monthly');
  const live = realSpending({ transactions, envelopes, bankTransactions, since });
  const budget = totalExpenseEnvelopes(envelopes);
  const forecast = envelopeForecast({ budget, spent: live.total, since, periodDays: periodDaysFor('monthly') });
  const pct = budget > 0 ? Math.min(100, (live.total / budget) * 100) : 0;
  const dayPct = (now.getDate() / daysInMonth(now)) * 100;

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Dépensé ce mois-ci</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{fmt(live.total)}</p>
          <p className="text-xs text-slate-400">sur {fmt(budget)} d'enveloppes</p>
        </div>
        <div className="text-right">
          <p className={cn('text-lg font-bold', forecast.remaining < 0 ? 'text-danger' : 'text-savings')}>{fmt(forecast.remaining)}</p>
          <p className="text-xs text-slate-400">restant · {forecast.daysLeft} j</p>
        </div>
      </div>
      <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', forecast.status === 'over' ? 'bg-danger' : 'bg-primary')} style={{ width: `${pct}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60" style={{ left: `${dayPct}%` }} title="Aujourd'hui" />
      </div>
      <p className={cn('text-xs mt-2', forecast.status === 'over' ? 'text-danger' : forecast.status === 'pace' ? 'text-warn' : 'text-slate-500')}>
        {forecast.status === 'over'
          ? `Enveloppes dépassées de ${fmt(-forecast.remaining)}`
          : forecast.status === 'pace'
            ? `Rythme un peu soutenu (≈ ${fmt(forecast.projected)} en fin de mois) — le mois est en cours, rien d'alarmant`
            : forecast.projected != null
              ? `Tranquille 😌 · ≈ ${fmt(forecast.perDayLeft)} / jour jusqu'à la fin du mois`
              : 'Début de mois : trop tôt pour une prévision 😌'}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
        <span>💳 Carte <strong className="text-slate-700">{fmt(live.cardClassified + live.unclassified)}</strong></span>
        <span>💶 Espèces <strong className="text-slate-700">{fmt(live.cash)}</strong></span>
        {live.unclassified > 0 && (
          <button onClick={() => navigate('bank')} className="text-warn font-medium flex items-center gap-1">
            <CreditCard size={12} /> {fmt(live.unclassified)} à classer →
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = 'text-slate-800', bg = 'bg-white', icon: Icon, pct }) {
  return (
    <div className={cn('rounded-2xl border border-slate-100 p-5 shadow-sm', bg)}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        {Icon && <Icon size={16} className="text-slate-300" />}
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
        {pct !== undefined && (
          <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded-full', color === 'text-savings' ? 'bg-savings/10 text-savings' : 'bg-slate-100 text-slate-500')}>
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ navigate }) {
  const { state, dispatch } = useBudget();
  const { profile, fixedCharges, envelopes, settings } = state;
  const { netSalary } = profile;
  const viewMode = settings.viewMode;

  const fixed = totalFixedExSavings(fixedCharges);
  const programmedSav = totalProgrammedSavings(fixedCharges);
  const variable = totalExpenseEnvelopes(envelopes);
  const savingEnv = totalSavingEnvelopesBudget(envelopes);
  const remainder = computedSavings(netSalary, fixedCharges, envelopes);
  const totalSav = totalSavings(netSalary, fixedCharges, envelopes);
  const health = budgetHealth(netSalary, fixedCharges, envelopes);
  const hConfig = HEALTH_CONFIG[health];
  const pieData = donutData(netSalary, fixedCharges, envelopes);
  const savRate = netSalary > 0 ? Math.round((totalSav / netSalary) * 100) : 0;

  const now = new Date();
  const monthLabel = `${MONTH_LONG[now.getMonth()]} ${now.getFullYear()}`;

  const display = v => viewMode === 'weekly' ? weeklyAmount(v) : v;
  const periodLabel = viewMode === 'weekly' ? '/ semaine' : '/ mois';

  return (
    <div className="pt-6 pb-4 space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400 font-medium">Bonjour {profile.firstName} 👋</p>
          <h1 className="text-2xl font-bold text-slate-800 mt-0.5">Mon budget</h1>
          <p className="text-sm text-slate-400 capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {['monthly', 'weekly'].map(mode => (
              <button
                key={mode}
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: mode })}
                className={cn(
                  'py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors',
                  viewMode === mode ? 'bg-white text-primary shadow-sm' : 'text-slate-500'
                )}
              >
                {mode === 'monthly' ? 'Mensuel' : 'Hebdo'}
              </button>
            ))}
          </div>
          <span className={`badge ${hConfig.bg} ${hConfig.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${hConfig.dot}`} />
            {hConfig.label}
          </span>
        </div>
      </div>

      <MonthCloseBanner savingsHistory={state.savingsHistory} navigate={navigate} />

      {/* Desktop: 2 colonnes / Mobile: 1 colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

        {/* Colonne gauche */}
        <div className="lg:col-span-2 space-y-4">
          <LiveMonthCard state={state} navigate={navigate} />

          {/* Hero card salaire */}
          <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-primary-light/80 text-xs font-medium uppercase tracking-wide">Salaire net</p>
                <p className="text-4xl font-bold mt-1">{fmt(display(netSalary))}</p>
                <p className="text-primary-light/70 text-xs mt-1">{periodLabel}</p>
              </div>
              <div className="bg-white/10 rounded-2xl p-3">
                <TrendingUp size={24} className="text-white" />
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-sm text-primary-light/90">Taux d'épargne</span>
              <span className="text-lg font-bold">{savRate}%</span>
            </div>
          </div>

          {/* 4 stat cards */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Charges fixes"
              value={fmt(display(fixed))}
              sub={netSalary > 0 ? `${Math.round((fixed / netSalary) * 100)}% du salaire` : '—'}
              icon={Receipt}
              color="text-fixed"
            />
            <StatCard
              label="Enveloppes"
              value={fmt(display(variable))}
              sub={netSalary > 0 ? `${Math.round((variable / netSalary) * 100)}% du salaire` : '—'}
              icon={Wallet}
              color="text-primary"
            />
            <StatCard
              label="Épargne programmée"
              value={fmt(display(programmedSav))}
              sub="virements automatiques"
              icon={ArrowUpRight}
              color="text-savings"
            />
            <StatCard
              label="Épargne totale"
              value={fmt(display(totalSav))}
              pct={savRate}
              icon={PiggyBank}
              color="text-savings"
            />
          </div>

          {/* Épargne breakdown */}
          <div className={cn('rounded-2xl border p-5 shadow-sm', remainder < 0 ? 'border-danger/30 bg-danger/5' : 'border-savings/20 bg-savings/5')}>
            <div className="flex items-center gap-2 mb-4">
              <PiggyBank size={16} className="text-savings" />
              <p className="text-sm font-semibold text-slate-700">Détail épargne</p>
              <span className={cn('ml-auto text-lg font-bold', remainder < 0 && programmedSav === 0 ? 'text-danger' : 'text-savings')}>
                {fmt(display(totalSav))}
              </span>
            </div>
            <div className="space-y-2.5">
              {programmedSav > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-savings inline-block" />
                    Virements programmés
                  </span>
                  <span className="font-semibold text-slate-700">{fmt(display(programmedSav))}</span>
                </div>
              )}
              {savingEnv > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    Enveloppes épargne
                  </span>
                  <span className="font-semibold text-slate-700">{fmt(display(savingEnv))}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-200 inline-block" />
                  Reste du mois
                </span>
                <span className={cn('font-semibold', remainder < 0 ? 'text-danger' : 'text-slate-700')}>
                  {fmt(display(Math.max(0, remainder)))}
                </span>
              </div>
              {remainder < 0 && (
                <div className="mt-2 p-3 bg-danger/10 rounded-xl text-xs text-danger font-medium">
                  ⚠️ Budget prévisionnel en déficit de {fmt(Math.abs(remainder))}/mois — ajuste tes virements ou enveloppes
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite */}
        <div className="space-y-4">
          {/* Donut chart */}
          {pieData.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Répartition</p>
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [fmt(value), '']}
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-full space-y-1.5 mt-2">
                  {pieData.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                        <span className="text-xs text-slate-600 truncate">{item.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-700 flex-shrink-0">{fmt(display(item.value))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Budget idéal 50/20/30 */}
          {netSalary > 0 && (() => {
            const afterFixed = netSalary - fixed - programmedSav;
            if (afterFixed <= 0) return null;
            const actualNeeds = envelopes.filter(e => e.type === 'need').reduce((s, e) => s + (Number(e.budgetMonthly) || 0), 0);
            const actualWants = envelopes.filter(e => e.type === 'want').reduce((s, e) => s + (Number(e.budgetMonthly) || 0), 0);
            const actualSavAlloc = savingEnv + Math.max(0, remainder);
            const rows = [
              { label: 'Besoins', pct: 0.5, actual: actualNeeds, color: '#3b82f6', type: 'need', icon: '🧾', tip: '50%' },
              { label: 'Épargne', pct: 0.2, actual: actualSavAlloc, color: '#10b981', type: 'saving', icon: '🏦', tip: '20%' },
              { label: 'Plaisirs', pct: 0.3, actual: actualWants, color: '#8b5cf6', type: 'want', icon: '🎉', tip: '30%' },
            ];
            return (
              <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-700">Budget idéal</p>
                  <p className="text-xs text-slate-400 mt-0.5">Base : {fmt(display(afterFixed))}</p>
                </div>
                <div className="space-y-4">
                  {rows.map(({ label, pct, actual, color, type, icon, tip }) => {
                    const ideal = afterFixed * pct;
                    const diff = actual - ideal;
                    const over = diff > 0;
                    const isSaving = type === 'saving';
                    const barPct = Math.min(100, ideal > 0 ? (actual / ideal) * 100 : 0);
                    const topEnv = envelopes
                      .filter(e => e.type === type && type !== 'saving')
                      .sort((a, b) => b.budgetMonthly - a.budgetMonthly)
                      .slice(0, 2);
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-slate-700">{icon} {label}</span>
                          <span className="text-slate-400 font-medium">{tip}</span>
                        </div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className={cn('font-bold', over && !isSaving ? 'text-warn' : isSaving && over ? 'text-savings' : 'text-slate-600')}>
                            {fmt(display(actual))}
                          </span>
                          <span className="text-slate-400">
                            idéal {fmt(display(ideal))}
                            {' '}
                            <span className={cn('font-semibold', over && !isSaving ? 'text-warn' : isSaving && over ? 'text-savings' : 'text-slate-400')}>
                              ({over ? '+' : ''}{fmt(display(diff))})
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${barPct}%`, background: over && !isSaving ? '#f59e0b' : color }}
                          />
                        </div>
                        {over && !isSaving && topEnv.length > 0 && (
                          <p className="text-[10px] text-warn mt-1">
                            ↳ {topEnv.map(e => `${e.name} (${fmt(e.budgetMonthly)})`).join(', ')}
                          </p>
                        )}
                        {!over && isSaving && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            ↳ encore {fmt(display(Math.abs(diff)))} à allouer
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
