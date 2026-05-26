// src/components/calendar/reminders-editor.tsx
'use client';

/**
 * RemindersEditor — editor de avisos (recordatorios + alarmas) para un evento.
 *
 * - Soporta cualquier distancia temporal: minutos, horas o días antes del evento.
 * - Presets rápidos (5/15/30 min, 1/2 h, 1/2 días, 1 semana) + entrada custom.
 * - Cada aviso puede ser "recordatorio" (silencioso) o "alarma" (sonido + modal).
 * - Funciona tanto sobre un evento ya existente (id presente) como sobre un
 *   borrador en memoria (id ausente) — en este último caso opera sobre el
 *   array `value` y emite cambios via `onChange`, sin tocar el store global.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlarmClock,
  BellRing,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  REMINDER_PRESETS,
  formatLeadTime,
  type EventReminder,
} from '@/contexts/calendar-context';

type Unit = 'min' | 'h' | 'd' | 'sem';

interface RemindersEditorProps {
  value: EventReminder[];
  onChange: (next: EventReminder[]) => void;
}

const unitToMinutes = (n: number, u: Unit): number => {
  switch (u) {
    case 'min': return Math.round(n);
    case 'h':   return Math.round(n * 60);
    case 'd':   return Math.round(n * 60 * 24);
    case 'sem': return Math.round(n * 60 * 24 * 7);
  }
};

const tempId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export function RemindersEditor({ value, onChange }: RemindersEditorProps) {
  const [draftType, setDraftType] = useState<'recordatorio' | 'alarma'>('recordatorio');
  const [draftAmount, setDraftAmount] = useState<number>(15);
  const [draftUnit, setDraftUnit] = useState<Unit>('min');
  const [draftLabel, setDraftLabel] = useState<string>('');

  const draftMinutes = useMemo(() => unitToMinutes(draftAmount, draftUnit), [draftAmount, draftUnit]);

  const addFromPreset = (minutes: number) => {
    onChange([
      ...value,
      { id: tempId(), leadMinutes: minutes, type: draftType, label: draftLabel || undefined },
    ]);
  };

  const addCustom = () => {
    if (draftMinutes < 0) return;
    onChange([
      ...value,
      { id: tempId(), leadMinutes: draftMinutes, type: draftType, label: draftLabel || undefined },
    ]);
    setDraftLabel('');
  };

  const remove = (id: string) => {
    onChange(value.filter((r) => r.id !== id));
  };

  const toggleType = (id: string) => {
    onChange(
      value.map((r) =>
        r.id === id ? { ...r, type: r.type === 'alarma' ? 'recordatorio' : 'alarma' } : r
      )
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-amber-300" />
          <span className="text-sm font-semibold">Avisos del evento</span>
        </div>
        <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">
          {value.length}
        </Badge>
      </div>

      {/* Lista de avisos configurados */}
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">
          Sin avisos. Añade un recordatorio o una alarma para no perderte el evento.
        </p>
      ) : (
        <div className="space-y-1.5">
          {[...value]
            .sort((a, b) => b.leadMinutes - a.leadMinutes)
            .map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-xl border bg-white/[0.02]',
                  r.type === 'alarma'
                    ? 'border-red-500/30'
                    : 'border-amber-500/30'
                )}
              >
                {r.type === 'alarma' ? (
                  <AlarmClock className="w-3.5 h-3.5 text-red-300 shrink-0" />
                ) : (
                  <BellRing className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                )}
                <span className="text-sm font-medium flex-1 min-w-0 truncate">
                  {formatLeadTime(r.leadMinutes)}
                  {r.label && <span className="text-muted-foreground"> · {r.label}</span>}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 rounded-full"
                  onClick={() => toggleType(r.id)}
                  title={r.type === 'alarma' ? 'Convertir en recordatorio (silencioso)' : 'Convertir en alarma (sonido)'}
                >
                  {r.type === 'alarma' ? (
                    <Volume2 className="w-3 h-3 text-red-300" />
                  ) : (
                    <VolumeX className="w-3 h-3 text-amber-300" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 rounded-full text-red-300/80 hover:text-red-300"
                  onClick={() => remove(r.id)}
                  title="Eliminar aviso"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
        </div>
      )}

      {/* Selección rápida de tipo */}
      <div className="flex gap-2">
        <button
          onClick={() => setDraftType('recordatorio')}
          className={cn(
            'flex-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
            draftType === 'recordatorio'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
              : 'border-white/10 text-muted-foreground hover:text-foreground'
          )}
        >
          <BellRing className="w-3.5 h-3.5" /> Recordatorio
        </button>
        <button
          onClick={() => setDraftType('alarma')}
          className={cn(
            'flex-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
            draftType === 'alarma'
              ? 'bg-red-500/15 border-red-500/40 text-red-200'
              : 'border-white/10 text-muted-foreground hover:text-foreground'
          )}
        >
          <AlarmClock className="w-3.5 h-3.5" /> Alarma (sonido)
        </button>
      </div>

      {/* Presets */}
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Presets</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {REMINDER_PRESETS.map((p) => (
            <button
              key={p.minutes}
              onClick={() => addFromPreset(p.minutes)}
              className="px-2.5 py-1 rounded-full border border-white/10 text-[11px] font-semibold bg-white/[0.02] hover:bg-white/[0.08] hover:border-white/20 transition-colors"
            >
              <Plus className="w-3 h-3 inline mr-1" />
              {p.label} antes
            </button>
          ))}
        </div>
      </div>

      {/* Custom */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Avisar a una distancia personalizada</Label>
        <div className="grid grid-cols-[1fr_auto_1fr_auto] md:grid-cols-[100px_120px_1fr_auto] gap-2 items-center">
          <Input
            type="number"
            min={0}
            value={draftAmount}
            onChange={(e) => setDraftAmount(Math.max(0, Number(e.target.value) || 0))}
            className="bg-background/40 border-white/10 h-9"
            placeholder="15"
          />
          <Select value={draftUnit} onValueChange={(v) => setDraftUnit(v as Unit)}>
            <SelectTrigger className="bg-background/40 border-white/10 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="min">minutos antes</SelectItem>
              <SelectItem value="h">horas antes</SelectItem>
              <SelectItem value="d">días antes</SelectItem>
              <SelectItem value="sem">semanas antes</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="Etiqueta opcional (ej: salir antes)"
            className="bg-background/40 border-white/10 h-9 text-xs"
          />
          <Button size="sm" className="btn-pill h-9" onClick={addCustom}>
            <Plus className="w-4 h-4 mr-1" /> Añadir
          </Button>
        </div>
        {draftMinutes > 0 && (
          <p className="text-[11px] text-muted-foreground pl-0.5">
            Saltará {formatLeadTime(draftMinutes)} {draftType === 'alarma' ? '(sonará una alarma)' : '(solo notificación silenciosa)'}.
          </p>
        )}
      </div>
    </div>
  );
}
