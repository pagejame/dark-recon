'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  ListChecks,
  CheckSquare,
  Radar,
  Zap,
  Calendar,
  Brain,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  BarChart2,
  Bell,
  Radio,
  Trophy,
  LineChart,
  Layers,
  Rocket,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/autopilot', label: 'Autopilot', icon: Bot },
  { href: '/queue', label: 'Trade Queue', icon: ListChecks },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/strategy', label: 'Strategy', icon: LineChart },
  { href: '/smartmoney', label: 'Smart Money', icon: TrendingUp },
  { href: '/intelligence', label: 'Intelligence', icon: Radio },
  { href: '/recon', label: 'Recon Feed', icon: Radar },
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/earnings', label: 'Earnings', icon: Calendar },
  { href: '/thesis', label: 'Thesis Builder', icon: Brain },
  { href: '/options', label: 'Options', icon: Layers },
  { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/scoreboard', label: 'Scoreboard', icon: Trophy },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/journal', label: 'Trade Journal', icon: BookOpen },
  { href: '/audit', label: 'Audit Log', icon: Shield },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/launch', label: 'Launch Checklist', icon: Rocket },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-bg-secondary transition-all duration-300 max-md:hidden min-h-screen',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        {!collapsed && (
          <span className="font-mono text-sm font-bold tracking-wider text-text-primary">
            DARK RECON
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-accent-green-dim text-accent-green'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
