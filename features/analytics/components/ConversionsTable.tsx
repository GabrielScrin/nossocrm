import React from 'react';
import type { ConversionEvent } from '../hooks/useConversions';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return format(new Date(value), 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch (e) {
    return value;
  }
}

function statusColor(status?: string | null) {
  if (!status) return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  if (status === 'sent') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';
  if (status === 'pending') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200';
  if (status === 'skipped') return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200';
}

export function ConversionsTable({ conversions }: { conversions: ConversionEvent[] }) {
  return (
    <div className="glass rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Conversões recentes</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Status dos envios para Meta/Google</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-2">Evento</th>
              <th className="text-left px-4 py-2">Plataforma</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Tentativa</th>
              <th className="text-left px-4 py-2">Motivo/Resposta</th>
            </tr>
          </thead>
          <tbody>
            {conversions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Nenhuma conversão encontrada no período.
                </td>
              </tr>
            )}
            {conversions.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 dark:border-white/5">
                <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{c.event_type.toUpperCase()}</td>
                <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{c.platform || '—'}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor(c.status)}`}>
                    <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true" />
                    {c.status || '—'}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{formatDate(c.attempted_at || c.created_at)}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300 max-w-lg truncate" title={c.reason || undefined}>
                  {c.reason || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
