import React from 'react';
import { ContactStage } from '@/types';
import { Users, UserCheck, Handshake, Crown, Archive } from 'lucide-react';

interface StageCounts {
  LEAD: number;
  MQL: number;
  PROSPECT: number;
  CUSTOMER: number;
  OTHER: number;
}

interface ContactsStageTabs {
  activeStage: ContactStage | 'ALL';
  onStageChange: (stage: ContactStage | 'ALL') => void;
  counts: StageCounts;
}

const STAGE_CONFIG = {
  LEAD: {
    label: 'Leads',
    icon: Users,
    color: 'bg-slate-500',
    activeColor:
      'bg-slate-900/30 dark:bg-slate-900/40 text-white border-2 border-slate-300 dark:border-slate-100 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]',
  },
  MQL: {
    label: 'MQL',
    icon: UserCheck,
    color: 'bg-blue-500',
    activeColor:
      'bg-slate-900/30 dark:bg-slate-900/40 text-white border-2 border-blue-400 dark:border-blue-300 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]',
  },
  PROSPECT: {
    label: 'Prospects',
    icon: Handshake,
    color: 'bg-purple-500',
    activeColor:
      'bg-slate-900/30 dark:bg-slate-900/40 text-white border-2 border-purple-400 dark:border-purple-300 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]',
  },
  CUSTOMER: {
    label: 'Clientes',
    icon: Crown,
    color: 'bg-green-500',
    activeColor:
      'bg-slate-900/30 dark:bg-slate-900/40 text-white border-2 border-green-400 dark:border-green-300 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]',
  },
  OTHER: {
    label: 'Outros / Perdidos',
    icon: Archive,
    color: 'bg-slate-500',
    activeColor:
      'bg-slate-900/30 dark:bg-slate-900/40 text-white border-2 border-slate-300 dark:border-slate-100 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]',
  },
};

/**
 * Componente React `ContactsStageTabs`.
 *
 * @param {ContactsStageTabs} {
  activeStage,
  onStageChange,
  counts,
} - Parâmetro `{
  activeStage,
  onStageChange,
  counts,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ContactsStageTabs: React.FC<ContactsStageTabs> = ({
  activeStage,
  onStageChange,
  counts,
}) => {
  const total = counts.LEAD + counts.MQL + counts.PROSPECT + counts.CUSTOMER + (counts.OTHER || 0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* All */}
      <button
        onClick={() => onStageChange('ALL')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
          activeStage === 'ALL'
            ? 'bg-slate-900/30 dark:bg-slate-900/40 text-white border-2 border-primary-400 dark:border-primary-300 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
            : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'
        }`}
      >
        Todos
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full ${
            activeStage === 'ALL'
              ? 'bg-primary-200 dark:bg-primary-500/30'
              : 'bg-slate-100 dark:bg-white/10'
          }`}
        >
          {total}
        </span>
      </button>

      {/* Stage Tabs */}
      {Object.entries(STAGE_CONFIG).map(([stage, config]) => {
        const Icon = config.icon;
        const count = counts[stage as keyof StageCounts];
        const isActive = activeStage === stage;

        return (
          <button
            key={stage}
            onClick={() => onStageChange(stage as ContactStage)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              isActive
                ? config.activeColor
                : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
          >
            <Icon size={16} />
            {config.label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-white/50 dark:bg-white/10' : 'bg-slate-100 dark:bg-white/10'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// Badge de estágio para usar nas rows
/**
 * Componente React `StageBadge`.
 *
 * @param {{ stage: string; }} { stage } - Parâmetro `{ stage }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const StageBadge: React.FC<{ stage: ContactStage | string }> = ({ stage }) => {
  const config = STAGE_CONFIG[stage];

  if (!config) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        {stage}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${config.activeColor}`}
    >
      {config.label}
    </span>
  );
};
