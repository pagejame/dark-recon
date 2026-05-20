'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Radar,
  Zap,
  Brain,
  BookOpen,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/recon', label: 'Recon', icon: Radar },
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/thesis', label: 'Thesis', icon: Brain },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-bg-secondary md:hidden">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] transition-colors',
              isActive ? 'text-accent-green' : 'text-text-muted'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
