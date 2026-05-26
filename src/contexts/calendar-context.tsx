// src/contexts/calendar-context.tsx
'use client';

/**
 * Calendario Unificado — Fuente única de verdad temporal del SOSD.
 *
 * Esta store comparte la información entre /hub y /network/culture y cualquier
 * otra superficie que necesite los datos temporales del usuario. Mantiene
 * tres categorías:
 *   - events     → Eventos comunitarios y personales (con ubicación, aforo…)
 *   - reminders  → Recordatorios + alarmas configuradas por el usuario.
 *   - systemLogs → Hitos del sistema (votaciones, despliegues, hitos IA…).
 *
 * Cada ítem tiene una `layer` que permite filtrar visualmente desde el
 * calendario, y un campo `visibility` que decide si está conectado a la Red
 * (público) o pertenece sólo al usuario (privado). El "Exocórtex" (IA personal)
 * accede al snapshot completo para razonar con contexto temporal.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { communityEvents } from '@/lib/data';

// ── Tipos ────────────────────────────────────────────────────────────────────
export type CalendarLayer =
  | 'politica'
  | 'cultura'
  | 'educacion'
  | 'bienestar'
  | 'personal'
  | 'recordatorios'
  | 'alarmas'
  | 'sistema'
  | 'externa';

export type CalendarVisibility = 'privado' | 'publico' | 'red';

export type CalendarRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type CalendarPriority = 'baja' | 'normal' | 'alta';

/**
 * Aviso configurable asociado a un evento. Se dispara `leadMinutes` minutos
 * antes del comienzo del evento. Si `type === 'alarma'` reproduce sonido y
 * abre un modal modal con snooze/dismiss; si es `recordatorio` solo notifica.
 */
export interface EventReminder {
  id: string;
  /** Minutos antes del comienzo del evento. */
  leadMinutes: number;
  /** Recordatorio (silencioso) vs alarma (sonido + modal). */
  type: 'recordatorio' | 'alarma';
  /** Etiqueta opcional ("salir antes", "calentar voz"…). */
  label?: string;
}

export interface CalendarItem {
  id: string;
  title: string;
  description?: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** ISO date final (para eventos multi-día). Si omitido = date. */
  endDate?: string;
  /** HH:MM (24h) — opcional para todo el día */
  time?: string;
  /** Duración estimada en minutos */
  durationMin?: number;
  /** Todo el día (ignora time/durationMin). */
  allDay?: boolean;
  layer: CalendarLayer;
  visibility: CalendarVisibility;
  location?: string;
  attendees?: number;
  capacity?: number;
  urgent?: boolean;
  priority?: CalendarPriority;
  tags?: string[];
  recurrence?: CalendarRecurrence;
  /** Color tag (clase Tailwind base) — derivado de layer si se omite. */
  color?: string;
  /** Avisos (recordatorios y alarmas) configurados para este evento. */
  reminders?: EventReminder[];
  /** Origen para integraciones con la Red (ej. id de propuesta, post…). */
  sourceRef?: string;
  createdAt?: string;
  /** Marcado por la IA como relevante (priorizado en sugerencias). */
  aiHighlight?: boolean;
}

/** Aviso activo en pantalla — un evento con su aviso disparado. */
export interface ActiveAlert {
  itemId: string;
  reminderId: string;
  firedAt: number;
}

export interface CalendarContextValue {
  items: CalendarItem[];
  visibleLayers: Record<CalendarLayer, boolean>;
  toggleLayer: (layer: CalendarLayer) => void;
  setAllLayers: (visible: boolean) => void;
  addItem: (item: Omit<CalendarItem, 'id' | 'createdAt'>) => CalendarItem;
  updateItem: (id: string, patch: Partial<CalendarItem>) => void;
  removeItem: (id: string) => void;
  shareItem: (id: string) => void;
  addReminder: (itemId: string, reminder: Omit<EventReminder, 'id'>) => void;
  updateReminder: (itemId: string, reminderId: string, patch: Partial<EventReminder>) => void;
  removeReminder: (itemId: string, reminderId: string) => void;
  itemsByDate: (isoDate: string) => CalendarItem[];
  aiContextSnapshot: () => string;
  /** Aviso activo (alarma sonando o recordatorio en banner). */
  activeAlert: ActiveAlert | null;
  setActiveAlert: (a: ActiveAlert | null) => void;
  /** Aplaza un aviso N minutos (re-arma para volver a sonar). */
  snoozeAlert: (itemId: string, reminderId: string, minutes: number) => void;
  /** Marca un aviso como ya disparado en esta sesión (evita re-disparo). */
  markAlertFired: (itemId: string, reminderId: string) => void;
  isAlertFired: (itemId: string, reminderId: string) => boolean;
}

