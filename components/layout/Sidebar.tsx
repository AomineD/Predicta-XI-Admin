'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { logout } from '@/app/actions/auth';
import {
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  Trophy,
  Shield,
  Settings,
  ClockIcon,
  Activity,
  Coins,
  Layers,
  Award,
  BarChart3,
  Share2,
  Users,
  Bell,
  Send,
  LogOut,
  ChevronDown,
  HeartPulse,
} from 'lucide-react';

type IconType = ComponentType<{ size?: number; className?: string }>;
type NavLeaf = { href: string; label: string; icon: IconType };
type NavGroup = { label: string; icon: IconType; items: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

// Grouped navigation. Standalone leaves render directly; groups collapse.
// New sections (Users, Monetization, Health, Audit Log, Sports data viewer)
// slot into their group as each plan phase lands.
const NAV: NavEntry[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  {
    label: 'Predictions',
    icon: Sparkles,
    items: [
      { href: '/predictions', label: 'Predictions', icon: Sparkles },
      { href: '/matches', label: 'Matches', icon: CalendarDays },
      { href: '/combinadas', label: 'Combinadas', icon: Layers },
      { href: '/models', label: 'Models', icon: BarChart3 },
      { href: '/consumo', label: 'Consumo', icon: Activity },
    ],
  },
  { href: '/quinielas', label: 'Quinielas', icon: Award },
  {
    label: 'Sports data',
    icon: Trophy,
    items: [
      { href: '/competitions', label: 'Competitions', icon: Trophy },
      { href: '/teams', label: 'Teams', icon: Shield },
    ],
  },
  {
    label: 'Business',
    icon: Coins,
    items: [
      { href: '/users', label: 'Users', icon: Users },
      { href: '/credits', label: 'Credits', icon: Coins },
      { href: '/referrals', label: 'Referrals', icon: Share2 },
    ],
  },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/telegram', label: 'Telegram', icon: Send },
  {
    label: 'System',
    icon: Settings,
    items: [
      { href: '/config', label: 'Config', icon: Settings },
      { href: '/jobs', label: 'Jobs', icon: ClockIcon },
      { href: '/health', label: 'Health', icon: HeartPulse },
    ],
  },
];

function isGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).items !== undefined;
}

function routeActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  indented = false,
}: NavLeaf & { active: boolean; indented?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
        indented ? 'pl-9 pr-3' : 'px-3',
        active
          ? 'bg-surface-3 text-text-primary'
          : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
      )}
    >
      <Icon size={indented ? 16 : 17} className={active ? 'text-primary' : 'text-text-muted'} />
      {label}
    </Link>
  );
}

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  const Icon = group.icon;
  const containsActive = group.items.some((i) => routeActive(i.href, pathname));
  // null = follow the active route (open iff it contains the current page);
  // true/false = the user's explicit toggle, which sticks for the session (the
  // sidebar lives in the layout and is not remounted across navigations).
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? containsActive;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
          'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
          containsActive && !open && 'text-text-primary',
        )}
      >
        <Icon size={17} className={containsActive ? 'text-primary' : 'text-text-muted'} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={15}
          className={cn('text-text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {group.items.map((item) => (
            <NavItem key={item.href} {...item} indented active={routeActive(item.href, pathname)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-56 flex-none flex flex-col border-r"
      style={{ background: '#121A2B', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <img src="/logo_sidebar.png" alt="Predicta XI" className="h-9 w-auto" />
        <span className="ml-2 text-xs text-text-muted font-sans uppercase tracking-widest">admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV.map((entry) =>
          isGroup(entry) ? (
            <NavGroupSection key={entry.label} group={entry} pathname={pathname} />
          ) : (
            <NavItem key={entry.href} {...entry} active={routeActive(entry.href, pathname)} />
          ),
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t space-y-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors w-full"
          >
            <LogOut size={17} className="text-text-muted" />
            Logout
          </button>
        </form>
        <p className="px-3 text-xs text-text-muted font-sans">v0.1 · Predicta XI</p>
      </div>
    </aside>
  );
}
