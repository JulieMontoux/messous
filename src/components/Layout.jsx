import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Receipt, Wallet, Lightbulb, UserRound, BarChart2, ChevronLeft, ChevronRight,
  TrendingUp, LogOut, Target, Landmark, MoreHorizontal, RefreshCw,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import { useVersionCheck } from '../hooks/useVersionCheck';
import { isBankTodo } from '../utils/budget';

const NAV = [
  { id: 'dashboard', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard },
  { id: 'envelopes', label: 'Enveloppes', short: 'Enveloppes', icon: Wallet },
  { id: 'bank', label: 'Banque', short: 'Banque', icon: Landmark },
  { id: 'history', label: 'Historique', short: 'Historique', icon: BarChart2 },
  { id: 'charges', label: 'Charges fixes', short: 'Fixes', icon: Receipt },
  { id: 'goals', label: 'Objectifs', short: 'Objectifs', icon: Target },
  { id: 'suggestions', label: 'Astuces', short: 'Astuces', icon: Lightbulb },
  { id: 'settings', label: 'Profil', short: 'Profil', icon: UserRound },
];

// Mobile : 4 onglets principaux + « Plus »
const MOBILE_MAIN = ['dashboard', 'envelopes', 'bank', 'history'];

function Sidebar({ page, onNavigate, collapsed, onToggle, unclassified }) {
  const { logout } = useAuth();
  const { state } = useBudget();
  const { profile } = state;

  return (
    <aside className={cn(
      'hidden lg:flex flex-col fixed top-0 left-0 h-full bg-white border-r border-slate-100 z-30 transition-all duration-300',
      collapsed ? 'w-[68px]' : 'w-[220px]'
    )}>
      <div className={cn('flex items-center h-16 px-4 border-b border-slate-100', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center flex-shrink-0">
          <TrendingUp size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-slate-800 text-sm leading-none">MesSous</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Budget enveloppes</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          const badge = id === 'bank' && unclassified > 0 ? unclassified : null;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              title={collapsed ? label : undefined}
              className={cn(
                'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                collapsed ? 'justify-center px-2' : '',
                active ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
              {!collapsed && <span className="flex-1 text-left">{label}</span>}
              {badge && (
                <span className={cn(
                  'text-[10px] font-bold bg-warn text-white rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center',
                  collapsed && 'absolute top-1 right-1'
                )}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-slate-100 space-y-0.5">
        {!collapsed && profile.firstName && (
          <button onClick={() => onNavigate('settings')} className="w-full text-left px-3 py-2 mb-1 rounded-xl hover:bg-slate-50">
            <p className="text-xs font-semibold text-slate-700 truncate">{profile.firstName}</p>
            <p className="text-[10px] text-slate-400">Modifier mon profil</p>
          </button>
        )}
        <button
          onClick={logout}
          title={collapsed ? 'Se déconnecter' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-danger/5 hover:text-danger transition-all duration-150',
            collapsed ? 'justify-center px-2' : ''
          )}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>

      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow z-10"
      >
        {collapsed ? <ChevronRight size={12} className="text-slate-500" /> : <ChevronLeft size={12} className="text-slate-500" />}
      </button>
    </aside>
  );
}

function BottomNav({ page, onNavigate, unclassified }) {
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const main = NAV.filter(n => MOBILE_MAIN.includes(n.id));
  const more = NAV.filter(n => !MOBILE_MAIN.includes(n.id));
  const moreActive = more.some(n => n.id === page);

  function go(id) {
    setMoreOpen(false);
    onNavigate(id);
  }

  return (
    <>
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-[68px] left-3 right-3 bg-white rounded-2xl shadow-xl p-2 grid grid-cols-3 gap-1"
            onClick={e => e.stopPropagation()}
          >
            {more.map(({ id, short, icon: Icon }) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-medium',
                  page === id ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <Icon size={20} />
                {short}
              </button>
            ))}
            <button
              onClick={logout}
              className="flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-medium text-slate-400 hover:bg-danger/5 hover:text-danger"
            >
              <LogOut size={20} />
              Déconnexion
            </button>
          </div>
        </div>
      )}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-100 z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 px-1 py-1.5">
          {main.map(({ id, short, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                onClick={() => go(id)}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors',
                  active ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{short}</span>
                {id === 'bank' && unclassified > 0 && (
                  <span className="absolute top-0.5 right-[calc(50%-18px)] w-2 h-2 rounded-full bg-warn" />
                )}
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen(o => !o)}
            className={cn(
              'flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors',
              moreActive || moreOpen ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
            )}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium">Plus</span>
          </button>
        </div>
      </nav>
    </>
  );
}

export default function Layout({ page, onNavigate, children }) {
  const { state } = useBudget();
  const [collapsed, setCollapsed] = useState(false);
  const [syncError, setSyncError] = useState('');
  const updateAvailable = useVersionCheck();

  const unclassified = state.bankTransactions.filter(isBankTodo).length;

  useEffect(() => {
    const handler = (e) => {
      setSyncError(e.detail);
      setTimeout(() => setSyncError(''), 5000);
    };
    window.addEventListener('messous:sync-error', handler);
    return () => window.removeEventListener('messous:sync-error', handler);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar page={page} onNavigate={onNavigate} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} unclassified={unclassified} />
      <BottomNav page={page} onNavigate={onNavigate} unclassified={unclassified} />

      {syncError && (
        <div className="fixed top-4 right-4 left-4 sm:left-auto z-50 bg-danger text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          ⚠️ Erreur sauvegarde : {syncError}
        </div>
      )}

      {updateAvailable && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3">
          <span>Nouvelle version disponible</span>
          <button onClick={() => window.location.reload()} className="flex items-center gap-1 font-semibold text-primary-light">
            <RefreshCw size={14} /> Recharger
          </button>
        </div>
      )}

      <main className={cn(
        'min-h-screen transition-all duration-300',
        'pb-24 lg:pb-8',
        collapsed ? 'lg:ml-[68px]' : 'lg:ml-[220px]'
      )}>
        <div className="max-w-5xl mx-auto px-4 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}

