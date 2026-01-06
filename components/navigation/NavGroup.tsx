import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { prefetchRoute, type RouteName } from '@/lib/prefetch';

export type NavChild = {
  to: string;
  label: string;
  icon: LucideIcon;
  prefetch?: RouteName;
  aliases?: string[];
};

export type NavGroupProps = {
  label: string;
  icon: LucideIcon;
  items: NavChild[];
  activePath: string;
  collapsed?: boolean;
  onNavigate?: (path: string) => void;
  clickedPath?: string;
};

function isActivePath(child: NavChild, activePath: string, clickedPath?: string) {
  const isAlias =
    child.aliases?.some((alias) => alias === activePath) ||
    (child.to === '/boards' && activePath === '/pipeline') ||
    (child.to === '/pipeline' && activePath === '/boards');
  const isDirect = activePath === child.to;
  const wasJustClicked = clickedPath === child.to;

  if (clickedPath && clickedPath !== child.to) return false;
  return isDirect || isAlias || wasJustClicked;
}

export const NavGroup: React.FC<NavGroupProps> = ({
  label,
  icon: Icon,
  items,
  activePath,
  collapsed = false,
  onNavigate,
  clickedPath,
}) => {
  const [open, setOpen] = useState(() => items.some((c) => isActivePath(c, activePath, clickedPath)));

  useEffect(() => {
    if (items.some((c) => isActivePath(c, activePath, clickedPath))) {
      setOpen(true);
    }
  }, [activePath, clickedPath, items]);

  const groupId = `nav-group-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${groupId}-items`}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible-ring ${
          open
            ? 'bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
        } ${collapsed ? 'px-2 justify-center' : ''}`}
      >
        <span className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <Icon size={18} aria-hidden="true" />
          {!collapsed && <span className="font-display tracking-wide">{label}</span>}
        </span>
        {!collapsed && (
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>

      <div id={`${groupId}-items`} className={`${open ? 'block' : 'hidden'} pl-2 space-y-1`} aria-hidden={!open}>
        {open && (
          items.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 px-3 py-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
              Sem itens disponíveis
            </div>
          ) : (
            items.map((child) => {
              const active = isActivePath(child, activePath, clickedPath);
              return (
                <Link
                  key={child.to}
                  href={child.to}
                  onMouseEnter={child.prefetch ? () => prefetchRoute(child.prefetch!) : undefined}
                  onFocus={child.prefetch ? () => prefetchRoute(child.prefetch!) : undefined}
                  onClick={() => onNavigate?.(child.to)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible-ring ${
                    active
                      ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-900/50'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  } ${collapsed ? 'justify-center' : ''}`}
                  data-active={active ? 'true' : 'false'}
                >
                  <child.icon size={18} aria-hidden="true" />
                  {!collapsed && <span className="font-display">{child.label}</span>}
                </Link>
              );
            })
          )
        )}
      </div>
    </div>
  );
};
