"use client";

import { Suspense } from 'react';
import { WhatsAppSettingsPage } from '@/features/whatsapp/SettingsPage';

export default function WhatsAppSettingsRoute() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Carregando...</div>}>
      <WhatsAppSettingsPage />
    </Suspense>
  );
}
