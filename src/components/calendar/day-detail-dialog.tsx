// src/components/calendar/day-detail-dialog.tsx
'use client';

/**
 * DayDetailDialog — ventana detalle de un día del calendario unificado.
 * Permite ordenar, añadir, editar, eliminar y compartir cualquier entrada
 * (evento, recordatorio, alarma, log de sistema) del día seleccionado, y
 * gestionar avisos (recordatorios + alarmas) por cada evento con cualquier
 * distancia temporal previa.
 */

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Clock,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  X,
  AlarmClock,
  BellRing,
  ListOrdered,
  Globe2,
  Lock,
  Save,
  Tag as TagIcon,
  Flag,
} from 'lucide-react';
import {
  ALL_LAYERS,
  LAYER_META,
  formatLeadTime,
  type CalendarItem,
  type CalendarLayer,
  type CalendarPriority,
  type CalendarVisibility,
  type EventReminder,
  formatLongDate,
  useCalendar,
} from '@/contexts/calendar-context';
import { RemindersEditor } from './reminders-editor';

type SortKey = 'time' | 'layer' | 'title' | 'visibility' | 'priority';

interface DayDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO date YYYY-MM-DD */
  date: string;
}

type Draft = Omit<CalendarItem, 'id' | 'createdAt'> & { reminders: EventReminder[] };

const emptyDraft = (date: string): Draft => ({
  title: '',
  description: '',
  date,
  endDate: date,
  time: '12:00',
  durationMin: 60,
  allDay: false,
  layer: 'personal',
  visibility: 'privado',
  location: '',
  recurrence: 'none',
  priority: 'normal',
  tags: [],
  reminders: [],
});

const priorityColor: Record<CalendarPriority, string> = {
  baja: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
  normal: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  alta: 'text-red-300 bg-red-500/10 border-red-500/30',
};

