"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDisconnectWhatsapp, useWhatsappAccounts } from './hooks';

type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

function formatDate(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export const WhatsAppSettingsPage: React.FC = () => {
  const search = useSearchParams();
  const connected = search.get('connected') === '1';
  const { data: accounts, isLoading } = useWhatsappAccounts();
  const disconnectMutation = useDisconnectWhatsapp();
  const [status, setStatus] = useState<Status>({ type: 'idle' });

  const activeAccount = useMemo(
    () => (accounts || []).find((acc) => acc.status === 'active') || null,
    [accounts]
  );

  useEffect(() => {
    if (connected) {
      setStatus({ type: 'success', message: 'Conta conectada. Selecione o webhook na Meta usando o verify_token.' });
    }
  }, [connected]);

  const handleConnect = () => {
    setStatus({ type: 'loading', message: 'Redirecionando para o login da Meta...' });
    window.location.href = '/api/whatsapp/connect';
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Deseja desconectar o WhatsApp desta organizacao?')) return;
    try {
      await disconnectMutation.mutateAsync();
      setStatus({ type: 'success', message: 'WhatsApp desconectado com sucesso.' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao desconectar.' });
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Configuracao do Canal WhatsApp</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Conecte sua conta WhatsApp Business (Cloud API). Os tokens sao armazenados no servidor por organizacao.
        </p>

        {activeAccount && (
          <div className="mt-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-100">
            <div className="font-semibold">Conta conectada</div>
            <div>Numero: {activeAccount.phone_number}</div>
            <div>Conectado em: {formatDate(activeAccount.created_at)}</div>
          </div>
        )}

        {status.type !== 'idle' && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              status.type === 'success'
                ? 'border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-100'
                : status.type === 'error'
                ? 'border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200'
                : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200'
            }`}
          >
            {status.message}
          </div>
        )}
      </div>

      <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Conexao</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          O login e feito via Meta OAuth (HTTPS). O usuario seleciona o WhatsApp Business e autoriza o CR8.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleConnect}
            disabled={status.type === 'loading'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-semibold shadow hover:bg-primary-700 transition-colors focus-visible-ring disabled:opacity-50"
          >
            {activeAccount ? 'Reautorizar' : 'Conectar com Facebook'}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={!activeAccount || disconnectMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible-ring disabled:opacity-50"
          >
            Desconectar
          </button>
          {isLoading && <span className="text-xs text-slate-500">Carregando estado...</span>}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          QR code estilo WhatsApp Web nao e suportado pela Cloud API; e necessario usar OAuth do Facebook/Meta.
        </div>
      </div>

      <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-5 space-y-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Passos minimos</h2>
        <ol className="list-decimal pl-5 text-sm text-slate-700 dark:text-slate-200 space-y-2">
          <li>Crie um app na Meta Developers e configure o WhatsApp Embedded Signup.</li>
          <li>Clique em Conectar para selecionar o WABA e o numero.</li>
          <li>Configure o webhook na Meta para <code>/api/whatsapp/webhook</code> usando o verify_token gerado.</li>
          <li>Teste enviando uma mensagem; o contato/lead sera criado automaticamente.</li>
        </ol>
      </div>
    </div>
  );
};

