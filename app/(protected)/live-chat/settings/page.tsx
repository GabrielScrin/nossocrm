"use client";

import { WhatsAppSettingsPage } from '@/features/whatsapp/SettingsPage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function LiveChatSettingsPage() {
    return <WhatsAppSettingsPage />;
}