// ── Metadatos de capa (color, etiqueta, descripción) ────────────────────────
export const LAYER_META: Record<
  CalendarLayer,
  { label: string; tone: string; bg: string; border: string; ring: string; dot: string; description: string }
> = {
  politica: {
    label: 'Política',
    tone: 'text-blue-300',
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/30',
    ring: 'ring-blue-500/30',
    dot: 'bg-blue-500',
    description: 'Asambleas, votaciones y debates legislativos.',
  },
  cultura: {
    label: 'Cultura',
    tone: 'text-purple-300',
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/30',
    ring: 'ring-purple-500/30',
    dot: 'bg-purple-500',
    description: 'Eventos artísticos, festivales y expresión.',
  },
  educacion: {
    label: 'Educación',
    tone: 'text-emerald-300',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    ring: 'ring-emerald-500/30',
    dot: 'bg-emerald-500',
    description: 'Talleres, grupos de estudio, mentorías y cursos.',
  },
  bienestar: {
    label: 'Bienestar',
    tone: 'text-cyan-300',
    bg: 'bg-cyan-500/15',
    border: 'border-cyan-500/30',
    ring: 'ring-cyan-500/30',
    dot: 'bg-cyan-500',
    description: 'Meditaciones, salud y comunidad.',
  },
  personal: {
    label: 'Personal',
    tone: 'text-pink-300',
    bg: 'bg-pink-500/15',
    border: 'border-pink-500/30',
    ring: 'ring-pink-500/30',
    dot: 'bg-pink-500',
    description: 'Eventos de tu agenda privada.',
  },
  recordatorios: {
    label: 'Recordatorios',
    tone: 'text-amber-300',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    ring: 'ring-amber-500/30',
    dot: 'bg-amber-500',
    description: 'Notas con fecha y tareas pendientes.',
  },
  alarmas: {
    label: 'Alarmas',
    tone: 'text-red-300',
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    ring: 'ring-red-500/30',
    dot: 'bg-red-500',
    description: 'Avisos activos con notificación programada.',
  },
  sistema: {
    label: 'Logs del Sistema',
    tone: 'text-slate-300',
    bg: 'bg-slate-500/15',
    border: 'border-slate-400/30',
    ring: 'ring-slate-400/30',
    dot: 'bg-slate-400',
    description: 'Eventos automáticos del SOSD: votos, despliegues, sincronizaciones.',
  },
  externa: {
    label: 'Capas Externas',
    tone: 'text-indigo-300',
    bg: 'bg-indigo-500/15',
    border: 'border-indigo-400/30',
    ring: 'ring-indigo-400/30',
    dot: 'bg-indigo-400',
    description: 'Bases de datos y servidores conectados.',
  },
};

export const ALL_LAYERS: CalendarLayer[] = [
  'politica',
  'cultura',
  'educacion',
  'bienestar',
  'personal',
  'recordatorios',
  'alarmas',
  'sistema',
  'externa',
];

// Mapea el "type" textual de communityEvents → capa estructurada
const typeToLayer = (type: string): CalendarLayer => {
  const t = type.toLowerCase();
  if (t.includes('polít') || t.includes('politic')) return 'politica';
  if (t.includes('cultur') || t.includes('arte')) return 'cultura';
  if (t.includes('educ') || t.includes('hackathon') || t.includes('clase') || t.includes('taller')) return 'educacion';
  if (t.includes('bien') || t.includes('medit') || t.includes('salud')) return 'bienestar';
  return 'personal';
};

