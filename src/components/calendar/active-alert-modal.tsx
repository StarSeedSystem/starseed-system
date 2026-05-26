// src/components/calendar/active-alert-modal.tsx
'use client';

/**
 * ActiveAlertModal — overlay que aparece cuando una alarma del calendario
 * se dispara. Muestra evento, hora, etiqueta del aviso, opciones de snooze
 * (5/10/15/30 min) y botón "Detener". El sonido y el ciclo viven en
 * AlarmScheduler — este componente solo es UX.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlarmClock, BellOff, Snowflake } from 'lucide-react';
import {
  formatLeadTime,
  formatLongDate,
  LAYER_META,
  useCalendar,
} from '@/contexts/calendar-context';
import { cn } from '@/lib/utils';
import { stopAlarmSound } from './alarm-scheduler';

const SNOOZE_OPTIONS = [5, 10, 15, 30];

export function ActiveAlertModal() {
  const { activeAlert, setActiveAlert, items, snoozeAlert } = useCalendar();
  if (!activeAlert) return null;

  const item = items.find((it) => it.id === activeAlert.itemId);
  const reminder = item?.reminders?.find((r) => r.id === activeAlert.reminderId);
  if (!item || !reminder) return null;

  const meta = LAYER_META[item.layer];

  const dismiss = () => {
    stopAlarmSound();
    setActiveAlert(null);
  };

  const snooze = (minutes: number) => {
    stopAlarmSound();
    snoozeAlert(item.id, reminder.id, minutes);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-md liquid-glass-panel border-red-500/30 animate-in zoom-in-95 fade-in-50 duration-300">
        <DialogHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/30 blur-xl rounded-full animate-pulse" />
              <div className="relative bg-red-500/15 border border-red-500/40 rounded-full p-4">
                <AlarmClock className="w-8 h-8 text-red-300 animate-bounce" />
              </div>
            </div>
          </div>
          <DialogTitle className="text-center font-headline text-2xl">
            ⏰ {item.title}
          </DialogTitle>
          <DialogDescription className="text-center space-y-1">
            <span className={cn('inline-block text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border', meta.bg, meta.tone, meta.border)}>
              {meta.label}
            </span>
            <div className="text-sm text-foreground/80 capitalize">{formatLongDate(item.date)}</div>
            {item.time && !item.allDay && (
              <div className="text-sm text-foreground/80">a las {item.time}</div>
            )}
            <div className="text-xs text-muted-foreground pt-1">
              Aviso: {formatLeadTime(reminder.leadMinutes)}{reminder.label ? ` · ${reminder.label}` : ''}
            </div>
            {item.location && (
              <div className="text-xs text-muted-foreground">{item.location}</div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 text-center">
            Aplazar
          </p>
          <div className="grid grid-cols-4 gap-2">
            {SNOOZE_OPTIONS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant="outline"
                className="btn-pill border-white/15 h-9 text-xs"
                onClick={() => snooze(m)}
              >
                <Snowflake className="w-3.5 h-3.5 mr-1" /> {m} min
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button className="btn-pill w-full bg-red-500/80 hover:bg-red-500 text-white" onClick={dismiss}>
            <BellOff className="w-4 h-4 mr-1.5" /> Detener alarma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