export function DayDetailDialog({ open, onOpenChange, date }: DayDetailDialogProps) {
  const { itemsByDate, addItem, updateItem, removeItem, shareItem, aiContextSnapshot } = useCalendar();
  const [sortBy, setSortBy] = useState<SortKey>('time');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(date));
  const [creating, setCreating] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  const dayItems = itemsByDate(date);

  const sorted = useMemo(() => {
    const arr = [...dayItems];
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'time':
          return (a.allDay ? '00:00' : a.time ?? '99:99').localeCompare(b.allDay ? '00:00' : b.time ?? '99:99');
        case 'layer':
          return a.layer.localeCompare(b.layer);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'visibility':
          return a.visibility.localeCompare(b.visibility);
        case 'priority': {
          const order = { alta: 0, normal: 1, baja: 2 } as const;
          return (order[a.priority ?? 'normal'] - order[b.priority ?? 'normal']);
        }
      }
    });
    return arr;
  }, [dayItems, sortBy]);

  const startCreate = () => {
    setDraft(emptyDraft(date));
    setEditingId(null);
    setCreating(true);
  };

  const startEdit = (it: CalendarItem) => {
    const { id: _id, createdAt: _createdAt, ...rest } = it;
    void _id; void _createdAt;
    setDraft({
      ...emptyDraft(date),
      ...rest,
      reminders: it.reminders ?? [],
      tags: it.tags ?? [],
    });
    setEditingId(it.id);
    setCreating(true);
  };

  const cancelDraft = () => {
    setCreating(false);
    setEditingId(null);
    setTagDraft('');
  };

  const saveDraft = () => {
    if (!draft.title.trim()) return;
    const payload: Omit<CalendarItem, 'id' | 'createdAt'> = {
      ...draft,
      // Saneamiento: si allDay, descartamos time
      time: draft.allDay ? undefined : draft.time,
    };
    if (editingId) {
      updateItem(editingId, payload);
    } else {
      addItem(payload);
    }
    cancelDraft();
  };

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if ((draft.tags ?? []).includes(t)) {
      setTagDraft('');
      return;
    }
    setDraft({ ...draft, tags: [...(draft.tags ?? []), t] });
    setTagDraft('');
  };

  const removeTag = (t: string) => {
    setDraft({ ...draft, tags: (draft.tags ?? []).filter((x) => x !== t) });
  };

  const askAi = () => {
    const ctx = encodeURIComponent(aiContextSnapshot());
    window.open(`/agent?context=${ctx}&focus=${date}`, '_blank');
  };

  // Cuenta de items por capa para el header
  const layersInDay = useMemo(() => {
    const map = new Map<CalendarLayer, number>();
    dayItems.forEach((it) => map.set(it.layer, (map.get(it.layer) ?? 0) + 1));
    return Array.from(map.entries());
  }, [dayItems]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto liquid-glass-panel border-white/10">
        <DialogHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="font-headline text-2xl capitalize">
                {formatLongDate(date)}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {dayItems.length === 0
                  ? 'Sin entradas para este día. Añade una para empezar.'
                  : `${dayItems.length} entrada${dayItems.length === 1 ? '' : 's'} en tu agenda unificada.`}
              </DialogDescription>
              {layersInDay.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {layersInDay.map(([layer, count]) => {
                    const meta = LAYER_META[layer];
                    return (
                      <span
                        key={layer}
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border',
                          meta.bg, meta.tone, meta.border
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                        {meta.label}
                        <span className="opacity-60">×{count}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="btn-pill border-white/15"
                onClick={askAi}
                title="Pedir al Exocórtex que razone sobre este día"
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-cyan-300" /> Contexto IA
              </Button>
              <Button size="sm" className="btn-pill" onClick={startCreate}>
                <Plus className="w-4 h-4 mr-1.5" /> Añadir
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <ListOrdered className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Ordenar por</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-8 w-[170px] bg-background/40 border-white/10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time">Hora</SelectItem>
                <SelectItem value="layer">Capa</SelectItem>
                <SelectItem value="title">Título</SelectItem>
                <SelectItem value="visibility">Visibilidad</SelectItem>
                <SelectItem value="priority">Prioridad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        {/* Lista de entradas del día */}
        <div className="space-y-2 mt-2">
          {sorted.length === 0 && !creating && (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-sm text-muted-foreground">No hay nada programado.</p>
              <Button size="sm" className="btn-pill mt-3" onClick={startCreate}>
                <Plus className="w-4 h-4 mr-1.5" /> Crear primera entrada
              </Button>
            </div>
          )}

          {sorted.map((it) => {
            const meta = LAYER_META[it.layer];
            return (
              <div
                key={it.id}
                className={cn(
                  'group flex items-start gap-3 p-3 rounded-2xl border bg-white/[0.02] hover:bg-white/[0.05] transition-colors',
                  meta.border
                )}
              >
                <div className={cn('mt-1 w-2 h-2 rounded-full shrink-0', meta.dot)} aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wider', meta.bg, meta.tone, meta.border)}>
                      {meta.label}
                    </Badge>
                    {it.priority && it.priority !== 'normal' && (
                      <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wider', priorityColor[it.priority])}>
                        <Flag className="w-3 h-3 mr-1 inline" />
                        {it.priority}
                      </Badge>
                    )}
                    {it.urgent && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-red-400/40 text-red-300 bg-red-500/10">
                        Urgente
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] uppercase tracking-wider border-white/10',
                        it.visibility === 'red' ? 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' :
                        it.visibility === 'publico' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' :
                        'text-muted-foreground'
                      )}
                    >
                      {it.visibility === 'red' ? <Globe2 className="w-3 h-3 mr-1 inline" /> : it.visibility === 'publico' ? <Globe2 className="w-3 h-3 mr-1 inline" /> : <Lock className="w-3 h-3 mr-1 inline" />}
                      {it.visibility}
                    </Badge>
                    {it.allDay && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-white/10 text-muted-foreground">
                        Todo el día
                      </Badge>
                    )}
                  </div>
                  <p className="font-semibold text-foreground mt-1 leading-snug">{it.title}</p>
                  {it.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                    {it.time && !it.allDay && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {it.time}
                        {it.durationMin ? ` · ${it.durationMin} min` : ''}
                      </span>
                    )}
                    {it.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {it.location}
                      </span>
                    )}
                  </div>
                  {(it.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {it.tags!.map((t) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-muted-foreground">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  {(it.reminders?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {it.reminders!.map((r) => (
                        <span
                          key={r.id}
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                            r.type === 'alarma'
                              ? 'border-red-500/30 text-red-200 bg-red-500/10'
                              : 'border-amber-500/30 text-amber-200 bg-amber-500/10'
                          )}
                          title={r.label}
                        >
                          {r.type === 'alarma' ? <AlarmClock className="w-3 h-3" /> : <BellRing className="w-3 h-3" />}
                          {formatLeadTime(r.leadMinutes)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => startEdit(it)} title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-full text-cyan-300 hover:text-cyan-200"
                    onClick={() => shareItem(it.id)}
                    title={it.visibility === 'red' ? 'Quitar de la Red' : 'Compartir en la Red'}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-full text-red-300 hover:text-red-200"
                    onClick={() => removeItem(it.id)}
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Formulario de creación / edición */}
        {creating && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{editingId ? 'Editar entrada' : 'Nueva entrada'}</p>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={cancelDraft}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Título</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Ej: Asamblea de la E.F. del Valle"
                  className="bg-background/40 border-white/10"
                />
              </div>

              <div>
                <Label className="text-xs">Fecha inicio</Label>
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  className="bg-background/40 border-white/10"
                />
              </div>

              <div>
                <Label className="text-xs">Fecha fin (multi-día opcional)</Label>
                <Input
                  type="date"
                  value={draft.endDate ?? draft.date}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  className="bg-background/40 border-white/10"
                />
              </div>

              <div className={cn('flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2', draft.allDay && 'md:col-span-2')}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs">Todo el día</span>
                </div>
                <Switch
                  checked={!!draft.allDay}
                  onCheckedChange={(v) => setDraft({ ...draft, allDay: v })}
                />
              </div>

              {!draft.allDay && (
                <>
                  <div>
                    <Label className="text-xs">Hora inicio</Label>
                    <Input
                      type="time"
                      value={draft.time ?? ''}
                      onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                      className="bg-background/40 border-white/10"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Duración (min)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={15}
                      value={draft.durationMin ?? 0}
                      onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) || 0 })}
                      className="bg-background/40 border-white/10"
                    />
                  </div>
                </>
              )}

              <div>
                <Label className="text-xs">Capa</Label>
                <Select value={draft.layer} onValueChange={(v) => setDraft({ ...draft, layer: v as CalendarLayer })}>
                  <SelectTrigger className="bg-background/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_LAYERS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LAYER_META[l].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Recurrencia</Label>
                <Select value={draft.recurrence ?? 'none'} onValueChange={(v) => setDraft({ ...draft, recurrence: v as CalendarItem['recurrence'] })}>
                  <SelectTrigger className="bg-background/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin repetir</SelectItem>
                    <SelectItem value="daily">Diaria</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Visibilidad</Label>
                <Select value={draft.visibility} onValueChange={(v) => setDraft({ ...draft, visibility: v as CalendarVisibility })}>
                  <SelectTrigger className="bg-background/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="privado">Privado (sólo yo)</SelectItem>
                    <SelectItem value="publico">Público (mis contactos)</SelectItem>
                    <SelectItem value="red">En la Red (federado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Prioridad</Label>
                <Select value={draft.priority ?? 'normal'} onValueChange={(v) => setDraft({ ...draft, priority: v as CalendarPriority })}>
                  <SelectTrigger className="bg-background/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">Ubicación</Label>
                <Input
                  value={draft.location ?? ''}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  placeholder="Sala, ciudad o URL del entorno virtual"
                  className="bg-background/40 border-white/10"
                />
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">Descripción</Label>
                <Textarea
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  placeholder="Notas, intención, contexto…"
                  className="bg-background/40 border-white/10"
                />
              </div>

              {/* Tags */}
              <div className="md:col-span-2">
                <Label className="text-xs">Etiquetas</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Añade etiquetas (Enter)"
                    className="bg-background/40 border-white/10"
                  />
                  <Button type="button" size="sm" variant="outline" className="btn-pill border-white/10" onClick={addTag}>
                    <TagIcon className="w-4 h-4" />
                  </Button>
                </div>
                {(draft.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {draft.tags!.map((t) => (
                      <button
                        key={t}
                        onClick={() => removeTag(t)}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-muted-foreground hover:text-foreground hover:border-red-400/40 transition-colors"
                        title="Quitar etiqueta"
                      >
                        #{t} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:col-span-2 flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-amber-300" />
                  <span className="text-xs">Marcar como urgente</span>
                </div>
                <Switch
                  checked={!!draft.urgent}
                  onCheckedChange={(v) => setDraft({ ...draft, urgent: v })}
                />
              </div>

              {/* Editor de avisos */}
              <div className="md:col-span-2">
                <RemindersEditor
                  value={draft.reminders}
                  onChange={(next) => setDraft({ ...draft, reminders: next })}
                />
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button variant="ghost" onClick={cancelDraft}>Cancelar</Button>
              <Button onClick={saveDraft} className="btn-pill">
                <Save className="w-4 h-4 mr-1.5" /> Guardar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
