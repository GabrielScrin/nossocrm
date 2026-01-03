import React, { useMemo, useState } from 'react';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { useAnalyticsSummary } from './hooks/useAnalytics';
import { DollarSign, MousePointer2, TrendingUp, CheckCircle2, LineChart, Activity } from 'lucide-react';

type Period = '7d' | '30d' | '90d';

function getDateRange(period: Period) {
    const end = new Date();
    const start = new Date(end);
    if (period === '7d') start.setDate(end.getDate() - 6);
    if (period === '30d') start.setDate(end.getDate() - 29);
    if (period === '90d') start.setDate(end.getDate() - 89);

    const to = end.toISOString().slice(0, 10);
    const from = start.toISOString().slice(0, 10);
    return { from, to };
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function formatNumber(value: number) {
    return value.toLocaleString('pt-BR');
}

function formatPercent(value: number) {
    return `${value.toFixed(2)}%`;
}

const PERIOD_LABELS: Record<Period, string> = {
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
    '90d': 'Últimos 90 dias',
};

const AnalyticsPage: React.FC = () => {
    const [period, setPeriod] = useState<Period>('7d');
    const range = useMemo(() => getDateRange(period), [period]);
    const { data, isLoading, isError, error } = useAnalyticsSummary(range);

    const metrics = data?.metrics || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        leads: 0,
        mqls: 0,
        opportunities: 0,
        sales: 0,
        revenue: 0,
        cpl: 0,
        roas: 0,
    };

    const funnel = data?.funnel || {
        impression: 0,
        click: 0,
        lead: 0,
        mql: 0,
        opportunity: 0,
        sale: 0,
    };

    const hasData = metrics.spend > 0 || metrics.leads > 0 || metrics.sales > 0;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Analytics • Funil unificado</p>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Mídia + Conversões</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Período: {range.from} até {range.to}
                    </p>
                </div>
                <div className="flex gap-2">
                    {(['7d', '30d', '90d'] as Period[]).map((p) => {
                        const active = p === period;
                        return (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${active
                                    ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                                    }`}
                            >
                                {PERIOD_LABELS[p]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {isError && (
                <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                    Erro ao carregar analytics: {error instanceof Error ? error.message : 'desconhecido'}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <StatCard
                    title="Investimento"
                    value={formatCurrency(metrics.spend)}
                    subtext={`ROAS ${metrics.roas.toFixed(2)}x`}
                    subtextPositive={metrics.roas >= 1}
                    icon={DollarSign}
                    color="bg-blue-500"
                />
                <StatCard
                    title="Leads"
                    value={formatNumber(metrics.leads)}
                    subtext={`CPL ${formatCurrency(metrics.cpl || 0)}`}
                    subtextPositive={metrics.cpl > 0 ? metrics.cpl <= 50 : true}
                    icon={MousePointer2}
                    color="bg-emerald-500"
                />
                <StatCard
                    title="MQLs"
                    value={formatNumber(metrics.mqls)}
                    subtext={`% MQL ${(metrics.leads > 0 ? (metrics.mqls / metrics.leads) * 100 : 0).toFixed(1)}%`}
                    subtextPositive
                    icon={Activity}
                    color="bg-purple-500"
                />
                <StatCard
                    title="Vendas"
                    value={formatNumber(metrics.sales)}
                    subtext={`Receita ${formatCurrency(metrics.revenue)}`}
                    subtextPositive={metrics.revenue >= metrics.spend}
                    icon={CheckCircle2}
                    color="bg-green-500"
                />
                <StatCard
                    title="CTR"
                    value={formatPercent(metrics.ctr)}
                    subtext={`CPC ${formatCurrency(metrics.cpc || 0)}`}
                    subtextPositive={metrics.ctr >= 1}
                    icon={TrendingUp}
                    color="bg-orange-500"
                />
                <StatCard
                    title="CPM"
                    value={formatCurrency(metrics.cpm || 0)}
                    subtext={`Impressões ${formatNumber(metrics.impressions)}`}
                    subtextPositive
                    icon={LineChart}
                    color="bg-amber-500"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Funil</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Eventos consolidados no período</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                            { label: 'Impressões', value: funnel.impression || metrics.impressions },
                            { label: 'Cliques', value: funnel.click || metrics.clicks },
                            { label: 'Leads', value: funnel.lead || metrics.leads },
                            { label: 'MQLs', value: funnel.mql || metrics.mqls },
                            { label: 'Oportunidades', value: funnel.opportunity || metrics.opportunities },
                            { label: 'Vendas', value: funnel.sale || metrics.sales },
                        ].map((item) => (
                            <div key={item.label} className="p-4 rounded-lg border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5">
                                <p className="text-sm text-slate-500 dark:text-slate-400">{item.label}</p>
                                <p className="text-xl font-semibold text-slate-900 dark:text-white">{formatNumber(item.value)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass rounded-xl border border-slate-200 dark:border-white/10 p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Qualidade de Mídia</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Indicadores rápidos</p>
                        </div>
                    </div>
                    <ul className="space-y-3">
                        <li className="flex items-center justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">ROAS</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{metrics.roas.toFixed(2)}x</span>
                        </li>
                        <li className="flex items-center justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">CPL</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(metrics.cpl || 0)}</span>
                        </li>
                        <li className="flex items-center justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">CPC</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(metrics.cpc || 0)}</span>
                        </li>
                        <li className="flex items-center justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">CPM</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(metrics.cpm || 0)}</span>
                        </li>
                    </ul>
                </div>
            </div>

            {!isLoading && !hasData && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 text-slate-600 dark:text-slate-300">
                    Nenhum dado de mídia/funil para o período selecionado. Importe dados ou ajuste o intervalo.
                </div>
            )}
        </div>
    );
};

export default AnalyticsPage;
