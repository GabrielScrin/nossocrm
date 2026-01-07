import React from 'react';
import { useWhatsappLogs } from './hooks';

function formatDate(value?: string | null) {
    if (!value) return '';
    const d = new Date(value);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export const WhatsAppLogsPage: React.FC = () => {
    const { data, isLoading, isError } = useWhatsappLogs();

    return (
        <div className="max-w-5xl space-y-4">
            <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-4">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Logs WhatsApp</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    Mudanças IA↔Humano e entregas básicas de handoff.
                </p>
            </div>
            <div className="glass rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                <div className="p-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                    <span className="text-sm text-slate-700 dark:text-slate-200">Últimos eventos</span>
                    {isLoading && <span className="text-xs text-slate-500">Carregando...</span>}
                </div>
                {isError && (
                    <div className="p-3 text-sm text-red-600 dark:text-red-300">Erro ao carregar logs.</div>
                )}
                <div className="divide-y divide-slate-200 dark:divide-white/10">
                    {(data || []).map((log) => (
                        <div key={log.id} className="p-3 text-sm text-slate-800 dark:text-slate-100">
                            <div className="flex items-center justify-between gap-2">
                                <div className="font-semibold">
                                    {log.conversation?.contactName || log.conversation?.phoneNumber || 'Conversa'}
                                </div>
                                <div className="text-xs text-slate-500">{formatDate(log.createdAt)}</div>
                            </div>
                            <div className="text-xs text-slate-500">
                                {log.from || '—'} → {log.to || '—'} ({log.reason || 'motivo não informado'})
                            </div>
                            {log.by && <div className="text-xs text-slate-500">Por: {log.by}</div>}
                        </div>
                    ))}
                    {!isLoading && (data || []).length === 0 && (
                        <div className="p-3 text-sm text-slate-500">Nenhum log encontrado.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

