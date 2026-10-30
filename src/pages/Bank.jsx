import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Upload, Link2, Trash2, CreditCard, EyeOff, Eye, X, Landmark, Search } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { api, fetchBankTransactions } from '../api/client';
import { fmt, fmtDec, realSpending, isBankTodo as isTodo, chargeFromForm } from '../utils/budget';
import { blankCharge, generateId } from '../data/defaults';
import ChargeForm from '../components/ChargeForm';
import { periodStart, formatDay } from '../utils/period';
import { cn } from '../lib/utils';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';

const FILTERS = [
  { id: 'todo', label: 'À classer' },
  { id: 'card', label: 'Dépenses' },
  { id: 'all', label: 'Toutes' },
  { id: 'ignored', label: 'Ignorées' },
];

function SpendTile({ label, value, sub, accent = 'text-slate-800' }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={cn('text-lg font-bold', accent)}>{fmt(value)}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

const FREQ_LABEL = { quarterly: ' · trimestriel', yearly: ' · annuel' };

// Valeur du menu de classement : « env:<id> », « fix:<id> » ou « new-fix »
function BankRow({ b, envelopes, fixedCharges, selected, bulkMode, onToggle, onAssign, onUnassign, onIgnore, onCreateCharge }) {
  const [target, setTarget] = useState('');
  const [remember, setRemember] = useState(true);
  const env = envelopes.find(e => e.id === b.envelopeId);
  const charge = fixedCharges.find(c => c.id === b.fixedChargeId);
  const debit = b.amount < 0;

  function classify() {
    if (target === 'new-fix') return onCreateCharge(b, remember);
    const [kind, id] = target.split(':');
    onAssign(b, kind === 'fix' ? { fixedChargeId: id } : { envelopeId: id }, remember);
  }

  return (
    <div className={cn('py-3 border-b border-slate-50 last:border-0', b.ignored && 'opacity-50', selected && 'bg-primary/5 -mx-2 px-2 rounded-lg')}>
      <div className="flex items-start justify-between gap-3">
        {debit && (
          <input
            type="checkbox"
            className="mt-1 w-4 h-4 accent-primary flex-shrink-0 cursor-pointer"
            checked={selected}
            onChange={() => onToggle(b.id)}
            aria-label="Sélectionner"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700 truncate flex items-center gap-1.5">
            {b.isCard && <CreditCard size={12} className="text-slate-400 flex-shrink-0" />}
            {b.label || '—'}
          </p>
          <p className="text-xs text-slate-400">{formatDay(b.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
        </div>
        <p className={cn('font-semibold flex-shrink-0', debit ? 'text-slate-800' : 'text-savings')}>
          {debit ? '' : '+'}{fmtDec(b.amount)}
        </p>
      </div>

      {debit && !b.ignored && (
        env || charge ? (
          <div className="flex items-center gap-2 mt-2">
            {env
              ? <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-1 rounded-full">{env.icon || ''} {env.name}</span>
              : <span className="text-xs bg-fixed/10 text-fixed-dark font-medium px-2 py-1 rounded-full">📌 {charge.name}{FREQ_LABEL[charge.frequency] || ''}</span>}
            <button onClick={() => onUnassign(b)} className="text-xs text-slate-400 hover:text-danger flex items-center gap-0.5">
              <X size={12} /> Retirer
            </button>
          </div>
        ) : bulkMode ? null : (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <select className="input py-1.5 text-xs flex-1 min-w-[160px]" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">Classer dans…</option>
              {envelopes.length > 0 && (
                <optgroup label="Enveloppes">
                  {envelopes.map(e => <option key={e.id} value={`env:${e.id}`}>{e.icon || ''} {e.name}</option>)}
                </optgroup>
              )}
              <optgroup label="Charges fixes">
                {fixedCharges.map(c => <option key={c.id} value={`fix:${c.id}`}>📌 {c.name}{FREQ_LABEL[c.frequency] || ''}</option>)}
                <option value="new-fix">＋ Nouvelle charge fixe…</option>
              </optgroup>
            </select>
            <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              toujours pour ce marchand
            </label>
            <button className="btn-primary py-1.5 px-3 text-xs" disabled={!target} onClick={classify}>
              Classer
            </button>
            <button onClick={() => onIgnore(b, true)} className="p-1.5 text-slate-300 hover:text-slate-500" title="Ignorer (virement, retrait…)">
              <EyeOff size={14} />
            </button>
          </div>
        )
      )}
      {b.ignored && (
        <button onClick={() => onIgnore(b, false)} className="mt-1 text-xs text-slate-400 hover:text-primary flex items-center gap-1">
          <Eye size={12} /> Ne plus ignorer
        </button>
      )}
    </div>
  );
}

// Barre de classement en masse (opérations cochées)
function BulkBar({ count, total, envelopes, fixedCharges, onApply, onClear }) {
  const [target, setTarget] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  async function apply(action) {
    setBusy(true);
    await onApply(action, remember);
    setBusy(false);
    setTarget('');
  }

  return (
    <div className="sticky top-2 z-20 bg-slate-800 text-white rounded-xl p-3 mb-3 shadow-lg space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span><strong>{count}</strong> sélectionnée{count > 1 ? 's' : ''} · {fmtDec(total)}</span>
        <button onClick={onClear} className="text-xs text-slate-300 hover:text-white flex items-center gap-1"><X size={12} /> Désélectionner</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input py-1.5 text-xs text-slate-800 flex-1 min-w-[160px]" value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">Classer dans…</option>
          {envelopes.length > 0 && (
            <optgroup label="Enveloppes">
              {envelopes.map(e => <option key={e.id} value={`env:${e.id}`}>{e.icon || ''} {e.name}</option>)}
            </optgroup>
          )}
          {fixedCharges.length > 0 && (
            <optgroup label="Charges fixes">
              {fixedCharges.map(c => <option key={c.id} value={`fix:${c.id}`}>📌 {c.name}{FREQ_LABEL[c.frequency] || ''}</option>)}
            </optgroup>
          )}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          retenir ces marchands
        </label>
        <button className="btn-primary py-1.5 px-3 text-xs" disabled={!target || busy} onClick={() => apply(target)}>
          Classer
        </button>
        <button className="py-1.5 px-3 text-xs rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-1" disabled={busy} onClick={() => apply('ignore')}>
          <EyeOff size={12} /> Ignorer
        </button>
      </div>
    </div>
  );
}

// Nom lisible du marchand à partir du libellé bancaire (« PRLV SEPA AMAZON PRIME FR » → « Amazon Prime Fr »)
function merchantName(label) {
  const name = String(label || '')
    .replace(/PAIEMENT PAR CARTE|PAIEMENT CB|ACHAT CB|FACTURE CARTE|CARTE\s*X?\d*|\b(CB|VISA|MASTERCARD|PRLV|PRELEVEMENT|SEPA|ECHEANCE|EUROPEEN)\b/gi, ' ')
    .replace(/\d{2}[/.-]\d{2}([/.-]\d{2,4})?|\bX?\d+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, c => c.toUpperCase());
  return (name || String(label || '').trim()).slice(0, 60);
}

// Crée une charge fixe à partir d'un paiement (ex. abonnement annuel), puis y rattache le paiement
function NewChargeModal({ b, onSave, onClose }) {
  const month = Number(b.date.slice(5, 7));
  const [form, setForm] = useState({
    ...blankCharge(),
    name: merchantName(b.label),
    categoryId: 'subscription',
    amount: Math.abs(b.amount),
    dueMonth: month,
  });
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Nouvelle charge fixe"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button
            className="btn-primary"
            disabled={!form.name || !form.amount || busy}
            onClick={async () => { setBusy(true); await onSave(form); }}
          >
            Créer et classer
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-500">
        Paiement du {formatDay(b.date)} : <strong>{fmtDec(Math.abs(b.amount))}</strong>.
        Pour un abonnement annuel, choisis « Annuel » : le budget mettra 1/12 de côté chaque mois.
      </p>
      <ChargeForm form={form} setForm={setForm} />
    </Modal>
  );
}

function ConnectModal({ onClose }) {
  const [banks, setBanks] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/bank/banks').then(setBanks).catch(err => setError(err.message));
  }, []);

  async function connect(bankName) {
    setBusy(true);
    setError('');
    try {
      const { url } = await api.post('/api/bank/connect', { bankName });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const list = (banks || []).filter(b => b.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal title="Connecter ma banque" onClose={onClose}>
      <p className="text-xs text-slate-500">
        Connexion sécurisée DSP2 via Enable Banking : tu t'identifies directement sur le site de ta banque,
        MesSous ne voit jamais tes identifiants. Accès en lecture seule, valable 180 jours.
        Les opérations sont récupérées à partir du 1er du mois dernier.
      </p>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-8" placeholder="Rechercher ma banque…" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!banks && !error && <p className="text-sm text-slate-400 text-center py-4">Chargement des banques…</p>}
      <div className="space-y-1 max-h-[45vh] overflow-y-auto">
        {list.map(b => (
          <button
            key={b.name}
            disabled={busy}
            onClick={() => connect(b.name)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-left disabled:opacity-40"
          >
            {b.logo ? <img src={b.logo} alt="" className="w-7 h-7 object-contain rounded" /> : <Landmark size={18} className="text-slate-400" />}
            <span className="text-sm font-medium text-slate-700">{b.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ImportModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [accountName, setAccountName] = useState('Compte courant');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      // Les exports des banques françaises sont souvent en Windows-1252
      const buf = await file.arrayBuffer();
      let csv = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      if (csv.includes('�')) csv = new TextDecoder('windows-1252').decode(buf);
      const res = await api.post('/api/bank/import', { csv, accountName });
      onImported(res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Importer un relevé CSV"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={!file || busy}>{busy ? 'Import…' : 'Importer'}</button>
        </>
      }
    >
      <p className="text-xs text-slate-500">
        Exporte tes opérations depuis l'espace client de ta banque (format CSV). Colonnes reconnues :
        Date, Libellé, Montant (ou Débit / Crédit). Seules les opérations depuis le 1er du mois dernier sont importées,
        et les doublons sont ignorés : tu peux réimporter sans risque.
      </p>
      <div>
        <label className="label">Compte</label>
        <input className="input" value={accountName} onChange={e => setAccountName(e.target.value)} />
      </div>
      <div>
        <label className="label">Fichier</label>
        <input className="input" type="file" accept=".csv,text/csv,text/plain" onChange={e => setFile(e.target.files?.[0] || null)} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Modal>
  );
}

export default function Bank({ params = {} }) {
  const { state, dispatch } = useBudget();
  const { envelopes, transactions, bankTransactions, fixedCharges } = state;
  const [newCharge, setNewCharge] = useState(null);
  const [status, setStatus] = useState(null);
  const [filter, setFilter] = useState('todo');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(
    params.bank === 'ok' ? { ok: true, text: 'Banque connectée ✅ Les opérations ont été récupérées.' }
      : params.bank === 'error' ? { ok: false, text: 'La connexion à la banque a échoué ou a été annulée.' }
        : null
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function loadStatus() {
    setStatus(await api.get('/api/bank/status').catch(() => ({ providerConfigured: false, connections: [], accounts: [], rules: [] })));
  }

  async function refresh() {
    const [bank, txs] = await Promise.all([fetchBankTransactions(), api.get('/api/transactions')]);
    dispatch({ type: 'SET_BANK_TRANSACTIONS', payload: bank });
    dispatch({ type: 'SET_TRANSACTIONS', payload: txs });
    await loadStatus();
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.post('/api/bank/sync');
      await refresh();
      setMessage({ ok: true, text: `${r.inserted} nouvelle(s) opération(s), ${r.assigned} classée(s) automatiquement.` });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
    setSyncing(false);
  }

  async function reloadCharges() {
    dispatch({ type: 'SET_FIXED_CHARGES', payload: await api.get('/api/charges') });
  }

  // target : { envelopeId } ou { fixedChargeId }
  async function assign(b, target, remember) {
    try {
      const { transaction } = await api.post(`/api/bank/transactions/${b.id}/assign`, { ...target, remember });
      if (remember) {
        await refresh();
      } else {
        dispatch({
          type: 'SET_BANK_TRANSACTIONS',
          payload: bankTransactions.map(x => x.id === b.id
            ? { ...x, envelopeId: target.envelopeId || null, fixedChargeId: target.fixedChargeId || null, transactionId: transaction?.id || null, ignored: false }
            : x),
        });
        const rest = transactions.filter(t => t.id !== b.transactionId);
        dispatch({ type: 'SET_TRANSACTIONS', payload: transaction ? [transaction, ...rest] : rest });
      }
      if (target.fixedChargeId) await reloadCharges();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  }

  async function createChargeAndAssign(form) {
    try {
      await api.post('/api/charges', { id: generateId(), ...chargeFromForm(form) }).then(async created => {
        await assign(newCharge.b, { fixedChargeId: created.id }, newCharge.remember);
      });
      setMessage({ ok: true, text: `Charge fixe « ${form.name} » créée et paiement classé.` });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
    setNewCharge(null);
  }

  async function unassign(b) {
    await api.post(`/api/bank/transactions/${b.id}/unassign`);
    dispatch({ type: 'SET_BANK_TRANSACTIONS', payload: bankTransactions.map(x => x.id === b.id ? { ...x, envelopeId: null, fixedChargeId: null, transactionId: null } : x) });
    dispatch({ type: 'SET_TRANSACTIONS', payload: transactions.filter(t => t.id !== b.transactionId) });
    if (b.fixedChargeId) await reloadCharges();
  }

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkApply(action, remember) {
    const ids = [...selected];
    const [kind, id] = action.split(':');
    const body = action === 'ignore' ? { ids, ignore: true }
      : kind === 'fix' ? { ids, fixedChargeId: id, remember } : { ids, envelopeId: id, remember };
    try {
      const r = await api.post('/api/bank/transactions/bulk', body);
      setSelected(new Set());
      await refresh();
      if (kind === 'fix') await reloadCharges();
      setMessage({ ok: true, text: `${r.updated} opération${r.updated > 1 ? 's' : ''} ${action === 'ignore' ? 'ignorée' : 'classée'}${r.updated > 1 ? 's' : ''}.` });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  }

  async function ignore(b, ignored) {
    await api.post(`/api/bank/transactions/${b.id}/ignore`, { ignored });
    dispatch({ type: 'SET_BANK_TRANSACTIONS', payload: bankTransactions.map(x => x.id === b.id ? { ...x, ignored } : x) });
  }

  async function removeConnection(id) {
    if (!window.confirm('Déconnecter cette banque ? Les opérations déjà importées sont supprimées.')) return;
    await api.delete(`/api/bank/connections/${id}`);
    await refresh();
  }

  async function removeRule(id) {
    await api.delete(`/api/bank/rules/${id}`);
    await loadStatus();
  }

  const monthStart = periodStart('monthly');
  const weekSince = periodStart('weekly', { withdrawals: state.withdrawals });
  const month = useMemo(() => realSpending({ transactions, envelopes, bankTransactions, since: monthStart }), [transactions, envelopes, bankTransactions, monthStart]);
  const week = useMemo(() => realSpending({ transactions, envelopes, bankTransactions, since: weekSince }), [transactions, envelopes, bankTransactions, weekSince]);
  const todoCount = bankTransactions.filter(isTodo).length;

  const query = search.trim().toLowerCase();
  const visible = bankTransactions.filter(b => {
    if (query && !(b.label || '').toLowerCase().includes(query)) return false;
    if (filter === 'todo') return isTodo(b);
    if (filter === 'card') return b.amount < 0;
    if (filter === 'ignored') return b.ignored;
    return true;
  });
  const selectable = visible.filter(b => b.amount < 0);
  const allSelected = selectable.length > 0 && selectable.every(b => selected.has(b.id));
  const selectedTotal = bankTransactions.filter(b => selected.has(b.id)).reduce((sum, b) => sum + Math.abs(b.amount), 0);

  const hasData = bankTransactions.length > 0 || (status?.accounts?.length ?? 0) > 0;
  const activeConnections = status?.connections?.filter(c => c.status === 'active') || [];
  const lastSync = activeConnections.map(c => c.lastSyncAt).filter(Boolean).sort().pop();

  return (
    <div className="pt-6 pb-4 space-y-4">
      <PageHeader title="Banque" subtitle="Paiements carte et dépenses en temps réel">
        {activeConnections.length > 0 && (
          <button onClick={sync} disabled={syncing} className="btn-secondary flex items-center gap-1.5 py-2 text-sm">
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> Synchroniser
          </button>
        )}
        <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-1.5 py-2 text-sm">
          <Upload size={15} /> CSV
        </button>
        {status?.providerConfigured && (
          <button onClick={() => setConnectOpen(true)} className="btn-primary flex items-center gap-1.5 py-2 text-sm">
            <Link2 size={15} /> Connecter
          </button>
        )}
      </PageHeader>

      {message && (
        <div className={cn('text-sm rounded-xl px-4 py-3 flex items-start justify-between gap-3', message.ok ? 'bg-savings/10 text-savings' : 'bg-danger/10 text-danger')}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={14} /></button>
        </div>
      )}

      {/* Dépenses en temps réel */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">Dépenses du mois</p>
          <p className="text-2xl font-bold text-slate-800">{fmt(month.total)}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SpendTile label="Carte classée" value={month.cardClassified} sub="dans les enveloppes" />
          <SpendTile label="Carte à classer" value={month.unclassified} sub={`${todoCount} opération${todoCount !== 1 ? 's' : ''}`} accent={month.unclassified > 0 ? 'text-warn' : 'text-slate-800'} />
          <SpendTile label="Espèces" value={month.cash} sub="saisies à la main" />
          <SpendTile label="Cette semaine" value={week.total} sub={`depuis le ${formatDay(weekSince)}`} accent="text-primary" />
        </div>
        {lastSync && (
          <p className="text-[11px] text-slate-400 mt-3">
            Dernière synchro : {new Date(lastSync).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {' '}· automatique toutes les 6 h
          </p>
        )}
      </div>

      {/* Comptes & connexions */}
      {status && (status.accounts.length > 0 || status.connections.length > 0) && (
        <div className="card">
          <p className="text-sm font-semibold text-slate-700 mb-2">Comptes</p>
          <div className="divide-y divide-slate-50">
            {status.accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-700">{a.name || 'Compte'}</p>
                  {a.iban && <p className="text-xs text-slate-400">{a.iban.replace(/(.{4})/g, '$1 ').trim()}</p>}
                </div>
                {a.balance != null && <p className="font-bold text-slate-800">{fmtDec(a.balance)}</p>}
              </div>
            ))}
            {status.connections.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 text-xs">
                <span className="text-slate-500">
                  <Landmark size={12} className="inline mr-1" />{c.bankName} ·{' '}
                  <span className={c.status === 'active' ? 'text-savings' : 'text-warn'}>
                    {{ active: 'connectée', pending: 'en attente', expired: 'expirée — reconnecte-toi', error: 'erreur' }[c.status] || c.status}
                  </span>
                  {c.validUntil && c.status === 'active' && ` jusqu'au ${new Date(c.validUntil).toLocaleDateString('fr-FR')}`}
                  {c.lastError && <span className="block text-danger">{c.lastError}</span>}
                </span>
                <button onClick={() => removeConnection(c.id)} className="p-1 text-slate-300 hover:text-danger" title="Déconnecter"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasData && status && (
        <div className="card text-center py-8 space-y-3">
          <p className="text-4xl">🏦</p>
          <p className="font-medium text-slate-700">Aucune opération bancaire</p>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            {status.providerConfigured
              ? 'Connecte ta banque pour récupérer automatiquement tes paiements par carte, ou importe un relevé CSV.'
              : 'Importe un relevé CSV de ta banque. La connexion automatique s\'active dès que le connecteur Enable Banking est configuré sur le serveur (voir README).'}
          </p>
        </div>
      )}

      {/* Opérations */}
      {bankTransactions.length > 0 && (
        <div className="card">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1 mb-2 overflow-x-auto">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => { setFilter(f.id); setSelected(new Set()); }}
                className={cn('flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors', filter === f.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500')}
              >
                {f.label}{f.id === 'todo' && todoCount > 0 ? ` (${todoCount})` : ''}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                className="w-4 h-4 accent-primary"
                checked={allSelected}
                disabled={!selectable.length}
                onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(b => b.id)))}
              />
              Tout
            </label>
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input py-1.5 pl-7 text-xs"
                placeholder="Filtrer par libellé (ex. lidl, amazon…)"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          {selected.size > 0 && (
            <BulkBar
              count={selected.size}
              total={selectedTotal}
              envelopes={envelopes}
              fixedCharges={fixedCharges}
              onApply={bulkApply}
              onClear={() => setSelected(new Set())}
            />
          )}
          {visible.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">{filter === 'todo' ? 'Tout est classé 🎉' : 'Aucune opération'}</p>
          ) : (
            visible.map(b => (
              <BankRow
                key={b.id}
                b={b}
                envelopes={envelopes}
                fixedCharges={fixedCharges}
                selected={selected.has(b.id)}
                bulkMode={selected.size > 0}
                onToggle={toggle}
                onAssign={assign}
                onUnassign={unassign}
                onIgnore={ignore}
                onCreateCharge={(tx, remember) => setNewCharge({ b: tx, remember })}
              />
            ))
          )}
        </div>
      )}

      {/* Règles */}
      {status?.rules?.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-slate-700 mb-1">Classement automatique</p>
          <p className="text-xs text-slate-400 mb-2">Les prochains paiements de ces marchands seront classés automatiquement.</p>
          <div className="divide-y divide-slate-50">
            {status.rules.map(r => {
              const env = envelopes.find(e => e.id === r.envelopeId);
              const fc = fixedCharges.find(c => c.id === r.fixedChargeId);
              return (
                <div key={r.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-600">{r.pattern}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">→ {env ? `${env.icon || ''} ${env.name}` : fc ? `📌 ${fc.name}` : '—'}</span>
                    <button onClick={() => removeRule(r.id)} className="p-1 text-slate-300 hover:text-danger"><Trash2 size={12} /></button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}
      {newCharge && <NewChargeModal b={newCharge.b} onSave={createChargeAndAssign} onClose={() => setNewCharge(null)} />}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={async r => {
            setImportOpen(false);
            await refresh();
            setMessage({
              ok: true,
              text: `${r.parsed} ligne(s) lue(s), ${r.inserted} nouvelle(s), ${r.assigned} classée(s) automatiquement`
                + (r.skipped ? ` · ${r.skipped} antérieure(s) au ${formatDay(r.from, { day: 'numeric', month: 'long' })} ignorée(s).` : '.'),
            });
          }}
        />
      )}
    </div>
  );
}
