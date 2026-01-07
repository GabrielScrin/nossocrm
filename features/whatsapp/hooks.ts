import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';

export type Conversation = {
    id: string;
    phoneNumber: string;
    aiEnabled: boolean;
    status?: string | null;
    contact?: { id: string; name: string | null } | null;
    lastMessageAt?: string | null;
    lastMessage?: { text?: string | null; direction?: string | null; created_at?: string | null } | null;
};

export type Message = {
    id: string;
    direction: 'in' | 'out';
    text?: string | null;
    status?: string | null;
    created_at: string;
};

export function useWhatsappConversations() {
    return useQuery({
        queryKey: queryKeys.whatsapp.conversations(),
        queryFn: async () => {
            const res = await fetch('/api/whatsapp/conversations', { credentials: 'include' });
            if (!res.ok) throw new Error('Falha ao carregar conversas');
            const json = await res.json();
            return (json.conversations || []) as Conversation[];
        },
        staleTime: 10_000,
    });
}

export function useWhatsappMessages(conversationId?: string) {
    return useQuery({
        enabled: !!conversationId,
        queryKey: conversationId ? queryKeys.whatsapp.messages(conversationId) : [],
        queryFn: async () => {
            const res = await fetch(`/api/whatsapp/conversations/${conversationId}/messages`, { credentials: 'include' });
            if (!res.ok) throw new Error('Falha ao carregar mensagens');
            return res.json() as Promise<{ conversation: Conversation; messages: Message[] }>;
        },
    });
}

export function useSendWhatsappMessage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: { conversationId: string; text: string }) => {
            const res = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include',
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || 'Erro ao enviar mensagem');
            }
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.whatsapp.messages(variables.conversationId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.whatsapp.conversations() });
        },
    });
}

export function useToggleWhatsappAI() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: { conversationId: string; enabled: boolean }) => {
            const res = await fetch(`/api/whatsapp/conversations/${payload.conversationId}/ai`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: payload.enabled }),
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Erro ao atualizar IA');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.whatsapp.conversations() });
            queryClient.invalidateQueries({ queryKey: queryKeys.whatsapp.messages(variables.conversationId) });
        },
    });
}

export function useWhatsappLogs() {
    return useQuery({
        queryKey: ['whatsapp', 'logs'],
        queryFn: async () => {
            const res = await fetch('/api/whatsapp/logs', { credentials: 'include' });
            if (!res.ok) throw new Error('Falha ao carregar logs');
            const json = await res.json();
            return json.logs as {
                id: string;
                from: string | null;
                to: string | null;
                reason: string | null;
                createdAt: string;
                conversation: { id: string; phoneNumber: string; contactName?: string | null } | null;
                by?: string | null;
            }[];
        },
        staleTime: 10_000,
    });
}

