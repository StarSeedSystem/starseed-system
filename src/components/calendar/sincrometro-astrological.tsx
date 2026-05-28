// src/components/calendar/sincrometro-astrological.tsx
'use client';

/**
 * Vista astrológica del Sincrómetro — los "meses" son los días que el
 * sol está en cada signo zodiacal del año visible. Dentro de cada signo,
 * se muestran TODOS los días individualmente con su fase lunar, su signo,
 * su horóscopo multi-tradición, clima y agenda.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { buildZodiacYear, getZodiacForISO, parseISODate, toISODate } from '@/lib/sincrometro';
import { SincrometroDayCard, type HoroscopeTradition } from './sincrometro-day-card';
import { HoroscopeTraditionPicker } from './horoscope-tradition-picker';

interface SincrometroAstrologicalProps {
  year: number;
  todayISO: string;
  onSelectDate: (iso: string) => void;
}

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

export function SincrometroAstrological({ year, todayISO, onSelectDate }: SincrometroAstrologicalProps) {
  const zodiacYear = useMemo(() => buildZodiacYear(year), [year]);
  const currentSign = getZodiacForISO(todayISO);
  const [selectedSign, setSelectedSign] = useState(currentSign.id);
  const [tradition, setTradition] = useState<HoroscopeTradition>('occidental');

  const activeBlock = zodiacYear.find((b) => b.sign.id === selectedSign) ?? zodiacYear[0];
  const days = useMemo(
    () => daysBetween(activeBlock.startISO, activeBlock.endISO),
    [activeBlock.startISO, activeBlock.endISO]
  );

  return (
    <div className="space-y-3">
      {/* Selector de signo (los "meses" zodiacales) */}
      <Card className="liquid-glass-panel border-white/10 overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-headline text-lg">
              Rueda Zodiacal <span className="text-muted-foreground text-sm">{year}</span>
            </h3>
            <HoroscopeTraditionPicker value={tradition} onChange={setTradition} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
            {zodiacYear.map(({ sign, startISO, endISO }) => {
              const isCurrent = sign.id === currentSign.id;
              const isSelected = sign.id === selectedSign;
              const count = daysBetween(startISO, endISO).length;
              return (
                <button
                  key={sign.id}
                  onClick={() => setSelectedSign(sign.id)}
                  className={cn(
                    'snap-start shrink-0 rounded-xl border px-3 py-2 transition-all cursor-pointer text-left min-w-[150px]',
                    isSelected ? 'bg-primary/[0.06] ring-2 ring-primary/40' : 'bg-white/[0.02] hover:bg-white/[0.06]',
                    isCurrent && !isSelected && 'border-emerald-500/40'
                  )}
                  style={{ borderColor: isSelected ? `#${sign.color}` : `#${sign.color}33` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl" style={{ color: `#${sign.color}` }} aria-hidden>{sign.glyph}</span>
                    <div>
                      <p className="text-xs font-bold" style={{ color: `#${sign.color}` }}>{sign.label}</p>
                      <p className="text-[10px] text-muted-foreground">{startISO.slice(5)} → {endISO.slice(5)}</p>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {count} días · {sign.element}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Días del signo seleccionado */}
      <Card className="liquid-glass-panel border-white/10 overflow-hidden">
        <CardContent className="p-3 md:p-4 space-y-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h4 className="text-sm font-bold uppercase tracking-wider" style={{ color: `#${activeBlock.sign.color}` }}>
              {activeBlock.sign.glyph} {activeBlock.sign.label} · {days.length} días
            </h4>
            <p className="text-[11px] text-muted-foreground">
              {activeBlock.startISO} → {activeBlock.endISO}
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
