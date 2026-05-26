// src/components/calendar/unified-calendar.tsx
'use client';

/**
 * UnifiedCalendar — calendario maestro del SOSD.
 *
 * Misma fuente de datos que la pestaña "Agenda" de /network/culture y el Hub.
 * Soporta capas filtrables (eventos, recordatorios, alarmas, logs del sistema)
 * y al hacer click en un día se abre DayDetailDialog para gestionar entradas.
 *
 * Diseño: panel "Crystal Liquid Glass" coherente con MASTER.md.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Layers as LayersIcon,
  Eye,
  EyeOff,
  CalendarDays,
  Clock,
  Share2,
  MapPin,
} from 'lucide-react';
import {
  ALL_LAYERS,
  LAYER_META,
  toISODate,
  useCalendar,
  type CalendarItem,
  type CalendarLayer,
} from '@/contexts/calendar-context';
import { DayDetailDialog } from './day-detail-dialog';

const WEEK_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface UnifiedCalendarProps {
  /** Si true, muestra el panel lateral con la agenda combinada. */
  showAgenda?: boolean;
  /** Título opcional para la cabecera. */
  title?: string;
  /** Subtítulo opcional para la cabecera. */
  subtitle?: string;
  className?: string;
}

function startOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex, 1);
}

/** Devuelve el lunes (o el propio día si ya lo es) anterior a la fecha dada. */
function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0=Dom, 1=Lun…6=Sáb
  const diff = (day + 6) % 7; // distancia al lunes anterior
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function buildMonthGrid(year: number, monthIndex: number): Date[] {
  const first = startOfMonth(year, monthIndex);
  const gridStart = startOfWeekMonday(first);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

export function UnifiedCalendar({
  showAgenda = true,
  title = 'Calendario Unificado',
  subtitle = 'Eventos, recordatorios, alarmas y logs del sistema en una sola superficie.',
  className,
}: UnifiedCalendarProps) {
  const { items, visibleLayers, toggleLayer, setAllLayers, aiContextSnapshot } = useCalendar();

  const now = new Date();
  const [cursor, setCursor] = useState<{ year: number; month: number }>({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const todayISO = toISODate(now);

  const visibleItems = useMemo(
    () => items.filter((it) => visibleLayers[it.layer]),
    [items, visibleLayers]
  );

  const itemsForDay = (d: Date): CalendarItem[] => {
    const iso = toISODate(d);
    return visibleItems
      .filter((it) => it.date === iso)
      .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
  };

  const goPrev = () => {
    setCursor(({ year, month }) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }));
  };
  const goNext = () => {
    setCursor(({ year, month }) => (month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }));
  };
  const goToday = () => setCursor({ year: now.getFullYear(), month: now.getMonth() });

  const allOn = ALL_LAYERS.every((l) => visibleLayers[l]);

  const askAi = () => {
    const ctx = encodeURIComponent(aiContextSnapshot());
    window.open(`/agent?context=${ctx}`, '_blank');
  };

  const upcoming = useMemo(() => {
    return [...visibleItems]
      .filter((it) => it.date >= todayISO)
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
      .slice(0, 8);
  }, [visibleItems, todayISO]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10 ring-1 ring-inset ring-primary/20">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-headline">{title}</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="btn-pill border-white/15" onClick={askAi} title="Pedir al Exocórtex">
            <Sparkles className="w-4 h-4 mr-1.5 text-cyan-300" /> Contexto IA
          </Button>
          <Button size="sm" variant="outline" className="btn-pill border-white/15" onClick={() => setLayersOpen((v) => !v)}>
            <LayersIcon className="w-4 h-4 mr-1.5" /> Capas
          </Button>
          <Button
            size="sm"
            className="btn-pill"
            onClick={() => setSelectedDate(todayISO)}
            title="Nueva entrada para hoy"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Añadir
          </Button>
        </div>
      </div>

      {/* Filtro de capas */}
      {layersOpen && (
        <Card className="liquid-glass-panel border-white/10 p-3 animate-in fade-in-50 slide-in-from-top-2 duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Capas activas en el calendario
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10">
                <Plus className="w-3 h-3 mr-1" /> Conectar DB / Servidor
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAllLayers(!allOn)}>
                {allOn ? <><EyeOff className="w-3 h-3 mr-1" /> Ocultar todas</> : <><Eye className="w-3 h-3 mr-1" /> Mostrar todas</>}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_LAYERS.map((l) => {
              const meta = LAYER_META[l];
              const active = visibleLayers[l];
              return (
                <button
                  key={l}
                  onClick={() => toggleLayer(l)}
                  className={cn(
                    'group cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                    'flex items-center gap-1.5 backdrop-blur-sm',
                    active
                      ? cn(meta.bg, meta.tone, meta.border, 'shadow-inner')
                      : 'border-white/10 text-muted-foreground/60 bg-white/[0.02] hover:text-foreground/80'
                  )}
                  title={meta.description}
                >
                  <span className={cn('w-2 h-2 rounded-full', meta.dot, !active && 'opacity-40')} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <div className={cn('grid gap-4', showAgenda ? 'lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-1')}>
        {/* Rejilla del mes */}
        <div className={cn(showAgenda && 'lg:col-span-3 xl:col-span-4')}>
          <Card className="liquid-glass-panel border-white/10 overflow-hidden h-full">
            <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={goPrev} aria-label="Mes anterior">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={goNext} aria-label="Mes siguiente">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" className="btn-pill border-white/10 h-8 text-xs ml-1" onClick={goToday}>
                  Hoy
                </Button>
              </div>
              <h3 className="font-headline text-lg md:text-xl capitalize">
                {MONTH_LABELS[cursor.month]} <span className="text-muted-foreground">{cursor.year}</span>
              </h3>
            </div>

            {/* Días de la semana */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEK_LABELS.map((d) => (
                <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Celdas */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d, idx) => {
                const iso = toISODate(d);
                const inMonth = d.getMonth() === cursor.month;
                const isToday = iso === todayISO;
                const dayEvents = itemsForDay(d);
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(iso)}
                    className={cn(
                      'relative group min-h-[96px] md:min-h-[120px] lg:min-h-[140px] rounded-xl border p-1.5 md:p-2 text-left transition-all duration-200 cursor-pointer overflow-hidden',
                      'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/20 hover:shadow-lg',
                      !inMonth && 'opacity-40',
                      isToday && 'ring-2 ring-primary/60 border-primary/40 bg-primary/[0.08]'
                    )}
                    title={`Abrir ${iso}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center text-[11px] font-semibold w-6 h-6 rounded-full',
                          isToday ? 'bg-primary text-primary-foreground' : 'text-foreground/80'
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 mt-1.5">
                      {dayEvents.slice(0, 4).map((e) => {
                        const meta = LAYER_META[e.layer];
                        const additionalLayers = ALL_LAYERS.filter((l) => l !== e.layer && (e.tags || []).map(t=>t.toLowerCase()).includes(l));
                        return (
                          <div
                            key={e.id}
                            className={cn(
                              'truncate text-[11px] px-2 py-0.5 md:py-1 rounded-md border leading-tight flex items-center gap-1.5 transition-all',
                              meta.bg, meta.tone, meta.border
                            )}
                          >
                            <div className="flex items-center gap-0.5 shrink-0">
                              <span className={cn('w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]', meta.dot)} />
                              {additionalLayers.map(al => (
                                <span key={al} className={cn('w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]', LAYER_META[al].dot)} />
                              ))}
                            </div>
                            <span className="truncate font-medium">{e.time && !e.allDay ? <span className="opacity-70 mr-0.5">{e.time}</span> : ''}{e.title}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 4 && (
                        <div className="text-[10px] font-semibold text-muted-foreground pl-1 mt-1 flex items-center gap-1">
                          <Plus className="w-3 h-3" /> {dayEvents.length - 4} más
                        </div>
                      )}
                    </div>
                    {/* Hover: + */}
                    <span className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center">
                      <Plus className="w-3 h-3" />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Leyenda mini */}
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {ALL_LAYERS.filter((l) => visibleLayers[l]).map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span className={cn('w-1.5 h-1.5 rounded-full', LAYER_META[l].dot)} />
                  {LAYER_META[l].label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
        </div>

        {/* Panel lateral — Agenda combinada */}
        {showAgenda && (
          <div className="lg:col-span-1">
            <Card className="liquid-glass-panel border-white/10 h-full">
              <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Agenda próxima
                </h3>
                <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">
                  {upcoming.length}
                </Badge>
              </div>
              {upcoming.length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No hay entradas próximas con las capas activas.
                </p>
              )}
              <div className="space-y-2">
                {upcoming.map((it) => {
                  const meta = LAYER_META[it.layer];
                  return (
                    <button
                      key={it.id}
                      onClick={() => setSelectedDate(it.date)}
                      className={cn(
                        'w-full text-left flex gap-2 items-start p-2 rounded-xl border bg-white/[0.02] hover:bg-white/[0.05] transition-colors',
                        meta.border
                      )}
                    >
                      <span className={cn('mt-1 w-2 h-2 rounded-full shrink-0', meta.dot)} aria-hidden />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{it.title}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" /> {it.date}
                          </span>
                          {it.time && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {it.time}
                            </span>
                          )}
                          {it.location && (
                            <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                              <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{it.location}</span>
                            </span>
                          )}
                          {it.visibility === 'red' && (
                            <span className="inline-flex items-center gap-1 text-cyan-300">
                              <Share2 className="w-3 h-3" /> En la Red
                            </span>
                          )}
                        </div>
                        <Badge variant="outline" className={cn('mt-1.5 text-[10px]', meta.bg, meta.tone, meta.border)}>
                          {meta.label}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          </div>
        )}
      </div>

      {selectedDate && (
        <DayDetailDialog
          open={!!selectedDate}
          onOpenChange={(o) => !o && setSelectedDate(null)}
          date={selectedDate}
        />
      )}
    </div>
  );
}
