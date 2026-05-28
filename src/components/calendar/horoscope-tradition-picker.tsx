// src/components/calendar/horoscope-tradition-picker.tsx
'use client';

import { cn } from '@/lib/utils';
import type { HoroscopeTradition } from './sincrometro-day-card';

const TRADITIONS: { id: HoroscopeTradition; label: string; glyph: string; color: string }[] = [
  { id: 'occidental', label: 'Occidental', glyph: '♈', color: '#fbbf24' },
  { id: 'chino',      label: 'Chino',      glyph: '龍', color: '#ef4444' },
  { id: 'vedico',     label: 'Védico',     glyph: 'ॐ', color: '#a78bfa' },
  { id: 'maya',       label: 'Maya',       glyph: '☉',  color: '#10b981' },
];

interface HoroscopeTraditionPickerProps {
  value: HoroscopeTradition;
  onChange: (v: HoroscopeTradition) => void;
  className?: string;
}

export function HoroscopeTraditionPicker({ value, onChange, className }: HoroscopeTraditionPickerProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 backdrop-blur p-1',
        className
      )}
      role="tablist"
      aria-label="Tradición astrológica"
    >
      {TRADITIONS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all flex items-center gap-1.5',
              active
                ? 'bg-white/[0.08] text-foreground shadow-inner'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
            style={active ? { color: t.color } : undefined}
            title={`Tradición ${t.label}`}
          >
            <span aria-hidden>{t.glyph}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
