// src/components/calendar/sincrometro-day-card.tsx
'use client';

/**
 * Tarjeta de un día individual del Sincrómetro.
 *
 * Muestra (compacto):
 *   - Fecha (con día de la semana)
 *   - Fase lunar del día (siempre)
 *   - Signo zodiacal del día (siempre)
 *   - Horóscopo multi-tradición (Occidental/Chino/Védico/Maya) seleccionable
 *   - Clima básico
 *   - Eventos de la agenda para ese día
 *
 * Se usa tanto en el modo lunar (donde el "mes" son los días del ciclo
 * sinódico ~29.5d desde la última luna nueva) como en el modo astrológico
 * (donde el "mes" son los ~30 días que el sol está en cada signo).
 */

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Cloud, CalendarClock, Plus } from 'lucide-react';
import { useCalendar, LAYER_META, type CalendarItem } from '@/contexts/calendar-context';
import {
  getLunarPhaseForISO,
  getZodiacForISO,
  getAstroProfile,
  getBasicWeather,
} from '@/lib/sincrometro';

export type HoroscopeTradition = 'occidental' | 'chino' | 'vedico' | 'maya';

interface SincrometroDayCardProps {
  iso: string;
  tradition: HoroscopeTradition;
  isToday?: boolean;
  highlight?: boolean;
  onSelect?: (iso: string) => void;
  /** Compactness: 'full' (todo), 'compact' (resumen), 'pill' (mini). */
  variant?: 'full' | 'compact' | 'pill';
  className?: string;
}

export function SincrometroDayCard({
  iso,
  tradition,
  isToday = false,
  highlight = false,
  onSelect,
  variant = 'full',
  className,
}: SincrometroDayCardProps) {
  const { items } = useCalendar();
  const events = useMemo(
    () => items.filter((it) => it.date === iso).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [items, iso]
  );

  const phase = getLunarPhaseForISO(iso);
  const sign = getZodiacForISO(iso);
  const astro = useMemo(() => getAstroProfile(iso), [iso]);
  const weather = useMemo(() => getBasicWeather(iso), [iso]);

  const date = new Date(iso + 'T00:00:00');
  const weekday = date.toLocaleDateString('es-ES', { weekday: 'short' });
  const dayNum = date.getDate();
  const monthShort = date.toLocaleDateString('es-ES', { month: 'short' });

  const accent =
    tradition === 'occidental' ? `#${sign.color}` :
    tradition === 'chino'      ? astro.chinese.yearElement.color :
    tradition === 'vedico'     ? '#fbbf24' :
                                 '#a78bfa';

  if (variant === 'pill') {
    return (
      <button
        onClick={() => onSelect?.(iso)}
        className={cn(
          'flex flex-col items-center rounded-xl border bg-white/[0.02] p-1.5 hover:bg-white/[0.06] transition-all min-w-[58px]',
          isToday && 'ring-2 ring-primary/60',
          highlight && 'bg-primary/[0.06]',
          className,
        )}
        style={{ borderColor: `${accent}30` }}
        title={iso}
      >
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{weekday}</span>
        <span className="text-lg font-bold leading-none">{dayNum}</span>
        <span className="text-[12px]" aria-hidden>{phase.glyph}</span>
        <span className="text-[10px] opacity-70" style={{ color: accent }}>{sign.glyph}</span>
        {events.length > 0 && (
          <span className="text-[8px] mt-0.5 px-1 rounded-full bg-primary/20 text-primary">
            {events.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <Card
      onClick={() => onSelect?.(iso)}
      className={cn(
        'group/day cursor-pointer border bg-white/[0.02] hover:bg-white/[0.06] transition-all overflow-hidden',
        isToday && 'ring-2 ring-primary/60',
        className,
      )}
      style={{ borderColor: `${accent}33` }}
    >
      <CardContent className="p-3 space-y-2">
        {/* Cabecera del día */}
        <div className="flex items-start justify-between gap-1">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {weekday} · {monthShort}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold leading-none" style={{ color: accent }}>{dayNum}</span>
              <span className="text-[10px] text-muted-foreground/80">{iso}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-2xl leading-none" aria-hidden>{phase.glyph}</span>
            <span className="text-[9px] text-muted-foreground text-right">{phase.label}</span>
          </div>
        </div>

        {variant === 'full' && (
          <>
            {/* Bloque astro multi-tradición */}
            <div className="rounded-lg border border-white/5 bg-black/20 p-2 space-y-1">
              {tradition === 'occidental' && (
                <>
                  <Line label="Signo" value={`${astro.western.sign.label} ${astro.western.sign.glyph}`} />
                  <Line label="Regente" value={astro.western.ruler} small />
                  <Line label="Modalidad" value={astro.western.modality} small />
                  <Quote>{astro.western.reading}</Quote>
                </>
              )}
              {tradition === 'chino' && (
                <>
                  <Line label="Año" value={`${astro.chinese.yearAnimal.glyph} ${astro.chinese.yearAnimal.label} (${astro.chinese.yearElement.label})`} />
                  <Line label="Día" value={`${astro.chinese.dayAnimal.glyph} ${astro.chinese.dayAnimal.label}`} small />
                  <Line label="Polaridad" value={astro.chinese.yin_yang} small />
                  <Quote>{astro.chinese.reading}</Quote>
                </>
              )}
              {tradition === 'vedico' && (
                <>
                  <Line label="Rashi" value={`${astro.vedic.rashi.glyph} ${astro.vedic.rashi.label}`} />
                  <Line label="Nakshatra" value={`#${astro.vedic.nakshatra}`} small />
                  <Line label="Tithi" value={`#${astro.vedic.tithi}`} small />
                  <Line label="Deidad" value={astro.vedic.rashi.deity} small />
                  <Quote>{astro.vedic.reading}</Quote>
                </>
              )}
              {tradition === 'maya' && (
                <>
                  <Line label="Sello" value={`${astro.maya.seal.glyph} ${astro.maya.seal.label}`} />
                  <Line label="Tono" value={`${astro.maya.tone.number} · ${astro.maya.tone.name}`} small />
                  <Line label="Kin" value={`#${astro.maya.kin}/260`} small />
                  <Quote>{astro.maya.reading}</Quote>
                </>
              )}
            </div>

            {/* Clima */}
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-base" aria-hidden>{weather.glyph}</span>
              <span className="text-muted-foreground">{weather.description}</span>
              <span className="ml-auto font-mono text-foreground/80">{weather.tempC}°</span>
            </div>
          </>
        )}

        {/* Agenda del día */}
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1">
            <CalendarClock className="w-3 h-3" /> Agenda · {events.length}
          </div>
          {events.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60 italic">Sin eventos.</p>
          ) : (
            <div className="space-y-0.5">
              {events.slice(0, 3).map((e) => {
                const meta = LAYER_META[e.layer];
                return (
                  <div
                    key={e.id}
                    className={cn(
                      'truncate text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1.5',
                      meta.bg, meta.tone, meta.border
                    )}
                  >
                    <span className={cn('w-1 h-1 rounded-full shrink-0', meta.dot)} />
                    <span className="truncate">{e.time ? `${e.time} · ` : ''}{e.title}</span>
                  </div>
                );
              })}
              {events.length > 3 && (
                <div className="text-[10px] text-muted-foreground pl-1">+ {events.length - 3} más</div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Line({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-2', small ? 'text-[10px]' : 'text-xs')}>
      <span className="uppercase tracking-wider text-muted-foreground font-semibold w-16 shrink-0">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] italic text-foreground/75 leading-tight pt-1 border-t border-white/5">
      "{children}"
    </p>
  );
}