// ── Seed ────────────────────────────────────────────────────────────────────
const seedItems: CalendarItem[] = [
  // Eventos de comunidad importados del dataset existente
  ...communityEvents.map((e): CalendarItem => ({
    id: e.id,
    title: e.title,
    date: e.date,
    time: e.time,
    durationMin: 90,
    layer: typeToLayer(e.type),
    visibility: 'publico',
    location: e.location,
    attendees: e.attendees,
    capacity: e.capacity,
    urgent: e.urgent,
    recurrence: 'none',
    sourceRef: e.id,
  })),
  // Recordatorios y alarmas semilla
  {
    id: 'rem-1',
    title: 'Cerrar voto: Ley de Soberanía de Datos',
    date: '2026-05-29',
    time: '17:00',
    layer: 'recordatorios',
    visibility: 'privado',
    description: 'No olvides emitir tu voto antes del cierre.',
    aiHighlight: true,
  },
  {
    id: 'alm-1',
    title: 'Alarma — Asamblea General',
    date: '2026-06-20',
    time: '17:45',
    layer: 'alarmas',
    visibility: 'privado',
    description: '15 minutos antes del comienzo.',
  },
  // Logs del sistema
  {
    id: 'sys-1',
    title: 'Sincronización Fediverso completada',
    date: '2026-05-26',
    time: '04:12',
    layer: 'sistema',
    visibility: 'privado',
    description: 'Nodo replicado a 12 instancias federadas.',
  },
  {
    id: 'sys-2',
    title: 'Despliegue del nodo de gobernanza v2.1',
    date: '2026-05-27',
    time: '09:00',
    layer: 'sistema',
    visibility: 'red',
    description: 'Actualización del módulo de Democracia Líquida.',
  },
];

