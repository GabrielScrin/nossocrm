"use client";

import React, { useMemo, useState } from 'react';
import { Loader2, Send, Bot, User, AlertTriangle } from 'lucide-react';
import {
    useSendWhatsappMessage,
    useToggleWhatsappAI,
    useWhatsappConversations,
    useWhatsappMessages,
    Conversation,
    Message,
} from './hooks';

function formatDate(value?: string | null) {
    if (!value) return '';
    const d = new Date(value);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const ConversationItem: React.FC<{
    item: Conversation;
    active: boolean;
    onSelect: () => void;
}> = ({ item, active, onSelect }) => {
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left rounded-lg px-3 py-2 border transition-colors focus-visible-ring ${
                active
                    ? 'border-primary-300 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10 text-primary-900 dark:text-primary-100'
                    : 'border-transparent hover:border-slate-200 dark:hover:border-white/10 text-slate-700 dark:text-slate-200'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="font-semibold truncate">{item.contact?.name || item.phoneNumber}</div>
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.lastMessageAt)}</span>
            </div>
            {item.lastMessage?.text && (
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                    {item.lastMessage?.direction === 'out' ? 'Você: ' : ''}
                    {item.lastMessage.text}
                </p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                {item.aiEnabled ? (
                    <>
                        <Bot size={14} className="text-emerald-500" /> IA ON
                    </>
                ) : (
                    <>
                        <User size={14} className="text-amber-500" /> Humano
                    </>
                )}
            </div>
        </button>
    );
};

const MessageBubble: React.FC<{ msg: Message }> = ({ msg }) => {
    const isOut = msg.direction === 'out';
    return (
        <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    isOut
                        ? 'bg-primary-600 text-white rounded-br-md'
                        : 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-slate-100 rounded-bl-md'
                }`}
            >
                {msg.text || '(sem texto)'}
                <div className="text-[11px] opacity-70 mt-1">{formatDate(msg.created_at)}</div>
            </div>
        </div>
    );
};

export const WhatsAppPage: React.FC = () => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const { data: conversations, isLoading, isError } = useWhatsappConversations();
    const activeId = selectedId || conversations?.[0]?.id || null;
    const { data: thread, isLoading: loadingThread } = useWhatsappMessages(activeId || undefined);
    const sendMutation = useSendWhatsappMessage();
    const toggleMutation = useToggleWhatsappAI();

    const activeConversation = useMemo(() => {
        if (!activeId || !conversations) return null;
        return conversations.find((c) => c.id === activeId) || null;
    }, [activeId, conversations]);

    const handleSend = async () => {
        if (!activeId || !draft.trim()) return;
        await sendMutation.mutateAsync({ conversationId: activeId, text: draft.trim() });
        setDraft('');
    };

    const toggleAI = async (enabled: boolean) => {
        if (!activeId) return;
        await toggleMutation.mutateAsync({ conversationId: activeId, enabled });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-full">
            <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-3 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Conversas</h2>
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                </div>
                {isError && (
                    <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2">
                        Erro ao carregar conversas
                    </div>
                )}
                <div className="space-y-2 overflow-y-auto">
                    {(conversations || []).map((c) => (
                        <ConversationItem
                            key={c.id}
                            item={c}
                            active={c.id === activeId}
                            onSelect={() => setSelectedId(c.id)}
                        />
                    ))}
                    {!isLoading && (conversations || []).length === 0 && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma conversa WhatsApp.</p>
                    )}
                </div>
            </div>

            <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-4 flex flex-col min-h-[70vh]">
                {loadingThread && (
                    <div className="flex-1 flex items-center justify-center text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Carregando conversa...
                    </div>
                )}
                {!loadingThread && thread && (
                    <>
                        <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-white/10">
                            <div>
                                <p className="text-sm text-slate-500">WhatsApp</p>
                                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                                    {thread.conversation.contact?.name || thread.conversation.phoneNumber}
                                </h3>
                                <p className="text-xs text-slate-500">{thread.conversation.phoneNumber}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => toggleAI(!thread.conversation.aiEnabled)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors focus-visible-ring ${
                                        thread.conversation.aiEnabled
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-800'
                                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800'
                                    }`}
                                    disabled={toggleMutation.isPending}
                                >
                                    {thread.conversation.aiEnabled ? 'IA ON' : 'Humano'}
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 py-4">
                            {(thread.messages || []).map((m) => (
                                <MessageBubble key={m.id} msg={m as Message} />
                            ))}
                            {thread.messages?.length === 0 && (
                                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma mensagem ainda.</p>
                            )}
                        </div>

                        <div className="border-t border-slate-200 dark:border-white/10 pt-3">
                            {toggleMutation.isError && (
                                <div className="text-xs text-red-600 dark:text-red-300 mb-2 flex items-center gap-1">
                                    <AlertTriangle size={14} /> Erro ao alternar IA
                                </div>
                            )}
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder="Digite uma mensagem..."
                                    className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus-visible-ring"
                                    rows={2}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={sendMutation.isPending || !draft.trim()}
                                    className="h-10 w-12 rounded-lg bg-primary-600 text-white flex items-center justify-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Enviar"
                                >
                                    {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={16} />}
                                </button>
                            </div>
                        </div>
                    </>
                )}
                {!loadingThread && !thread && (
                    <div className="flex-1 flex items-center justify-center text-slate-500 dark:text-slate-400">
                        Selecione uma conversa.
                    </div>
                )}
            </div>
        </div>
    );
};
