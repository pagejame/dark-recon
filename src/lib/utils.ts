import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function isMarketOpen(date: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);

  if (['Sat', 'Sun'].includes(weekday)) return false;

  const totalMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30;
  const closeMinutes = 16 * 60;

  return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}

export function getTimeUntilMarketOpen(date: Date = new Date()): { hours: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);

  let daysUntilOpen = 0;
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentDay = dayMap[weekday] ?? 0;

  if (currentDay === 0) daysUntilOpen = 1;
  else if (currentDay === 6) daysUntilOpen = 2;
  else if (hour > 16 || (hour === 16 && minute >= 0)) {
    if (currentDay === 5) daysUntilOpen = 3;
    else daysUntilOpen = 1;
  } else if (hour < 9 || (hour === 9 && minute < 30)) {
    daysUntilOpen = 0;
  }

  const targetMinutes = daysUntilOpen * 24 * 60 + (9 * 60 + 30) - (hour * 60 + minute);
  const normalized = targetMinutes <= 0 ? targetMinutes + 24 * 60 : targetMinutes;

  return {
    hours: Math.floor(normalized / 60),
    minutes: normalized % 60,
  };
}
