import { useState, useEffect } from 'react';
import { LayoutDashboard, Receipt, Wallet, Lightbulb, Settings, BarChart2, ChevronLeft, ChevronRight, TrendingUp, LogOut, Target } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';

const NAV = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'charges', label: 'Charges fixes', icon: Receipt },
  { id: 'envelopes', label: 'Enveloppes', icon: Wallet },
  { id: 'goals', label: 'Objectifs', icon: Target },
  { id: 'history', label: 'Historique', icon: BarChart2 },
  { id: 'suggestions', label: 'Astuces', icon: Lightbulb },
  { id: 'settings', label: 'Réglages', icon: Settings },
];

function Sidebar({ page, onNavigate, collapsed, onToggle }) {
  const { logout } = useAuth();
  const { state } = useBudget();
  const { profile } = state;

  return (
    <aside className={cn(
      'hidden lg:flex flex-col fixed top-0 left-0 h-full bg-white border-r border-slate-100 z-30 transition-all duration-300',
      collapsed ? 'w-[68px]' : 'w-[220px]'
    )}>
      {/* Logo */}
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

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              title={collapsed ? label : undefined}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                collapsed ? 'justify-center px-2' : '',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-slate-100 space-y-0.5">
        {!collapsed && profile.firstName && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-semibold text-slate-700 truncate">{profile.firstName}</p>
            <p className="text-[10px] text-slate-400">Budget personnel</p>
          </div>
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

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow z-10"
      >
        {collapsed ? <ChevronRight size={12} className="text-slate-500" /> : <ChevronLeft size={12} className="text-slate-500" />}
      </button>
    </aside>
  );
}

function BottomNav({ page, onNavigate }) {
  const mobileNav = NAV.slice(0, 6);
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 shadow-lg z-40">
      <div className="flex items-center justify-around px-1 py-1.5">
        {mobileNav.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          const shortLabel = { dashboard: 'Tableau', charges: 'Fixes', envelopes: 'Envelo.', goals: 'Objectifs', history: 'Histo.', suggestions: 'Astuces', settings: 'Réglages' }[id];
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors',
                active ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{shortLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function Layout({ page, onNavigate, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [syncError, setSyncError] = useState('');

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
      <Sidebar page={page} onNavigate={onNavigate} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <BottomNav page={page} onNavigate={onNavigate} />

      {syncError && (
        <div className="fixed top-4 right-4 z-50 bg-danger text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          ⚠️ Erreur sauvegarde : {syncError}
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
