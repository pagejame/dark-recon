'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  TrendingUp,
  Search,
  MoreHorizontal,
  X,
  Crosshair,
  Brain,
  Radio,
  BarChart3,
  DollarSign,
  Bell,
  BookOpen,
  Trophy,
  Settings,
  Shield,
  Cpu,
  LineChart,
  FileText,
  Eye,
  ListChecks,
  Rocket,
  CheckSquare,
} from 'lucide-react';

const PRIMARY_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agent', label: 'Agent', icon: Bot },
  { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
  { href: '/scanner', label: 'Scanner', icon: Search },
];

const ALL_NAV = [
  {
    section: 'TRADING',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
      { href: '/queue', label: 'Trade Queue', icon: ListChecks },
      { href: '/alerts', label: 'Alerts', icon: Bell },
      { href: '/journal', label: 'Trade Journal', icon: BookOpen },
    ],
  },
  {
    section: 'INTELLIGENCE',
    items: [
      { href: '/agent', label: 'Agent', icon: Bot },
      { href: '/scanner', label: 'Market Scanner', icon: Search },
      { href: '/signals', label: 'Signals', icon: Radio },
      { href: '/intelligence', label: 'Intelligence', icon: Brain },
      { href: '/recon', label: 'Recon Feed', icon: Eye },
      { href: '/smartmoney', label: 'Smart Money', icon: DollarSign },
      { href: '/earnings', label: 'Earnings', icon: BarChart3 },
      { href: '/thesis', label: 'Thesis Builder', icon: FileText },
      { href: '/options', label: 'Options', icon: LineChart },
      { href: '/autopilot', label: 'Autopilot', icon: Cpu },
    ],
  },
  {
    section: 'ANALYTICS',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/scoreboard', label: 'Scoreboard', icon: Trophy },
      { href: '/strategy', label: 'Strategy', icon: Crosshair },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { href: '/audit', label: 'Audit Log', icon: Shield },
      { href: '/launch', label: 'Launch Checklist', icon: Rocket },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav
        className="md:hidden"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 64,
          background: '#0d1117',
          borderTop: '1px solid #1e2a3a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'env(safe-area-inset-bottom)',
          zIndex: 100,
        }}
      >
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: active ? '#00ff88' : '#3d5068',
                minWidth: 56,
              }}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 1,
                  color: active ? '#00ff88' : '#3d5068',
                }}
              >
                {item.label.toUpperCase()}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: drawerOpen ? '#00ff88' : '#3d5068',
            minWidth: 56,
          }}
        >
          <MoreHorizontal size={22} strokeWidth={1.5} />
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              color: drawerOpen ? '#00ff88' : '#3d5068',
            }}
          >
            MORE
          </span>
        </button>
      </nav>

      {drawerOpen && (
        <div
          className="md:hidden"
          style={{
            position: 'fixed',
            inset: 0,
            background: '#080a0f',
            zIndex: 200,
            overflowY: 'auto',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 20px 16px',
              borderBottom: '1px solid #1e2a3a',
              position: 'sticky',
              top: 0,
              background: '#080a0f',
              zIndex: 1,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 4,
                  color: '#00ff88',
                  marginBottom: 2,
                }}
              >
                ◆ DARK RECON
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#e8edf5',
                }}
              >
                Navigation
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#7a8fa8',
                padding: 8,
              }}
            >
              <X size={24} />
            </button>
          </div>

          <div style={{ padding: '16px 16px 100px' }}>
            {ALL_NAV.map((section) => (
              <div key={section.section} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 8,
                    letterSpacing: 3,
                    color: '#3d5068',
                    marginBottom: 8,
                    paddingLeft: 4,
                  }}
                >
                  {section.section}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 8,
                  }}
                >
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => {
                          router.push(item.href);
                          setDrawerOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '12px 14px',
                          background: active ? '#00ff8810' : '#111620',
                          border: `1px solid ${active ? '#00ff8840' : '#1e2a3a'}`,
                          borderRadius: 10,
                          cursor: 'pointer',
                          textAlign: 'left',
                          minWidth: 0,
                        }}
                      >
                        <Icon
                          size={16}
                          color={active ? '#00ff88' : '#7a8fa8'}
                          strokeWidth={active ? 2.5 : 1.5}
                        />
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 10,
                            color: active ? '#00ff88' : '#e8edf5',
                            letterSpacing: 0.5,
                          }}
                        >
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
