// src/components/calendar/sincrometro-lunar.tsx
'use client';

/**
 * Vista lunar del Sincrómetro — los "meses" son ciclos sinódicos de
 * ~29.5 días (luna nueva → luna nueva siguiente). Dentro de cada mes
 * lunar se muestran TODOS los días individualmente con su fase, signo
 * zodiacal, horóscopo multi-tradición, clima y agenda.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  parseISODate,
  toISODate,
  findNewMoonsInRange,
  getLunarPhaseForISO,
  KNOWN_NEW_MOON_MS,
  SYNODIC_MONTH_DAYS,
} from '@/lib/sincrometro';
import { SincrometroDayCard, type HoroscopeTradition } from './sincrometro-day-card';
import { HoroscopeTraditionPicker } from './horoscope-tradition-picker';

interface SincrometroLunarProps {
  referenceISO: string;
  todayISO: string;
  onSelectDate: (iso: string) => void;
}

/** Devuelve los días [start, end) de un mes lunar como ISO. */
function daysBetween(startISO: string, endISO: string): string[] {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Construye los meses lunares del año visible (±1 año). */
function buildLunarMonthsAround(referenceISO: string): { startISO: string; endISO: string; index: number }[] {
  const ref = parseISODate(referenceISO);
  const startWindow = new Date(ref.getFullYear() - 1, 0, 1);
  const endWindow = new Date(ref.getFullYear() + 1, 11, 31);
  const newMoons: string[] = [];
  let cycleStart = new Date(KNOWN_NEW_MOON_MS);
  while (cycleStart < endWindow) {
    if (cycleStart >= startWindow) newMoons.push(toISODate(cycleStart));
    cycleStart = new Date(cycleStart.getTime() + SYNODIC_MONTH_DAYS * 86_400_000);
  }
  const months: { startISO: string; endISO: string; index: number }[] = [];
  for (let i = 0; i < newMoons.length - 1; i++) {
    const start = parseISODate(newMoons[i]);
    const endDate = parseISODate(newMoons[i + 1]);
    endDate.setDate(endDate.getDate() - 1);
    months.push({
      startISO: newMoons[i],
      endISO: toISODate(endDate),
      index: i + 1,
    });
  }
  return months;
}

export function SincrometroLunar({ referenceISO, todayISO, onSelectDate }: SincrometroLunarProps) {
  const months = useMemo(() => buildLunarMonthsAround(referenceISO), [referenceISO]);
  const [tradition, setTradition] = useState<HoroscopeTradition>('occidental');

  // Mes lunar activo: el que contiene hoy o el de referencia
  const initialIdx = useMemo(() => {
    const idx = months.findIndex(
      (m) => todayISO >= m.startISO && todayISO <= m.endISO
    );
    return idx >= 0 ? idx : Math.max(0, Math.floor(months.length / 2));
  }, [months, todayISO]);

  const [activeIdx, setActiveIdx] = useState(initialIdx);
  const active = months[activeIdx] ?? months[0];
  const days = useMemo(() => daysBetween(active.startISO, active.endISO), [active.startISO, active.endISO]);

  return (
    <div className="space-y-3">
      {/* Selector de mes lunar */}
      <Card className="liquid-glass-panel border-white/10 overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-headline text-lg">
              Ciclos Sinódicos <span className="text-muted-foreground text-sm">~{SYNODIC_MONTH_DAYS.toFixed(2)} días/mes</span>
            </h3>
            <HoroscopeTraditionPicker value={tradition} onChange={setTradition} />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
            {months.map((m, i) => {
              const startPhase = getLunarPhaseForISO(m.startISO);
              const length = daysBetween(m.startISO, m.endISO).length;
              const isActive = i === activeIdx;
              const containsToday = todayISO >= m.startISO && todayISO <= m.endISO;
              return (
                <button
                  key={m.startISO}
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    'snap-start shrink-0 rounded-xl border px-3 py-2 transition-all cursor-pointer text-left min-w-[150px]',
                    isActive ? 'bg-primary/[0.06] ring-2 ring-primary/40 border-primary/40' : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/10',
                    containsToday && !isActive && 'border-emerald-500/40'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden>{startPhase.glyph}</span>
                    <div>
                      <p className="text-xs font-bold">Luna nueva {m.startISO.slice(5)}</p>
                      <p className="text-[10px] text-muted-foreground">→ {m.endISO.slice(5)}</p>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{length} días</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Días del mes lunar activo */}
      <Card className="liquid-glass-panel border-white/10 overflow-hidden">
        <CardContent className="p-3 md:p-4 space-y-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h4 className="text-sm font-bold uppercase tracking-wider">
              Mes lunar {activeIdx + 1} · {days.length} días
            </h4>
            <p className="text-[11px] text-muted-foreground">
              {active.startISO} → {active.endISO}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {days.map((iso) => (
              <SincrometroDayCard
                key={iso}
                iso={iso}
                tradition={tradition}
                isToday={iso === todayISO}
                onSelect={onSelectDate}
                variant="full"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
