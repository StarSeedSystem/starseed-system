// src/contexts/calendar-context.tsx
'use client';

/**
 * Sincrómetro Unificado — Fuente única de verdad temporal del SOSD.
 *
 * (Antes "Calendario Unificado". Renombrado a Sincrómetro para reflejar que
 * el sistema mide la simultaneidad entre varios ciclos a la vez —
 * gregoriano, astrológico y lunar — sobre los mismos datos.)
 *
 * Esta store comparte la información entre /hub y /network/culture y cualquier
 * otra superficie que necesite los datos temporales del usuario. Mantiene
 * tres categorías:
 *   - events     → Eventos comunitarios y personales (con ubicación, aforo…)
 *   - reminders  → Recordatorios + alarmas configuradas por el usuario.
 *   - systemLogs → Hitos del sistema (votaciones, despliegues, hitos IA…).
 *
 * Cada ítem tiene una `layer` que permite filtrar visualmente desde el
 * sincrómetro, y un campo `visibility` que decide si está conectado a la Red
 * (público) o pertenece sólo al usuario (privado). El "Exocórtex" (IA personal)
 * accede al snapshot completo para razonar con contexto temporal.
 *
 * IMPORTANTE — Invariante de sincronización:
 * Todos los eventos, recordatorios y alarmas se guardan SIEMPRE en `date`
 * ISO (YYYY-MM-DD). El `SincrometroMode` activo solo determina cómo se VEN
 * — nunca cómo se almacenan. Por eso un evento creado en modo lunar es
 * visible idéntico en modo gregoriano y astrológico, y viceversa.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { communityEvents } from '@/lib/data';
import type { SincrometroMode } from '@/lib/sincrometro';
import {
  createEvent as createRemoteEvent,
  listEvents as listRemoteEvents,
} from '@/lib/events/events-store';
import { listOsEventsForCalendar } from '@/lib/events/os-events-calendar';
import { listVotingDeadlines } from '@/lib/events/governance-calendar';
import { onTableChange } from '@/lib/realtime/realtime';

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
  /** Modo de sincrómetro activo (vista temporal). NO afecta el almacenamiento. */
  sincrometroMode: SincrometroMode;
  setSincrometroMode: (mode: SincrometroMode) => void;
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
// Sin semillas de ejemplo: los eventos, recordatorios, alarmas y logs provienen
// SIEMPRE de fuentes reales (Supabase, entradas del usuario, gobernanza).
// Petición explícita del usuario (2026-07-01): ningún dato falso de
// reuniones/eventos en ningún perfil ni cuenta del sistema.
const seedItems: CalendarItem[] = [];

// ── Contexto ────────────────────────────────────────────────────────────────
const CalendarContext = createContext<CalendarContextValue | null>(null);

const SINCROMETRO_MODE_KEY = 'starseed.sincrometro.mode.v1';