// ── Contexto ────────────────────────────────────────────────────────────────
const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CalendarItem[]>(seedItems);
  const [visibleLayers, setVisibleLayers] = useState<Record<CalendarLayer, boolean>>(
    ALL_LAYERS.reduce((acc, l) => ({ ...acc, [l]: true }), {} as Record<CalendarLayer, boolean>)
  );
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  // Set de "itemId::reminderId" ya disparados (no se persiste — sólo sesión).
  const firedAlertsRef = useRef<Set<string>>(new Set());

  const toggleLayer = useCallback((layer: CalendarLayer) => {
    setVisibleLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const setAllLayers = useCallback((visible: boolean) => {
    setVisibleLayers(ALL_LAYERS.reduce((acc, l) => ({ ...acc, [l]: visible }), {} as Record<CalendarLayer, boolean>));
  }, []);

  const addItem: CalendarContextValue['addItem'] = useCallback((data) => {
    const newItem: CalendarItem = {
      id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      recurrence: 'none',
      ...data,
    };
    setItems((prev) => [...prev, newItem]);
    return newItem;
  }, []);

  const updateItem: CalendarContextValue['updateItem'] = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem: CalendarContextValue['removeItem'] = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const shareItem: CalendarContextValue['shareItem'] = useCallback((id) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, visibility: it.visibility === 'red' ? 'publico' : 'red' } : it))
    );
  }, []);

  const addReminder: CalendarContextValue['addReminder'] = useCallback((itemId, reminder) => {
    const newReminder: EventReminder = {
      id: `rmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...reminder,
    };
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, reminders: [...(it.reminders ?? []), newReminder] }
          : it
      )
    );
  }, []);

  const updateReminder: CalendarContextValue['updateReminder'] = useCallback((itemId, reminderId, patch) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              reminders: (it.reminders ?? []).map((r) => (r.id === reminderId ? { ...r, ...patch } : r)),
            }
          : it
      )
    );
  }, []);

  const removeReminder: CalendarContextValue['removeReminder'] = useCallback((itemId, reminderId) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, reminders: (it.reminders ?? []).filter((r) => r.id !== reminderId) }
          : it
      )
    );
    // Si snooze, también limpiar el "fired" anterior para que pueda volver a disparar.
    firedAlertsRef.current.delete(`${itemId}::${reminderId}`);
  }, []);

  const itemsByDate = useCallback(
    (isoDate: string) => items.filter((it) => it.date === isoDate),
    [items]
  );

  const aiContextSnapshot = useCallback(() => {
    // Snapshot que el Exocórtex inyecta como contexto para responder con
    // conocimiento del calendario completo del usuario.
    const lines = items
      .slice()
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
      .map((it) => {
        const layer = LAYER_META[it.layer].label;
        const time = it.allDay ? ' (todo el día)' : it.time ? ` ${it.time}` : '';
        const vis = it.visibility === 'red' ? '[público en la Red]' : it.visibility === 'publico' ? '[público]' : '[privado]';
        const reminders = it.reminders?.length ? ` · avisos: ${it.reminders.length}` : '';
        return `• ${it.date}${time} — ${layer} — ${it.title} ${vis}${reminders}`;
      });
    return ['CONTEXTO_TEMPORAL_USUARIO', ...lines].join('\n');
  }, [items]);

  const markAlertFired = useCallback((itemId: string, reminderId: string) => {
    firedAlertsRef.current.add(`${itemId}::${reminderId}`);
  }, []);

  const isAlertFired = useCallback((itemId: string, reminderId: string) => {
    return firedAlertsRef.current.has(`${itemId}::${reminderId}`);
  }, []);

  const snoozeAlert: CalendarContextValue['snoozeAlert'] = useCallback((itemId, reminderId, minutes) => {
    // Estrategia: aumentar leadMinutes del aviso para que el scheduler vuelva
    // a evaluarlo. Si tras el snooze el momento de disparo queda en el pasado
    // pero antes del evento, el scheduler volverá a dispararlo en el próximo
    // tick.
    firedAlertsRef.current.delete(`${itemId}::${reminderId}`);
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          reminders: (it.reminders ?? []).map((r) => {
            if (r.id !== reminderId) return r;
            // Reducimos lead time para que se vuelva a disparar +minutes desde ahora
            // calculamos: nuevo leadMinutes = (eventTime - (now + minutes)) en minutos
            const eventDate = parseISODate(it.date);
            if (it.time) {
              const [h, m] = it.time.split(':').map(Number);
              eventDate.setHours(h ?? 0, m ?? 0, 0, 0);
            }
            const eventMs = eventDate.getTime();
            const targetMs = Date.now() + minutes * 60 * 1000;
            const newLead = Math.max(0, Math.round((eventMs - targetMs) / 60000));
            return { ...r, leadMinutes: newLead };
          }),
        };
      })
    );
    setActiveAlert(null);
  }, []);

  const value = useMemo<CalendarContextValue>(
    () => ({
      items,
      visibleLayers,
      toggleLayer,
      setAllLayers,
      addItem,
      updateItem,
      removeItem,
      shareItem,
      addReminder,
      updateReminder,
      removeReminder,
      itemsByDate,
      aiContextSnapshot,
      activeAlert,
      setActiveAlert,
      snoozeAlert,
      markAlertFired,
      isAlertFired,
    }),
    [
      items,
      visibleLayers,
      toggleLayer,
      setAllLayers,
      addItem,
      updateItem,
      removeItem,
      shareItem,
      addReminder,
      updateReminder,
      removeReminder,
      itemsByDate,
      aiContextSnapshot,
      activeAlert,
      snoozeAlert,
      markAlertFired,
      isAlertFired,
    ]
  );

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar(): CalendarContextValue {
  const ctx = useContext(CalendarContext);
  if (!ctx) {
    throw new Error('useCalendar debe usarse dentro de <CalendarProvider>');
  }
  return ctx;
}

// ── Helpers de fecha (sin libs) ─────────────────────────────────────────────
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatLongDate(iso: string, locale = 'es-ES'): string {
  return parseISODate(iso).toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Devuelve la fecha+hora del evento como timestamp en ms. */
export function eventDateTimeMs(item: Pick<CalendarItem, 'date' | 'time' | 'allDay'>): number {
  const d = parseISODate(item.date);
  if (!item.allDay && item.time) {
    const [h, m] = item.time.split(':').map(Number);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0); // por defecto eventos de todo el día se "anclan" a las 09:00 para los avisos
  }
  return d.getTime();
}

/** Devuelve el ms en que un aviso debería dispararse. */
export function reminderFireMs(item: CalendarItem, reminder: EventReminder): number {
  return eventDateTimeMs(item) - reminder.leadMinutes * 60 * 1000;
}

/** Formatea un leadMinutes a texto legible: "15 min antes", "1 día antes"… */
export function formatLeadTime(leadMinutes: number): string {
  if (leadMinutes <= 0) return 'En el momento';
  if (leadMinutes < 60) return `${leadMinutes} min antes`;
  if (leadMinutes < 60 * 24) {
    const h = Math.round((leadMinutes / 60) * 10) / 10;
    return `${h % 1 === 0 ? h.toFixed(0) : h} h antes`;
  }
  const d = Math.round((leadMinutes / (60 * 24)) * 10) / 10;
  if (d < 7) return `${d % 1 === 0 ? d.toFixed(0) : d} día${d === 1 ? '' : 's'} antes`;
  const w = Math.round((leadMinutes / (60 * 24 * 7)) * 10) / 10;
  return `${w % 1 === 0 ? w.toFixed(0) : w} semana${w === 1 ? '' : 's'} antes`;
}

/** Presets de tiempo (en minutos) para el editor de avisos. */
export const REMINDER_PRESETS: { label: string; minutes: number }[] = [
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 h', minutes: 60 },
  { label: '2 h', minutes: 120 },
  { label: '1 día', minutes: 60 * 24 },
  { label: '2 días', minutes: 60 * 24 * 2 },
  { label: '1 semana', minutes: 60 * 24 * 7 },
];
