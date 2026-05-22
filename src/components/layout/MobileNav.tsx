'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Zap,
  Brain,
  TrendingUp,
  BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/thesis', label: 'Thesis', icon: Brain },
  { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex w-full border-t border-border bg-[#0d1117] md:hidden mobile-safe-bottom"
      style={{ minHeight: 56 }}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex h-14 flex-1 flex-col items-center justify-center gap-0.5',
              isActive ? 'text-accent-green' : 'text-text-muted'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="font-mono text-[8px] uppercase tracking-wide">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
