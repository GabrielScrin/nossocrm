'use client'

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/PageLoader';

const AnalyticsPage = dynamic(
    () => import('@/features/analytics/AnalyticsPage'),
    {
        loading: () => <PageLoader />,
        ssr: false,
    }
);

export default function Analytics() {
    return <AnalyticsPage />;
}
