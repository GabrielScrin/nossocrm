"use client";

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWhatsappLogs, useWhatsappMessageLogs } from './hooks';

function formatDate(value?: string | null) {
    if (!value) return '';
    const d = new Date(value);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatStatus(status?: string | null) {
    if (!status) return 'pendente';
    const normalized = status.toLowerCase();
    if (normalized === 'sent') return 'enviado';
    if (normalized === 'delivered') return 'entregue';
    if (normalized === 'read') return 'lido';
    if (normalized === 'failed') return 'falhou';
    if (normalized === 'received') return 'recebido';
    return status;
}

function formatDirection(direction?: 'in' | 'out') {
    return direction === 'out' ? 'Enviado' : 'Recebido';
}

function clipText(text?: string | null) {
    if (!text) return '(sem texto)';
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export const WhatsAppLogsPage: React.FC = () => {
    const { data: handoffs, isLoading, isError } = useWhatsappLogs();
    const {
        data: messageLogs,
        isLoading: isLoadingMessages,
        isError: isErrorMessages,
    } = useWhatsappMessageLogs();

    return (
        <div className="max-w-5xl space-y-4">
            <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-4">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Logs WhatsApp</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    Auditoria de mensagens e handoffs IA/Humano.
                </p>
            </div>

            <Tabs defaultValue="messages" className="glass rounded-xl border border-slate-200 dark:border-white/10">
                <div className="p-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                    <TabsList>
                        <TabsTrigger value="messages">Mensagens</TabsTrigger>
                        <TabsTrigger value="handoffs">Handoffs</TabsTrigger>
                    </TabsList>
                    {isLoadingMessages && <span className="text-xs text-slate-500">Carregando...</span>}
                </div>

                <TabsContent value="messages" className="p-0">
                    {isErrorMessages && (
                        <div className="p-3 text-sm text-red-600 dark:text-red-300">
                            Erro ao carregar logs de mensagens.
                        </div>
                    )}
                    <div className="divide-y divide-slate-200 dark:divide-white/10">
                        {(messageLogs || []).map((log) => (
                            <div key={log.id} className="p-3 text-sm text-slate-800 dark:text-slate-100">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-semibold">
                                        {log.conversation?.contactName || log.conversation?.phoneNumber || 'Conversa'}
                                    </div>
                                    <div className="text-xs text-slate-500">{formatDate(log.occurredAt)}</div>
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                    {formatDirection(log.direction)} · status: {formatStatus(log.status)}
                                </div>
                                <div className="text-sm text-slate-700 dark:text-slate-200 mt-1">
                                    {clipText(log.text)}
                                </div>
                                {log.error && (
                                    <div className="text-xs text-red-600 dark:text-red-300 mt-1">Erro: {log.error}</div>
                                )}
                            </div>
                        ))}
                        {!isLoadingMessages && (messageLogs || []).length === 0 && (
                            <div className="p-3 text-sm text-slate-500">Nenhum log de mensagem.</div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="handoffs" className="p-0">
                    <div className="p-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                        <span className="text-sm text-slate-700 dark:text-slate-200">Ultimos handoffs</span>
                        {isLoading && <span className="text-xs text-slate-500">Carregando...</span>}
                    </div>
                    {isError && (
                        <div className="p-3 text-sm text-red-600 dark:text-red-300">Erro ao carregar handoffs.</div>
                    )}
                    <div className="divide-y divide-slate-200 dark:divide-white/10">
                        {(handoffs || []).map((log) => (
                            <div key={log.id} className="p-3 text-sm text-slate-800 dark:text-slate-100">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-semibold">
                                        {log.conversation?.contactName || log.conversation?.phoneNumber || 'Conversa'}
                                    </div>
                                    <div className="text-xs text-slate-500">{formatDate(log.createdAt)}</div>
                                </div>
                                <div className="text-xs text-slate-500">
                                    {log.from || 'ai'} → {log.to || 'human'} ({log.reason || 'sem motivo'})
                                </div>
                                {log.by && <div className="text-xs text-slate-500">Por: {log.by}</div>}
                            </div>
                        ))}
                        {!isLoading && (handoffs || []).length === 0 && (
                            <div className="p-3 text-sm text-slate-500">Nenhum handoff registrado.</div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};
