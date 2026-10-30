import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Banknote, RefreshCw, CreditCard, Coins } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { ENVELOPE_CATEGORIES, COLOR_MAP, generateId } from '../data/defaults';
import {
  fmt, fmtDec, spentInPeriod, weeklyAmount, totalFixedExSavings, totalProgrammedSavings,
  transactionsInPeriod, envelopeForecast, periodDaysFor,
} from '../utils/budget';
import { periodStart, periodEnd, lastWithdrawal, toLocalDate, monthKey, formatDay } from '../utils/period';
import { computeWithdrawal } from '../utils/withdrawal';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';

function withdrawnSince(withdrawals, since) {
  const today = toLocalDate();
  return withdrawals.filter(w => w.date >= since && w.date <= today).reduce((s, w) => s + w.amount, 0);
}

function PeriodNote({ mode, since, until, anchor }) {
  if (mode !== 'weekly') return null;
  return (
    <p className="text-xs text-slate-400">
      Semaine du {formatDay(since)} au {formatDay(until)}
      {anchor ? ` · calée sur ton retrait du ${formatDay(anchor.date)}` : ' · enregistre un retrait pour caler la semaine sur ce jour'}
    </p>
  );
}

function WithdrawalModal({ envelopes, transactions, withdrawals, viewMode, idealNeeds, idealWants, idealSavings, tobaccoEnv, onSave, onClose }) {
  const [mode, setMode] = useState(viewMode);
  const [calcMode, setCalcMode] = useState('ideal');
  const [record, setRecord] = useState({ date: toLocalDate(), amount: '', note: '' });
  const roundUp5 = v => Math.ceil(v / 5) * 5;
  const periodLabel = mode === 'weekly' ? '/ semaine' : '/ mois';
  const isIdeal = calcMode === 'ideal';

  const since = periodStart(mode, { withdrawals });
  const until = periodEnd(mode, { withdrawals });
  const anchor = mode === 'weekly' ? lastWithdrawal(withdrawals) : null;
  const withdrawn = withdrawnSince(withdrawals, since);

  const { envelopes: envResult, ideal: idealResult, cashSpent, cashInHand } = computeWithdrawal({
    envelopes, transactions, mode, idealNeeds, idealWants, idealSavings, withdrawn, since,
  });

  const { needs: needsData, wants: wantData, savings: savingData, tobacco } = envResult;
  const { budget: tobaccoBudget, spent: tobaccoSpent, toWithdraw: tobaccoToWithdraw } = tobacco;

  const wantSpent = wantData.reduce((s, e) => s + e.spent, 0);
  const savingSpent = savingData.reduce((s, e) => s + e.spent, 0);

  const pleasuresIdealBudget = idealResult.wantsBudget;
  const pleasuresIdealToWithdraw = idealResult.wantsToWithdraw;
  const savingsIdealBudget = idealResult.savingsBudget;
  const savingsIdealToWithdraw = idealResult.savingsToWithdraw;

  // Besoins always shown as individual envelopes; wants/savings switch on calcMode
  const needsTotal = envResult.needsTotal;
  const pleasuresTotal = isIdeal ? pleasuresIdealToWithdraw : envResult.wantsTotal;
  const savingsTotal = isIdeal ? savingsIdealToWithdraw : envResult.savingsTotal;
  const grandTotal = roundUp5(Math.max(0, needsTotal + tobaccoToWithdraw + pleasuresTotal + savingsTotal - cashInHand));

  const hasAnySpending = [...needsData, ...wantData, ...savingData].some(e => e.spent > 0) || tobaccoSpent > 0;
  const recordAmount = record.amount === '' ? grandTotal : Number(record.amount);

  function save() {
    if (!(recordAmount > 0) || !record.date) return;
    onSave({ id: generateId(), date: record.date, amount: recordAmount, suggestedAmount: grandTotal, mode, note: record.note });
  }

  return (
    <Modal
      title="💶 Retrait espèces"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Fermer</button>
          <button className="btn-primary flex-1" onClick={save} disabled={!(recordAmount > 0)}>
            J'ai retiré {fmt(recordAmount || 0)}
          </button>
        </>
      }
    >
      {/* Période */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 mb-2">
        {[{ id: 'monthly', label: 'Mensuel' }, { id: 'weekly', label: 'Hebdomadaire' }].map(f => (
          <button key={f.id} onClick={() => setMode(f.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === f.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {/* Mode calcul */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 mb-3">
        {[{ id: 'ideal', label: '🎯 Budget idéal' }, { id: 'envelopes', label: '👛 Mes enveloppes' }].map(f => (
          <button key={f.id} onClick={() => setCalcMode(f.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${calcMode === f.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <PeriodNote mode={mode} since={since} until={until} anchor={anchor} />

      {hasAnySpending && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50 rounded-lg px-3 py-2 mb-3">
          <span>✅</span>
          <span>Dépenses enregistrées (carte et espèces) déduites automatiquement</span>
        </div>
      )}

      {withdrawn > 0 && (
        <div className="text-xs bg-savings/5 border border-savings/20 rounded-lg px-3 py-2 mb-3 space-y-0.5">
          <div className="flex justify-between"><span className="text-slate-500">Déjà retiré sur la période</span><strong className="text-slate-700">{fmt(withdrawn)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Dépensé en espèces depuis</span><strong className="text-slate-700">−{fmt(cashSpent)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Encore en poche (déduit)</span><strong className="text-savings">{fmt(cashInHand)}</strong></div>
        </div>
      )}

      {/* Besoins — toujours lignes individuelles */}
      {needsData.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">🧾 Besoins</p>
          {needsData.map(e => (
            <div key={e.id} className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-sm text-slate-600">{e.icon} {e.name}</span>
                {e.spent > 0 && (
                  <span className="text-xs text-slate-400 ml-1.5">
                    ({fmt(e.spent)} dépensé)
                  </span>
                )}
              </div>
              <span className={`font-semibold ${e.toWithdraw === 0 ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                {fmt(e.toWithdraw === 0 ? e.budget : e.toWithdraw)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
            <span className="text-xs font-semibold text-slate-500">Sous-total</span>
            <span className="font-bold text-needs">{fmt(needsTotal)}</span>
          </div>
        </div>
      )}

      {/* Tabac */}
      {tobaccoBudget > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">🚬 Tabac</p>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-slate-600">{tobaccoEnv.name}</span>
              {tobaccoSpent > 0 && (
                <span className="text-xs text-slate-400 ml-1.5">({fmt(tobaccoSpent)} dépensé)</span>
              )}
            </div>
            <span className={`font-bold ${tobaccoToWithdraw === 0 ? 'text-slate-300 line-through' : 'text-warn'}`}>
              {fmt(tobaccoToWithdraw === 0 ? tobaccoBudget : tobaccoToWithdraw)}
            </span>
          </div>
        </div>
      )}

      {/* Plaisirs */}
      {(isIdeal ? true : wantData.length > 0) && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            🎉 Plaisirs {isIdeal && <span className="normal-case font-normal">(idéal 30% − tabac)</span>}
          </p>
          {isIdeal ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-slate-600">Total plaisirs</span>
                {wantSpent > 0 && (
                  <span className="text-xs text-slate-400 ml-1.5">({fmt(wantSpent)} dépensé)</span>
                )}
              </div>
              <span className={`font-bold ${pleasuresIdealToWithdraw === 0 ? 'text-slate-300 line-through' : 'text-wants'}`}>
                {fmt(pleasuresIdealToWithdraw === 0 ? pleasuresIdealBudget : pleasuresIdealToWithdraw)}
              </span>
            </div>
          ) : (
            <>
              {wantData.map(e => (
                <div key={e.id} className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-sm text-slate-600">{e.icon} {e.name}</span>
                    {e.spent > 0 && (
                      <span className="text-xs text-slate-400 ml-1.5">({fmt(e.spent)} dépensé)</span>
                    )}
                  </div>
                  <span className={`font-semibold ${e.toWithdraw === 0 ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                    {fmt(e.toWithdraw === 0 ? e.budget : e.toWithdraw)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
                <span className="text-xs font-semibold text-slate-500">Sous-total</span>
                <span className="font-bold text-wants">{fmt(pleasuresTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Épargne */}
      {(isIdeal ? savingsIdealBudget > 0 : savingData.length > 0) && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            🏦 Épargne {isIdeal && <span className="normal-case font-normal">(20% du disponible)</span>}
          </p>
          {isIdeal ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-slate-600">Total épargne</span>
                {savingSpent > 0 && (
                  <span className="text-xs text-slate-400 ml-1.5">({fmt(savingSpent)} dépensé)</span>
                )}
              </div>
              <span className={`font-bold ${savingsIdealToWithdraw === 0 ? 'text-slate-300 line-through' : 'text-savings'}`}>
                {fmt(savingsIdealToWithdraw === 0 ? savingsIdealBudget : savingsIdealToWithdraw)}
              </span>
            </div>
          ) : (
            <>
              {savingData.map(e => (
                <div key={e.id} className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-sm text-slate-600">{e.icon} {e.name}</span>
                    {e.spent > 0 && (
                      <span className="text-xs text-slate-400 ml-1.5">({fmt(e.spent)} dépensé)</span>
                    )}
                  </div>
                  <span className={`font-semibold ${e.toWithdraw === 0 ? 'text-slate-300 line-through' : 'text-savings'}`}>
                    {fmt(e.toWithdraw === 0 ? e.budget : e.toWithdraw)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
                <span className="text-xs font-semibold text-slate-500">Sous-total</span>
                <span className="font-bold text-savings">{fmt(savingsTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Total */}
      <div className="bg-primary/5 rounded-xl p-4 mt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total à retirer</p>
            <p className="text-xs text-slate-400 mt-0.5">{periodLabel}</p>
          </div>
          <p className="text-3xl font-bold text-primary">{fmt(grandTotal)}</p>
        </div>
      </div>

      {/* Enregistrement du retrait réel */}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Enregistrer le retrait</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={record.date} onChange={e => setRecord(r => ({ ...r, date: e.target.value }))} />
          </div>
          <div>
            <label className="label">Montant retiré</label>
            <input
              className="input font-semibold"
              type="number"
              min="0"
              step="5"
              placeholder={String(grandTotal)}
              value={record.amount}
              onChange={e => setRecord(r => ({ ...r, amount: e.target.value }))}
            />
          </div>
        </div>
        {record.amount !== '' && Number(record.amount) !== grandTotal && (
          <p className="text-xs text-slate-500">
            Écart avec le conseillé : <strong className={Number(record.amount) > grandTotal ? 'text-warn' : 'text-savings'}>
              {Number(record.amount) > grandTotal ? '+' : ''}{fmt(Number(record.amount) - grandTotal)}
            </strong>
          </p>
        )}
        <p className="text-xs text-slate-400">
          La semaine budgétaire repartira de cette date, et ce montant sera déduit des prochains calculs.
        </p>
      </div>
    </Modal>
  );
}

const BLANK_ENV = { name: '', categoryId: 'groceries', icon: '🛒', colorKey: 'needs', type: 'need', budgetMonthly: '' };
const blankTx = () => ({ amount: '', note: '', date: toLocalDate(), paymentMethod: 'cash', recurring: false, dayOfMonth: new Date().getDate() });

function EnvelopeCard({ env, transactions, viewMode, since, onEdit, onDelete, onAddTx, onDeleteTx }) {
  const [open, setOpen] = useState(false);
  const colors = COLOR_MAP[env.colorKey] || COLOR_MAP.needs;
  const isSaving = env.type === 'saving';
  const budget = viewMode === 'weekly' ? weeklyAmount(env.budgetMonthly) : env.budgetMonthly;
  const spent = spentInPeriod(transactions, env.id, viewMode, { since });
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const remaining = budget - spent;
  const forecast = envelopeForecast({ budget, spent, since, periodDays: periodDaysFor(viewMode) });
  const over = !isSaving && forecast.status === 'over';
  const periodTxs = transactionsInPeriod(transactions, env.id, since);

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: colors.bg }}>
          {env.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-800 truncate">{env.name}</p>
            <div className="text-right flex-shrink-0">
              <span className="text-sm font-bold" style={{ color: over ? '#f43f5e' : colors.ring }}>
                {fmt(isSaving ? Math.max(0, remaining) : remaining)}
              </span>
              <span className="text-xs text-slate-400">{isSaving ? ' à verser' : ' restant'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-400">{fmt(spent)} {isSaving ? 'versés' : ''} / {fmt(budget)}</span>
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ background: colors.bg, color: colors.text }}>
              {isSaving ? 'Épargne' : env.type === 'need' ? 'Besoin' : 'Envie'}
            </span>
          </div>
        </div>
        <button
          onClick={onAddTx}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0 transition-colors"
          style={{ background: colors.ring }}
          title={isSaving ? 'Ajouter un versement' : 'Ajouter une dépense'}
        >
          +
        </button>
      </div>

      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: over ? '#f43f5e' : colors.ring }} />
      </div>

      {/* Prévision — le mois/la semaine est en cours : on reste zen tant que le budget n'est pas réellement dépassé */}
      {!isSaving && budget > 0 && (
        <p className={cn('text-[11px]', forecast.status === 'over' ? 'text-danger' : forecast.status === 'pace' ? 'text-warn' : 'text-slate-400')}>
          {forecast.status === 'over'
            ? `Dépassé de ${fmt(-remaining)}`
            : forecast.status === 'pace'
              ? `À ce rythme ≈ ${fmt(forecast.projected)} en fin de période — pas de panique, c'est en cours`
              : forecast.daysLeft > 0
                ? `≈ ${fmt(forecast.perDayLeft)} / jour pendant ${forecast.daysLeft} j`
                : 'Dernier jour de la période'}
        </p>
      )}

      <div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 hover:text-slate-600 transition-colors flex-1 text-left">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {periodTxs.length} {isSaving ? 'versement' : 'dépense'}{periodTxs.length !== 1 ? 's' : ''}
          </button>
          <span className="flex gap-2 ml-auto">
            <button onClick={onEdit} className="p-1 hover:text-primary transition-colors" title="Modifier"><Pencil size={13} /></button>
            <button onClick={onDelete} className="p-1 hover:text-danger transition-colors" title="Supprimer"><Trash2 size={13} /></button>
          </span>
        </div>
        {open && periodTxs.length > 0 && (
          <div className="mt-2 space-y-1">
            {periodTxs.map(tx => (
              <div key={tx.id} className="group flex items-center justify-between gap-2 text-sm py-1 border-t border-slate-50">
                <div className="flex items-center gap-1.5 min-w-0">
                  {tx.paymentMethod === 'card'
                    ? <CreditCard size={12} className="text-slate-400 flex-shrink-0" />
                    : <Coins size={12} className="text-slate-400 flex-shrink-0" />}
                  <span className="text-slate-600 truncate">{tx.note || '—'}</span>
                  <span className="text-slate-400 text-xs flex-shrink-0">{formatDay(tx.date)}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="font-semibold text-slate-800">-{fmtDec(tx.amount)}</span>
                  <button onClick={() => onDeleteTx(tx.id)} className="p-1 text-slate-300 hover:text-danger" title="Supprimer">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WithdrawalsCard({ withdrawals, onDelete }) {
  const month = monthKey();
  const thisMonth = withdrawals.filter(w => w.date.startsWith(month));
  const total = thisMonth.reduce((s, w) => s + w.amount, 0);
  const suggested = thisMonth.reduce((s, w) => s + (w.suggestedAmount ?? w.amount), 0);
  const diff = total - suggested;
  if (withdrawals.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Banknote size={16} className="text-savings" /> Retraits réels</p>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-800">{fmt(total)}</p>
          <p className="text-[11px] text-slate-400">ce mois · {thisMonth.length} retrait{thisMonth.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      {thisMonth.length > 0 && Math.abs(diff) >= 1 && (
        <p className="text-xs text-slate-500 mb-2">
          Écart avec les montants conseillés : <strong className={diff > 0 ? 'text-warn' : 'text-savings'}>{diff > 0 ? '+' : ''}{fmt(diff)}</strong>
        </p>
      )}
      <div className="divide-y divide-slate-50">
        {withdrawals.slice(0, 5).map(w => (
          <div key={w.id} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-slate-600">{formatDay(w.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span className="flex items-center gap-2">
              {w.suggestedAmount != null && w.suggestedAmount !== w.amount && (
                <span className="text-xs text-slate-400">conseillé {fmt(w.suggestedAmount)}</span>
              )}
              <strong className="text-slate-800">{fmt(w.amount)}</strong>
              <button onClick={() => onDelete(w.id)} className="p-1 text-slate-300 hover:text-danger" title="Supprimer"><Trash2 size={12} /></button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Envelopes() {
  const { state, dispatch } = useBudget();
  const { envelopes, transactions, settings, profile, fixedCharges, withdrawals } = state;
  const viewMode = settings.viewMode;
  const since = periodStart(viewMode, { withdrawals });
  const until = periodEnd(viewMode, { withdrawals });
  const anchor = viewMode === 'weekly' ? lastWithdrawal(withdrawals) : null;

  const afterFixed = Math.max(0, profile.netSalary - totalFixedExSavings(fixedCharges) - totalProgrammedSavings(fixedCharges));
  const idealNeeds = afterFixed * 0.5;
  const idealWants = afterFixed * 0.3;
  const idealSavings = afterFixed * 0.2;
  const tobaccoEnv = envelopes.find(e => e.categoryId === 'tobacco');

  const [envModal, setEnvModal] = useState(null);
  const [txModal, setTxModal] = useState(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [envForm, setEnvForm] = useState(BLANK_ENV);
  const [txForm, setTxForm] = useState(blankTx);

  function openAddEnv() {
    setEnvForm(BLANK_ENV);
    setEnvModal({ mode: 'add' });
  }

  function openEditEnv(env) {
    setEnvForm({ name: env.name, categoryId: env.categoryId, icon: env.icon, colorKey: env.colorKey, type: env.type, budgetMonthly: env.budgetMonthly });
    setEnvModal({ mode: 'edit', env });
  }

  function saveEnv() {
    if (!envForm.name || !envForm.budgetMonthly) return;
    if (envModal.mode === 'add') {
      const cat = ENVELOPE_CATEGORIES.find(c => c.id === envForm.categoryId);
      dispatch({
        type: 'ADD_ENVELOPE',
        payload: {
          id: generateId(),
          ...envForm,
          icon: cat?.icon || '📦',
          colorKey: cat?.colorKey || 'needs',
          type: cat?.type || 'need',
          budgetMonthly: Number(envForm.budgetMonthly),
        },
      });
    } else {
      dispatch({ type: 'UPDATE_ENVELOPE', payload: { ...envModal.env, ...envForm, budgetMonthly: Number(envForm.budgetMonthly) } });
    }
    setEnvModal(null);
  }

  function saveTx() {
    if (!txForm.amount || Number(txForm.amount) <= 0) return;
    dispatch({
      type: 'ADD_TRANSACTION',
      payload: {
        id: generateId(),
        envelopeId: txModal.env.id,
        amount: Number(txForm.amount),
        note: txForm.note,
        date: txForm.date,
        paymentMethod: txForm.paymentMethod,
      },
    });
    if (txForm.recurring) {
      api.post('/api/recurring', {
        envelopeId: txModal.env.id,
        amount: Number(txForm.amount),
        note: txForm.note,
        dayOfMonth: Number(txForm.dayOfMonth),
      }).catch(() => {});
    }
    setTxModal(null);
    setTxForm(blankTx());
  }

  const totalBudget = envelopes.reduce((s, e) => s + (viewMode === 'weekly' ? weeklyAmount(e.budgetMonthly) : e.budgetMonthly), 0);
  const totalSpent = envelopes.reduce((s, e) => s + spentInPeriod(transactions, e.id, viewMode, { since }), 0);

  return (
    <div className="pt-6 pb-4 space-y-4">
      <PageHeader title="Enveloppes" subtitle={viewMode === 'weekly' ? 'Semaine en cours' : 'Mois en cours'}>
        {envelopes.length > 0 && (
          <button onClick={() => setWithdrawalOpen(true)} className="btn-secondary flex items-center gap-1.5 py-2 text-sm">
            <Banknote size={16} /> Retrait
          </button>
        )}
        <button onClick={openAddEnv} className="btn-primary flex items-center gap-1.5 py-2 text-sm">
          <Plus size={16} /> Ajouter
        </button>
      </PageHeader>

      {/* View toggle */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {['monthly', 'weekly'].map(mode => (
          <button
            key={mode}
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: mode })}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              viewMode === mode ? 'bg-white text-primary shadow-sm' : 'text-slate-500'
            }`}
          >
            {mode === 'monthly' ? 'Mensuel' : 'Hebdomadaire'}
          </button>
        ))}
      </div>

      <PeriodNote mode={viewMode} since={since} until={until} anchor={anchor} />

      {/* Summary bar */}
      {envelopes.length > 0 && (
        <div className="card">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-500">Dépensé</span>
            <span className="font-bold text-slate-800">{fmt(totalSpent)} / {fmt(totalBudget)}</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalSpent > totalBudget ? 'bg-danger' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0)}%` }}
            />
          </div>
        </div>
      )}

      <WithdrawalsCard withdrawals={withdrawals} onDelete={id => dispatch({ type: 'DELETE_WITHDRAWAL', payload: id })} />

      {/* Envelopes */}
      {envelopes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">👛</p>
          <p className="font-medium">Aucune enveloppe</p>
          <p className="text-sm mt-1">Crée des enveloppes pour tes dépenses variables</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[
            { type: 'need', label: '🧾 Besoins' },
            { type: 'want', label: '🎉 Envies' },
            { type: 'saving', label: '🏦 Épargne' },
          ].map(({ type, label }) => {
            const group = envelopes.filter(e => e.type === type);
            if (group.length === 0) return null;
            return (
              <div key={type}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{label}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {group.map(env => (
                    <EnvelopeCard
                      key={env.id}
                      env={env}
                      transactions={transactions}
                      viewMode={viewMode}
                      since={since}
                      onEdit={() => openEditEnv(env)}
                      onDelete={() => {
                        if (window.confirm(`Supprimer l'enveloppe « ${env.name} » et ses dépenses ?`)) dispatch({ type: 'DELETE_ENVELOPE', payload: env.id });
                      }}
                      onAddTx={() => { setTxModal({ env }); setTxForm(blankTx()); }}
                      onDeleteTx={id => dispatch({ type: 'DELETE_TRANSACTION', payload: id })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Envelope modal */}
      {envModal && (
        <Modal
          title={envModal.mode === 'add' ? 'Nouvelle enveloppe' : 'Modifier l\'enveloppe'}
          onClose={() => setEnvModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEnvModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveEnv} disabled={!envForm.name || !envForm.budgetMonthly}>
                {envModal.mode === 'add' ? 'Créer' : 'Enregistrer'}
              </button>
            </>
          }
        >
          <div>
            <label className="label">Catégorie</label>
            <select
              className="input"
              value={envForm.categoryId}
              onChange={e => {
                const cat = ENVELOPE_CATEGORIES.find(c => c.id === e.target.value);
                setEnvForm(f => ({ ...f, categoryId: e.target.value, name: cat?.name || f.name, icon: cat?.icon || f.icon, colorKey: cat?.colorKey || f.colorKey, type: cat?.type || f.type }));
              }}
            >
              {ENVELOPE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nom personnalisé</label>
            <input className="input" value={envForm.name} onChange={e => setEnvForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Budget mensuel (€)</label>
            <input
              className="input text-lg font-semibold"
              type="number"
              placeholder="Ex. 300"
              value={envForm.budgetMonthly}
              onChange={e => setEnvForm(f => ({ ...f, budgetMonthly: e.target.value }))}
            />
            {envForm.budgetMonthly && (
              <p className="text-xs text-slate-400 mt-1">
                Soit {fmt(weeklyAmount(Number(envForm.budgetMonthly)))} / semaine
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* Transaction modal */}
      {txModal && (
        <Modal
          title={`Dépense — ${txModal.env.name}`}
          onClose={() => setTxModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setTxModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveTx} disabled={!txForm.amount || Number(txForm.amount) <= 0}>
                Enregistrer
              </button>
            </>
          }
        >
          <div>
            <label className="label">Montant (€)</label>
            <input
              className="input text-2xl font-bold"
              type="number"
              placeholder="0.00"
              value={txForm.amount}
              onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {[{ id: 'cash', label: 'Espèces', icon: Coins }, { id: 'card', label: 'Carte', icon: CreditCard }].map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTxForm(f => ({ ...f, paymentMethod: m.id }))}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${txForm.paymentMethod === m.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
              >
                <m.icon size={14} /> {m.label}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Description (optionnel)</label>
            <input
              className="input"
              placeholder="Ex. Carrefour, Total, …"
              value={txForm.note}
              onChange={e => setTxForm(f => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={txForm.date}
              onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          {/* Recurring toggle */}
          <div
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${txForm.recurring ? 'border-primary bg-primary/5' : 'border-slate-200 bg-slate-50'}`}
            onClick={() => setTxForm(f => ({ ...f, recurring: !f.recurring }))}
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={15} className={txForm.recurring ? 'text-primary' : 'text-slate-400'} />
              <span className={`text-sm font-medium ${txForm.recurring ? 'text-primary' : 'text-slate-600'}`}>
                Dépense récurrente
              </span>
            </div>
            <div className={`w-9 h-5 rounded-full transition-colors ${txForm.recurring ? 'bg-primary' : 'bg-slate-200'}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-transform ${txForm.recurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </div>
          {txForm.recurring && (
            <div>
              <label className="label">Jour du mois (1–28)</label>
              <input
                className="input"
                type="number"
                min="1"
                max="28"
                value={txForm.dayOfMonth}
                onChange={e => setTxForm(f => ({ ...f, dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value))) }))}
              />
              <p className="text-xs text-slate-400 mt-1">
                Créée automatiquement le {txForm.dayOfMonth} de chaque mois
              </p>
            </div>
          )}
        </Modal>
      )}

      {/* Withdrawal modal */}
      {withdrawalOpen && (
        <WithdrawalModal
          envelopes={envelopes}
          transactions={transactions}
          withdrawals={withdrawals}
          viewMode={viewMode}
          idealNeeds={idealNeeds}
          idealWants={idealWants}
          idealSavings={idealSavings}
          tobaccoEnv={tobaccoEnv}
          onSave={w => { dispatch({ type: 'ADD_WITHDRAWAL', payload: w }); setWithdrawalOpen(false); }}
          onClose={() => setWithdrawalOpen(false)}
        />
      )}
    </div>
  );
}
