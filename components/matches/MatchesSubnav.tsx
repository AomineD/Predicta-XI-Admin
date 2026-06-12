'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Sub-navigation for the Matches section: switches between the full match list
 * ("List") and the Home featured-matches manager ("Featured"). Route-based
 * (Link), not a state toggle, so each subsection has its own URL.
 */
const ITEMS = [
  { href: '/matches', label: 'List' },
  { href: '/matches/featured', label: 'Featured' },
];

export function MatchesSubnav() {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      aria-label="Matches sections"
      className="flex items-center gap-1 mb-6 w-fit rounded-2xl p-1"
      style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {ITEMS.map((item) => {
        const active =
          item.href === '/matches'
            ? pathname === '/matches'
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            role="tab"
            aria-selected={active}
            className={cn(
              'whitespace-nowrap inline-flex items-center px-4 h-9 rounded-xl text-xs font-sans font-medium transition-colors',
              active
                ? 'bg-surface-3 text-text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-3/50',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
