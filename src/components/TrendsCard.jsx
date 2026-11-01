import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { fmt, monthlySpendingSeries, spendingTrends } from '../utils/budget';
import { monthKey } from '../utils/period';

const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const short = m => `${MONTH_SHORT[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

export function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200">{short(p.month)}{p.current ? ' · en cours' : ''}</p>
      <p className="text-slate-500 dark:text-slate-400">{fmt(p.total)}</p>
    </div>
  );
}

// Dépenses mois par mois sur 12 mois (une série à la fois) + plus fortes variations par enveloppe
export default function TrendsCard({ transactions, envelopes }) {
  const [envelopeId, setEnvelopeId] = useState('');
  const current = monthKey();
  const series = monthlySpendingSeries(transactions, envelopes, { envelopeId: envelopeId || null })
    .map(p => ({ ...p, label: short(p.month), current: p.month === current }));
  const trends = spendingTrends(transactions, envelopes).slice(0, 6);
  const finished = series.filter(p => !p.current && p.total > 0);
  const avg = finished.length ? finished.reduce((s, p) => s + p.total, 0) / finished.length : 0;

  if (!series.some(p => p.total > 0)) return null;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">Tendances sur 12 mois</p>
          {avg > 0 && <p className="text-xs text-slate-400">Moyenne des mois terminés : {fmt(avg)}</p>}
        </div>
        <select className="input py-1.5 text-xs w-auto" value={envelopeId} onChange={e => setEnvelopeId(e.target.value)}>
          <option value="">Toutes les dépenses</option>
          {envelopes.filter(e => e.type !== 'saving').map(e => <option key={e.id} value={e.id}>{e.icon || ''} {e.name}</option>)}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={series} margin={{ top: 4, right: 0, left: -18, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-700" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} width={52} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {series.map(p => <Cell key={p.month} fill={p.current ? '#c7d2fe' : '#6366f1'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-slate-400 -mt-2">Barre claire : mois en cours, pas encore terminé.</p>

      {trends.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Dernier mois terminé vs moyenne des 3 précédents</p>
          <div className="divide-y divide-slate-50">
            {trends.map(t => {
              const up = t.last > t.avg;
              const pct = t.change != null ? Math.round(t.change * 100) : null;
              return (
                <div key={t.envelope.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-600 truncate">{t.envelope.icon || ''} {t.envelope.name}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-400">{fmt(t.avg)} → <strong className="text-slate-700">{fmt(t.last)}</strong></span>
                    <span className={`flex items-center text-xs font-semibold w-16 justify-end ${up ? 'text-warn' : 'text-savings'}`}>
                      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {pct != null ? `${pct > 0 ? '+' : ''}${pct} %` : 'nouveau'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
