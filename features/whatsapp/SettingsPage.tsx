"use client";

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

declare global {
    interface Window {
        FB?: any;
    }
}

type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

export const WhatsAppSettingsPage: React.FC = () => {
    const search = useSearchParams();
    const connected = search.get('connected') === '1';
    const [sdkReady, setSdkReady] = useState(false);
    const [status, setStatus] = useState<Status>({ type: 'idle' });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.FB) {
            setSdkReady(true);
            return;
        }
        const script = document.createElement('script');
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.onload = () => {
            if (window.FB) {
                window.FB.init({
                    appId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID,
                    cookie: true,
                    xfbml: false,
                    version: 'v21.0',
                });
                setSdkReady(true);
            }
        };
        document.body.appendChild(script);
    }, []);

    const handleEmbeddedSignup = () => {
        if (!window.FB || !sdkReady) {
            setStatus({ type: 'error', message: 'SDK do Facebook não carregou ainda.' });
            return;
        }
        setStatus({ type: 'loading', message: 'Abrindo popup do Facebook...' });
        window.FB.login(
            async (response: any) => {
                if (response?.authResponse?.code) {
                    try {
                        setStatus({ type: 'loading', message: 'Trocando código por token...' });
                        const res = await fetch('/api/whatsapp/facebook/exchange', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ code: response.authResponse.code }),
                        });
                        const body = await res.json();
                        if (!res.ok) throw new Error(body?.error || 'Falha na troca de token');
                        setStatus({
                            type: 'success',
                            message: `Conectado: ${body.phone_number || 'numero'}. Configure o webhook com verify_token gerado.`,
                        });
                    } catch (err) {
                        setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' });
                    }
                } else {
                    setStatus({ type: 'error', message: 'Login cancelado ou sem código retornado.' });
                }
            },
            {
                scope: 'whatsapp_business_management,whatsapp_business_messaging',
                extras: {
                    feature: 'whatsapp_embedded_signup',
                    setup: {},
                },
            }
        );
    };

    return (
        <div className="max-w-3xl space-y-4">
            <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-5">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Configuracao do Canal WhatsApp</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Conecte sua conta WhatsApp Business (Cloud API). Os tokens sao armazenados no servidor por organizacao.
                </p>
                {connected && (
                    <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-100">
                        Conta conectada com sucesso! Verifique o webhook na Meta usando o verify_token gerado.
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
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Passos minimos</h2>
                <ol className="list-decimal pl-5 text-sm text-slate-700 dark:text-slate-200 space-y-2">
                    <li>Crie um app na Meta Developers e configure o WhatsApp Embedded Signup.</li>
                    <li>Clique em <strong>Conectar com Facebook</strong> abaixo para buscar automaticamente o numero e gerar um verify_token.</li>
                    <li>Configure o webhook na Meta para <code>/api/whatsapp/webhook</code> usando o <strong>verify_token</strong> gerado.</li>
                    <li>Teste enviando uma mensagem; o contato/lead serao criados automaticamente.</li>
                </ol>
                <p className="text-sm text-amber-600 dark:text-amber-300">
                    Requer META_APP_ID, META_APP_SECRET, META_REDIRECT_URI e NEXT_PUBLIC_FACEBOOK_APP_ID configurados.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleEmbeddedSignup}
                        disabled={!sdkReady || status.type === 'loading'}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-semibold shadow hover:bg-primary-700 transition-colors focus-visible-ring disabled:opacity-50"
                    >
                        {status.type === 'loading' ? 'Conectando...' : 'Conectar com Facebook'}
                    </button>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        QR code estilo WhatsApp Web não é suportado pela Cloud API; é necessário usar OAuth do Facebook/Meta.
                    </div>
                </div>
            </div>
        </div>
    );
};

