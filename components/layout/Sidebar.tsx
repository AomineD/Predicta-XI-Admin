'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  Settings,
  ClockIcon,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',            label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/predictions', label: 'Predictions',  icon: Sparkles },
  { href: '/matches',     label: 'Matches',      icon: CalendarDays },
  { href: '/config',      label: 'Config',       icon: Settings },
  { href: '/jobs',        label: 'Jobs',         icon: ClockIcon },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-56 flex-none flex flex-col border-r"
      style={{ background: '#121A2B', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <span className="font-display text-lg font-semibold text-text-primary tracking-tight">
          Predicta <span className="text-primary">XI</span>
        </span>
        <span className="ml-2 text-xs text-text-muted font-sans uppercase tracking-widest">admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-surface-3 text-text-primary'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
              )}
            >
              <Icon size={17} className={active ? 'text-primary' : 'text-text-muted'} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t text-xs text-text-muted" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        v0.1 · Predicta XI
      </div>
    </aside>
  );
}