function loadInitialMode(): SincrometroMode {
  if (typeof window === 'undefined') return 'gregoriano';
  try {
    const stored = window.localStorage.getItem(SINCROMETRO_MODE_KEY);
    if (stored === 'gregoriano' || stored === 'astrologico' || stored === 'lunar') {
      return stored;
    }
  } catch {
    /* ignore: SSR or storage disabled */
  }
  return 'gregoriano';
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CalendarItem[]>(seedItems);
  const [visibleLayers, setVisibleLayers] = useState<Record<CalendarLayer, boolean>>(
    ALL_LAYERS.reduce((acc, l) => ({ ...acc, [l]: true }), {} as Record<CalendarLayer, boolean>)
  );
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const [sincrometroMode, setSincrometroModeState] = useState<SincrometroMode>(loadInitialMode);
  // Set de "itemId::reminderId" ya disparados (no se persiste — sólo sesión).
  const firedAlertsRef = useRef<Set<string>>(new Set());

  // ── Eventos reales (Supabase) ──────────────────────────────────────────────
  // ADITIVO: los eventos de la tabla `events` se MEZCLAN con la semilla local
  // (`communityEvents` + recordatorios/logs). Si no hay sesión o red, la lista
  // sigue siendo la semilla — el calendario nunca deja de funcionar.
  //
  // `remoteIdsRef` recuerda qué ids provienen de Supabase para poder refrescar
  // sólo esos en cada recarga sin tocar la semilla ni los ítems creados en
  // local. La de-duplicación es por `id`.
  const remoteIdsRef = useRef<Set<string>>(new Set());

  const reloadRemoteEvents = useCallback(async () => {
    try {
      // Tres fuentes REMOTAS, todas "nunca lanzan / [] ante fallo":
      //   1) `events`        → eventos del Sincrómetro (events-store).
      //   2) `os_events`     → eventos sociales (os-social) con fecha.
      //   3) `proposals`     → cierres de votación de gobernanza (solo lectura).
      // Se combinan y de-duplican por id. Si TODAS fallan, la lista sigue siendo
      // la semilla local (el calendario nunca deja de funcionar). Sin datos
      // falsos: cada fuente devuelve [] cuando no hay nada real que mostrar.
      const [events, osEvents, deadlines] = await Promise.all([
        listRemoteEvents(),
        listOsEventsForCalendar(),
        listVotingDeadlines(),
      ]);

      // Dedupe de las fuentes remotas entre sí (por id).
      const remoteMerged: CalendarItem[] = [];
      const remoteSeen = new Set<string>();
      for (const it of [...events, ...osEvents, ...deadlines]) {
        if (remoteSeen.has(it.id)) continue;
        remoteSeen.add(it.id);
        remoteMerged.push(it);
      }

      const remoteIds = remoteSeen;
      remoteIdsRef.current = remoteIds;
      setItems((prev) => {
        // Conservamos todo lo que NO es remoto (semilla + creados en local)…
        const localOnly = prev.filter((it) => !remoteIds.has(it.id));
        // …y añadimos los remotos frescos. Dedupe final por id por seguridad.
        const seen = new Set<string>();
        const merged: CalendarItem[] = [];
        for (const it of [...localOnly, ...remoteMerged]) {
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          merged.push(it);
        }
        return merged;
      });
    } catch {
      /* degradación silenciosa: conservamos la semilla local */
    }
  }, []);

  // Carga inicial de eventos reales (sólo en cliente) + suscripción realtime
  // para sincronizar altas/cambios/bajas en vivo. SSR-safe: en el servidor no
  // se ejecuta nada. Si la suscripción no puede crearse, degrada a no-op.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    void reloadRemoteEvents();
    // Suscripciones realtime a las tres tablas que alimentan el calendario.
    // Cada `onTableChange` es SSR-safe y degrada a no-op si no está disponible.
    const unsubs = [
      onTableChange('events', {}, () => void reloadRemoteEvents()),
      onTableChange('os_events', {}, () => void reloadRemoteEvents()),
      onTableChange('proposals', {}, () => void reloadRemoteEvents()),
    ];
    return () => {
      for (const u of unsubs) {
        try {
          u();
        } catch {
          /* noop */
        }
      }
    };
  }, [reloadRemoteEvents]);

  const setSincrometroMode = useCallback((mode: SincrometroMode) => {
    setSincrometroModeState(mode);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(SINCROMETRO_MODE_KEY, mode); } catch { /* noop */ }
    }
  }, []);

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
    // 1) Inserción optimista en local: la UI reacciona al instante y, si no hay
    //    sesión/red, el evento sigue existiendo (comportamiento histórico).
    setItems((prev) => [...prev, newItem]);

    // 2) ADITIVO: intentamos PERSISTIR el evento en Supabase (tabla `events`).
    //    Es best-effort: si falla (sin sesión, sin red, RLS…), el ítem local
    //    permanece intacto y no se rompe nada. Si tiene éxito, reconciliamos el
    //    ítem optimista con la fila real (mismo contenido, id de la BD) para
    //    evitar duplicados cuando llegue por realtime / próxima recarga.
    void persistNewItem(newItem);

    return newItem;
  }, []);

  // Persiste un `CalendarItem` recién creado como fila de `events` y, si lo
  // consigue, sustituye el ítem optimista por el persistido (id real).
  const persistNewItem = useCallback(async (item: CalendarItem) => {
    if (typeof window === 'undefined') return;
    try {
      const startsAt = eventDateTimeMs(item);
      const start = new Date(startsAt);
      const endsAt =
        item.durationMin && item.durationMin > 0
          ? new Date(startsAt + item.durationMin * 60 * 1000)
          : item.endDate
            ? parseISODate(item.endDate)
            : null;

      const created = await createRemoteEvent({
        title: item.title,
        description: item.description,
        startsAt: start,
        endsAt: endsAt,
        // Guardamos la capa canónica como `kind`: round-trip exacto al recargar.
        kind: item.layer,
        visibility:
          item.visibility === 'publico' || item.visibility === 'red'
            ? 'public'
            : 'private',
        meta: {
          attendees: item.attendees,
          capacity: item.capacity,
          urgent: item.urgent,
          color: item.color,
          tags: item.tags,
          durationMin: item.durationMin,
          aiHighlight: item.aiHighlight,
          // Conservamos la visibilidad fina (`red`) que la BD no distingue.
          visibilityHint: item.visibility,
        },
      });

      if (!created) return; // sin sesión/red: nos quedamos con el ítem local.

      // Reconciliación: registramos el id remoto y reemplazamos el optimista.
      remoteIdsRef.current.add(created.id);
      setItems((prev) => {
        const withoutOptimistic = prev.filter((it) => it.id !== item.id);
        if (withoutOptimistic.some((it) => it.id === created.id)) {
          return withoutOptimistic; // ya llegó por realtime
        }
        return [...withoutOptimistic, created];
      });
    } catch {
      /* best-effort: el ítem local permanece, sin romper el calendario */
    }
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
      sincrometroMode,
      setSincrometroMode,
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
      sincrometroMode,
      setSincrometroMode,
    ]
  );

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar(): CalendarContextValue {
  const ctx = useContext(CalendarContext);
  // Fallback seguro durante prerender/build (SSG) de páginas como /hub:
  // en runtime el <CalendarProvider> de AppProviders provee el valor real.
  // Lanzar error aquí rompía el build de Vercel (prerender fuera de provider).
  if (!ctx) {
    return {
      items: [],
      visibleLayers: {} as Record<CalendarLayer, boolean>,
      toggleLayer: () => undefined as any,
      setAllLayers: () => undefined as any,
      addItem: () => undefined as any,
      updateItem: () => undefined as any,
      removeItem: () => undefined as any,
      shareItem: () => undefined as any,
      addReminder: () => undefined as any,
      updateReminder: () => undefined as any,
      removeReminder: () => undefined as any,
      itemsByDate: () => [],
      aiContextSnapshot: () => '',
      activeAlert: null,
      setActiveAlert: () => undefined as any,
      snoozeAlert: () => undefined as any,
      markAlertFired: () => undefined as any,
      isAlertFired: () => false,
      sincrometroMode: 'off' as any,
      setSincrometroMode: () => undefined as any,
    };
  }
  return ctx;
}

// ── Alias semánticos de Sincrómetro ──────────────────────────────────────
// La store es la misma; estos nombres permiten que el código nuevo lea como
// "sincrómetro" mientras los consumidores anteriores siguen funcionando.

/** Alias canónico moderno del provider; idéntico a `CalendarProvider`. */
export const SincrometroProvider = CalendarProvider;
/** Hook canónico moderno; idéntico a `useCalendar`. */
export const useSincrometro = useCalendar;
export type SincrometroItem = CalendarItem;
export type SincrometroLayer = CalendarLayer;
export type SincrometroVisibility = CalendarVisibility;
export type SincrometroContextValue = CalendarContextValue;

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
