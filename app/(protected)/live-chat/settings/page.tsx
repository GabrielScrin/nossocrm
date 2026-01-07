import { Suspense } from 'react';
import { WhatsAppSettingsPage } from '@/features/whatsapp/SettingsPage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function LiveChatSettingsPage() {
    return (
        <Suspense fallback={<div className="text-sm text-slate-500">Carregando...</div>}>
            <WhatsAppSettingsPage />
        </Suspense>
    );
}
