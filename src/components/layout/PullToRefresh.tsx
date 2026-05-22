'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const PULL_THRESHOLD = 72;

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const [pulling, setPulling] = useState(false);
  const [pullY, setPullY] = useState(0);
  const startY = useRef(0);
  const pullYRef = useRef(0);
  const triggered = useRef(false);

  useEffect(() => {
    const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobile() || window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      triggered.current = false;
      pullYRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isMobile() || startY.current === 0 || triggered.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY === 0) {
        const clamped = Math.min(delta, 100);
        pullYRef.current = clamped;
        setPulling(true);
        setPullY(clamped);
        if (delta > PULL_THRESHOLD) {
          triggered.current = true;
        }
      }
    };

    const onTouchEnd = () => {
      if (!isMobile()) return;
      if (triggered.current && pullYRef.current >= PULL_THRESHOLD) {
        window.dispatchEvent(new CustomEvent('dark-recon-refresh'));
      }
      startY.current = 0;
      pullYRef.current = 0;
      setPulling(false);
      setPullY(0);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <>
      {pulling && pullY > 20 && (
        <div
          className="pointer-events-none fixed left-0 right-0 top-14 z-30 flex justify-center md:hidden"
          style={{ opacity: Math.min(pullY / PULL_THRESHOLD, 1) }}
        >
          <span className="rounded-full border border-border bg-bg-card px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-accent-green">
            {pullY >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}
      {children}
    </>
  );
}
