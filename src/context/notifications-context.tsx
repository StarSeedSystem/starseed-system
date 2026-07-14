"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Sistema de Notificaciones del SOSD.
 *
 * Tipo "atómico": cada notificación es una Entidad Única, no se duplica.
 * Persistencia local en localStorage (privacidad por defecto).
 * Las notificaciones del sistema y de la red federada se materializan aquí.
 *
 * Categorías inspiradas en los 3 ecosistemas (político, educativo, cultural)
 * + sistema interno + IA + menciones personales.
 */

export type NotificationCategory =
  | "system"
  | "ai"
  | "mention"
  | "governance"
  | "culture"
  | "education"
  | "community"
  | "achievement";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  /** ISO timestamp */
  createdAt: string;
  /** Si el usuario la marcó como leída */
  read: boolean;
  /** Si el usuario la archivó */
  archived: boolean;
  /** Snooze hasta este timestamp; mientras esté en el futuro no se muestra */
  snoozedUntil?: string;
  /** Acción primaria (CTA) */
  action?: {
    label: string;
    href?: string;
    /** Si en lugar de href se quiere callback, almacenar id que el listener interpreta */
    callbackId?: string;
  };
  /** Origen federado opcional */
  source?: {
    node?: string;
    actorDid?: string;
  };
  /** Icono opcional (nombre de Lucide) */
  iconName?: string;
  /** Origen: id de la app que la emitió (Adenda 69 · J-1). Vacío = sistema. */
  appId?: string;
  /** Nombre legible de la app de origen (para pintar «desde X»). */
  appName?: string;
}

interface NotificationsState {
  list: AppNotification[];
}

interface NotificationsContextType {
  /** Todas las notificaciones (incluidas leídas / snoozed / archivadas) */
  all: AppNotification[];
  /** Notificaciones activas (no archivadas y no snoozed en el futuro) */
  inbox: AppNotification[];
  /** No leídas dentro del inbox */
  unread: AppNotification[];
  /** Conteo rápido */
  unreadCount: number;
  /** Filtrado por categoría */
  byCategory: (cat: NotificationCategory) => AppNotification[];

  add: (n: Omit<AppNotification, "id" | "createdAt" | "read" | "archived">) => string;
  markRead: (id: string, read?: boolean) => void;
  markAllRead: () => void;
  archive: (id: string) => void;
  unarchive: (id: string) => void;
  snooze: (id: string, untilIso: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

const STORAGE_KEY = "starseed.notifications.v1";

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const SEED: AppNotification[] = [
  {
    id: "seed-welcome",
    title: "Bienvenido a tu StarSeed",
    body: "Tu Exocórtex está listo. Pulsa el botón Editor en el menú IA (Zenith) para empezar a personalizar.",
    category: "system",
    priority: "normal",
    createdAt: nowIso(),
    read: false,
    archived: false,
    iconName: "Sparkles",
  },
  {
    id: "seed-governance",
    title: "Nueva propuesta en /network/politics",
    body: "“Holocracia Cuántica” entró en fase de deliberación. Puedes leer el análisis de impacto generado por IA.",
    category: "governance",
    priority: "normal",
    createdAt: nowIso(),
    read: false,
    archived: false,
    action: { label: "Ver propuesta", href: "/network/politics" },
    iconName: "Users",
  },
  {
    id: "seed-ai",
    title: "Ollama detectado en localhost",
    body: "Puedes usar un modelo local sin enviar datos a terceros. Configúralo en Ajustes → IA & Modelos.",
    category: "ai",
    priority: "low",
    createdAt: nowIso(),
    read: true,
    archived: false,
    action: { label: "Configurar", href: "/settings?tab=ai" },
    iconName: "Bot",
  },
];

function loadState(): NotificationsState {
  if (typeof window === "undefined") return { list: SEED };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { list: SEED };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.list)) return { list: SEED };
    return parsed;
  } catch {
    return { list: SEED };
  }
}

function saveState(state: NotificationsState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NotificationsState>({ list: [] });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(loadState());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    saveState(state);
  }, [state, mounted]);

  const add: NotificationsContextType["add"] = useCallback((n) => {
    const id = uid();
    const next: AppNotification = {
      id,
      createdAt: nowIso(),
      read: false,
      archived: false,
      ...n,
    };
    setState((s) => ({ list: [next, ...s.list] }));
    return id;
  }, []);

  const markRead: NotificationsContextType["markRead"] = useCallback((id, read = true) => {
    setState((s) => ({ list: s.list.map((n) => (n.id === id ? { ...n, read } : n)) }));
  }, []);

  const markAllRead = useCallback(() => {
    setState((s) => ({ list: s.list.map((n) => ({ ...n, read: true })) }));
  }, []);

  const archive = useCallback((id: string) => {
    setState((s) => ({ list: s.list.map((n) => (n.id === id ? { ...n, archived: true, read: true } : n)) }));
  }, []);

  const unarchive = useCallback((id: string) => {
    setState((s) => ({ list: s.list.map((n) => (n.id === id ? { ...n, archived: false } : n)) }));
  }, []);

  const snooze = useCallback((id: string, untilIso: string) => {
    setState((s) => ({ list: s.list.map((n) => (n.id === id ? { ...n, snoozedUntil: untilIso } : n)) }));
  }, []);

  const remove = useCallback((id: string) => {
    setState((s) => ({ list: s.list.filter((n) => n.id !== id) }));
  }, []);

  const clearAll = useCallback(() => {
    setState({ list: [] });
  }, []);

  const value = useMemo<NotificationsContextType>(() => {
    const now = Date.now();
    const inbox = state.list.filter((n) => !n.archived && (!n.snoozedUntil || new Date(n.snoozedUntil).getTime() < now));
    const unread = inbox.filter((n) => !n.read);
    return {
      all: state.list,
      inbox,
      unread,
      unreadCount: unread.length,
      byCategory: (cat) => inbox.filter((n) => n.category === cat),
      add,
      markRead,
      markAllRead,
      archive,
      unarchive,
      snooze,
      remove,
      clearAll,
    };
  }, [state.list, add, markRead, markAllRead, archive, unarchive, snooze, remove, clearAll]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications debe usarse dentro de NotificationsProvider");
  return ctx;
}
