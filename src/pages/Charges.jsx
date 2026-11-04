import { useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, CalendarClock, Flag, ChevronDown, ChevronUp } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { FIXED_CATEGORIES, MONTHS_FR as MONTHS, generateId, blankCharge } from '../data/defaults';
import { fmt, totalFixed, monthlyAmount, isDueInMonth, chargeFromForm, isChargeActive, monthsLeft } from '../utils/budget';
import { formatDay } from '../utils/period';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import ChargeForm from '../components/ChargeForm';

const FREQ_SUFFIX = { monthly: '/ mois', quarterly: '/ trimestre', yearly: '/ an' };

function formatMonth(yyyyMM) {
  const [y, m] = yyyyMM.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}


// Payée pour l'échéance en cours ? (même mois pour une mensuelle, depuis moins d'un trimestre / an sinon)
function paidThisPeriod(charge, now = new Date()) {
  if (!charge.lastPaidAt) return false;
  const paid = new Date(`${charge.lastPaidAt}T12:00:00`);
  const monthsAgo = (now.getFullYear() - paid.getFullYear()) * 12 + now.getMonth() - paid.getMonth();
  const span = { quarterly: 3, yearly: 12 }[charge.frequency] || 1;
  return monthsAgo < span;
}

function ChargeRow({ charge, onEdit, onDelete }) {
  const now = new Date();
  const freq = charge.frequency || 'monthly';
  const active = isChargeActive(charge);
  const dueNow = active && freq !== 'monthly' && isDueInMonth(charge, now.getMonth() + 1);
  const paid = active && paidThisPeriod(charge, now);
  const left = monthsLeft(charge);

  return (
    <div className={`card flex items-center gap-3 py-3 ${active ? '' : 'opacity-60'}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-700 truncate">{charge.name}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
          {freq !== 'monthly' && (
            <span>
              {freq === 'yearly' ? 'Annuel' : 'Trimestriel'}
              {charge.dueMonth ? ` · ${freq === 'yearly' ? 'en' : 'à partir de'} ${MONTHS[charge.dueMonth - 1]}` : ''}
              {' '}· ≈ {fmt(monthlyAmount(charge))} / mois
            </span>
          )}
          {charge.endMonth && (
            active ? (
              <span className={`flex items-center gap-0.5 ${left <= 2 ? 'text-savings' : ''}`}>
                <Flag size={11} /> jusqu'en {formatMonth(charge.endMonth)} · {left === 1 ? 'dernier mois' : `encore ${left} mois`}
              </span>
            ) : (
              <span className="flex items-center gap-0.5"><Flag size={11} /> terminée en {formatMonth(charge.endMonth)}</span>
            )
          )}
          {paid ? (
            <span className="text-savings flex items-center gap-0.5">
              <CheckCircle2 size={11} /> payé le {formatDay(charge.lastPaidAt)}
              {charge.lastPaidAmount != null && Math.abs(charge.lastPaidAmount - charge.amount) >= 1 && ` (${fmt(charge.lastPaidAmount)})`}
            </span>
          ) : dueNow ? (
            <span className="text-warn flex items-center gap-0.5"><CalendarClock size={11} /> prélevé ce mois-ci</span>
          ) : null}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-slate-800">{fmt(charge.amount)}</p>
        {freq !== 'monthly' && <p className="text-xs text-slate-400">{FREQ_SUFFIX[freq]}</p>}
      </div>
      <button onClick={onEdit} className="p-1.5 text-slate-300 hover:text-primary transition-colors">
        <Pencil size={15} />
      </button>
      <button onClick={onDelete} className="p-1.5 text-slate-300 hover:text-danger transition-colors">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function Charges() {
  const { state, dispatch } = useBudget();
  const { fixedCharges, profile } = state;
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blankCharge);

  function openAdd() {
    setForm(blankCharge());
    setModal({ mode: 'add' });
  }

  function openEdit(charge) {
    setForm({
      name: charge.name,
      categoryId: charge.categoryId,
      amount: charge.amount,
      frequency: charge.frequency || 'monthly',
      dueMonth: charge.dueMonth || new Date().getMonth() + 1,
      endMonth: charge.endMonth || '',
    });
    setModal({ mode: 'edit', charge });
  }

  function save() {
    if (!form.name || !form.amount) return;
    const data = chargeFromForm(form);
    if (modal.mode === 'add') {
      dispatch({ type: 'ADD_FIXED_CHARGE', payload: { id: generateId(), ...data } });
    } else {
      dispatch({ type: 'UPDATE_FIXED_CHARGE', payload: { ...modal.charge, ...data } });
    }
    setModal(null);
  }

  function remove(charge) {
    if (window.confirm(`Supprimer « ${charge.name} » ?`)) dispatch({ type: 'DELETE_FIXED_CHARGE', payload: charge.id });
  }

  const [showEnded, setShowEnded] = useState(false);
  const total = totalFixed(fixedCharges);
  const active = fixedCharges.filter(c => isChargeActive(c));
  const ended = fixedCharges.filter(c => !isChargeActive(c));
  const upcomingEnds = active.filter(c => c.endMonth).sort((a, b) => a.endMonth.localeCompare(b.endMonth));
  const provisions = active.filter(c => (c.frequency || 'monthly') !== 'monthly');
  const provisionTotal = provisions.reduce((s, c) => s + monthlyAmount(c), 0);
  const month = new Date().getMonth() + 1;
  const dueThisMonth = provisions.filter(c => isDueInMonth(c, month));
  const pctOfSalary = profile.netSalary > 0 ? Math.round((total / profile.netSalary) * 100) : 0;

  const grouped = FIXED_CATEGORIES.map(cat => ({
    ...cat,
    items: active.filter(c => c.categoryId === cat.id),
  })).filter(g => g.items.length > 0);
  const ungrouped = active.filter(c => !FIXED_CATEGORIES.find(cat => cat.id === c.categoryId));

  return (
    <div className="pt-6 pb-4 space-y-4">
      <PageHeader title="Charges fixes" subtitle="Ce qui sort quoi qu'il arrive — chaque mois, trimestre ou année">
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 py-2 text-sm">
          <Plus size={16} /> Ajouter
        </button>
      </PageHeader>

      {/* Summary */}
      <div className="card bg-fixed/5 border-fixed/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Total mensuel</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{fmt(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">du salaire</p>
            <p className={`text-2xl font-bold mt-1 ${pctOfSalary > 60 ? 'text-danger' : pctOfSalary > 45 ? 'text-warn' : 'text-fixed'}`}>
              {pctOfSalary}%
            </p>
          </div>
        </div>
        {profile.netSalary > 0 && (
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pctOfSalary > 60 ? 'bg-danger' : pctOfSalary > 45 ? 'bg-warn' : 'bg-fixed'}`}
              style={{ width: `${Math.min(100, pctOfSalary)}%` }}
            />
          </div>
        )}
        {provisions.length > 0 && (
          <p className="text-xs text-slate-500 mt-3">
            Dont <strong>{fmt(provisionTotal)} / mois</strong> mis de côté pour {provisions.length} charge{provisions.length > 1 ? 's' : ''} annuelle{provisions.length > 1 ? 's' : ''} ou trimestrielle{provisions.length > 1 ? 's' : ''}
            {dueThisMonth.length > 0 && <> · ce mois-ci : {dueThisMonth.map(c => `${c.name} (${fmt(c.amount)})`).join(', ')}</>}
          </p>
        )}
      </div>

      {upcomingEnds.length > 0 && (
        <div className="card border-savings/20 bg-savings/5">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2"><Flag size={15} className="text-savings" /> Fins prévues</p>
          <div className="space-y-1">
            {upcomingEnds.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{c.name} <span className="text-xs text-slate-400">· dernier paiement en {formatMonth(c.endMonth)}</span></span>
                <span className="font-semibold text-savings">+{fmt(monthlyAmount(c))} / mois</span>
              </div>
            ))}
          </div>
          {upcomingEnds.length > 1 && (
            <p className="text-xs text-slate-500 mt-2">
              Une fois tout terminé : <strong className="text-savings">+{fmt(upcomingEnds.reduce((s, c) => s + monthlyAmount(c), 0))} / mois</strong> disponibles
            </p>
          )}
        </div>
      )}

      {grouped.length === 0 && ungrouped.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">Aucune charge fixe</p>
          <p className="text-sm mt-1">Ajoute loyer, électricité, abonnements…</p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.id}>
            <p className="text-xs font-semibold text-slate-400 mb-2">
              {group.icon} {group.name}
            </p>
            <div className="space-y-2">
              {group.items.map(charge => (
                <ChargeRow key={charge.id} charge={charge} onEdit={() => openEdit(charge)} onDelete={() => remove(charge)} />
              ))}
            </div>
          </div>
        ))
      )}

      {ungrouped.length > 0 && (
        <div className="space-y-2">
          {ungrouped.map(charge => (
            <ChargeRow key={charge.id} charge={charge} onEdit={() => openEdit(charge)} onDelete={() => remove(charge)} />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <div>
          <button onClick={() => setShowEnded(v => !v)} className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-2">
            {showEnded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Terminées ({ended.length})
          </button>
          {showEnded && (
            <div className="space-y-2">
              {ended.map(charge => (
                <ChargeRow key={charge.id} charge={charge} onEdit={() => openEdit(charge)} onDelete={() => remove(charge)} />
              ))}
            </div>
          )}
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Nouvelle charge fixe' : 'Modifier la charge'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={save} disabled={!form.name || !form.amount}>
                {modal.mode === 'add' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </>
          }
        >
          <ChargeForm form={form} setForm={setForm} />
        </Modal>
      )}
    </div>
  );
}
