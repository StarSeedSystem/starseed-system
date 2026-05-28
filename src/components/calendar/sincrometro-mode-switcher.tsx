// src/components/calendar/sincrometro-mode-switcher.tsx
'use client';

/**
 * Selector visual entre los tres modos del Sincrómetro:
 *   - Convencional (gregoriano)
 *   - Astrológico (signos zodiacales)
 *   - Lunar (fases lunares)
 *
 * No modifica datos: solo cambia la vista activa.
 */

import { CalendarDays, Moon, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SINCROMETRO_MODES, type SincrometroMode } from '@/lib/sincrometro';
import { useCalendar } from '@/contexts/calendar-context';

const MODE_ICONS: Record<SincrometroMode, React.ComponentType<{ className?: string }>> = {
  gregoriano: CalendarDays,
  astrologico: Sparkles,
  lunar: Moon,
};

interface SincrometroModeSwitcherProps {
  className?: string;
  /** Variante compacta para barras laterales / pills */
  compact?: boolean;
}

export function SincrometroModeSwitcher({ className, compact = false }: SincrometroModeSwitcherProps) {
  const { sincrometroMode, setSincrometroMode } = useCalendar();

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 backdrop-blur p-1',
        className
      )}
      role="tablist"
      aria-label="Modo de sincrómetro"
    >
      {SINCROMETRO_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode.id];
        const active = sincrometroMode === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={mode.description}
            onClick={() => setSincrometroMode(mode.id)}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200',
              'flex items-center gap-1.5',
              active
                ? 'bg-primary/20 text-primary shadow-inner ring-1 ring-inset ring-primary/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {!compact && <span>{mode.label}</span>}
            <span className="opacity-60 text-[10px]">{mode.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
