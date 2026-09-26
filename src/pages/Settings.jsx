import { useState } from 'react';
import { ChevronRight, AlertTriangle, LogOut } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { useAuth } from '../context/AuthContext';
import { REGIONS } from '../data/defaults';
import { SUPERMARKETS, getSupermarket } from '../data/supermarkets';
import Modal from '../components/Modal';

function Row({ label, value, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between w-full py-3 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-800">{value}</span>
        <ChevronRight size={14} className="text-slate-300" />
      </div>
    </button>
  );
}

function Toggle({ label, sub, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
      <div>
        <p className="text-sm text-slate-700 font-medium">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-primary' : 'bg-slate-200'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const { state, dispatch } = useBudget();
  const { logout } = useAuth();
  const { profile } = state;
  const [editModal, setEditModal] = useState(null);
  const [resetModal, setResetModal] = useState(false);
  const [editVal, setEditVal] = useState('');

  function openEdit(field, current) {
    setEditModal(field);
    setEditVal(String(current));
  }

  function saveEdit() {
    if (!editModal) return;
    let val = editVal;
    if (['netSalary', 'householdAdults', 'householdChildren'].includes(editModal)) {
      val = Number(editVal);
    }
    dispatch({ type: 'UPDATE_PROFILE', payload: { [editModal]: val } });
    setEditModal(null);
  }

  const petsTotal = (profile.pets?.dogs || 0) + (profile.pets?.cats || 0) + (profile.pets?.other || 0);

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Réglages</h1>

      {/* Profile */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Profil</p>
        <Row label="Prénom" value={profile.firstName || '—'} onClick={() => openEdit('firstName', profile.firstName)} />
        <Row
          label="Salaire net mensuel"
          value={`${Number(profile.netSalary).toLocaleString('fr-FR')} €`}
          onClick={() => openEdit('netSalary', profile.netSalary)}
        />
        <Row label="Région" value={profile.region} onClick={() => openEdit('region', profile.region)} />
        <Row
          label="Supermarché habituel"
          value={`${getSupermarket(profile.supermarket)?.logo} ${getSupermarket(profile.supermarket)?.name}`}
          onClick={() => openEdit('supermarket', profile.supermarket || 'leclerc')}
        />
      </div>

      {/* Foyer */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Foyer</p>
        <Row
          label="Adultes"
          value={profile.householdAdults}
          onClick={() => openEdit('householdAdults', profile.householdAdults)}
        />
        <Row
          label="Enfants"
          value={profile.householdChildren}
          onClick={() => openEdit('householdChildren', profile.householdChildren)}
        />
        <Row
          label="Animaux"
          value={`${petsTotal} (${profile.pets?.dogs || 0}🐶 ${profile.pets?.cats || 0}🐱 ${profile.pets?.other || 0}🐹)`}
          onClick={() => {}}
        />
      </div>

      {/* Préférences */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Préférences</p>
        <Toggle
          label="🚗 J'ai une voiture"
          value={profile.hasCar}
          onChange={v => dispatch({ type: 'UPDATE_PROFILE', payload: { hasCar: v } })}
        />
        <Toggle
          label="🚬 Je fume"
          sub="Affiche la section tabac dans les astuces"
          value={profile.isSmoker}
          onChange={v => dispatch({ type: 'UPDATE_PROFILE', payload: { isSmoker: v } })}
        />
      </div>

      {/* Données */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Données</p>
        <button
          onClick={() => setResetModal(true)}
          className="btn-danger w-full flex items-center justify-center gap-2 mb-2"
        >
          <AlertTriangle size={16} /> Réinitialiser toutes les données
        </button>
        <button
          onClick={logout}
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> Se déconnecter
        </button>
      </div>

      {/* About */}
      <div className="card text-center py-5">
        <p className="text-2xl font-bold text-primary">MesSous</p>
        <p className="text-xs text-slate-400 mt-1">Budget enveloppes personnel</p>
        <p className="text-xs text-slate-300 mt-3">v1.0</p>
      </div>

      {/* Edit modal */}
      {editModal && (
        <Modal
          title="Modifier"
          onClose={() => setEditModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEditModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveEdit}>Enregistrer</button>
            </>
          }
        >
          {editModal === 'region' ? (
            <select className="input" value={editVal} onChange={e => setEditVal(e.target.value)}>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : editModal === 'supermarket' ? (
            <div className="grid grid-cols-2 gap-2">
              {SUPERMARKETS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setEditVal(s.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                    editVal === s.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200'
                  }`}
                >
                  <span>{s.logo}</span><span>{s.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <input
              className="input text-lg"
              type={['netSalary', 'householdAdults', 'householdChildren'].includes(editModal) ? 'number' : 'text'}
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              autoFocus
            />
          )}
        </Modal>
      )}

      {/* Reset confirmation */}
      {resetModal && (
        <Modal
          title="⚠️ Réinitialiser les données ?"
          onClose={() => setResetModal(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setResetModal(false)}>Annuler</button>
              <button
                className="btn-danger"
                onClick={() => { dispatch({ type: 'RESET' }); setResetModal(false); }}
              >
                Oui, tout supprimer
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Cette action supprimera définitivement toutes tes données : profil, charges, enveloppes et historique de dépenses.
          </p>
          <p className="text-sm font-semibold text-danger mt-2">Cette action est irréversible.</p>
        </Modal>
      )}
    </div>
  );
}
