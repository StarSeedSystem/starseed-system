// src/contexts/stories-context.tsx
'use client';

/**
 * Historias Temporales — store global con TTL configurable.
 *
 * Cada historia tiene un dueño (perfil o página), un TTL elegido por el
 * autor (no limitado a 24h como Instagram), un tipo de contenido (imagen,
 * vídeo, texto, archivo, post programado) y un archivo histórico que
 * preserva las historias caducadas para acceso por su dueño.
 *
 * Persiste en localStorage. En producción se moverá a Supabase.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type StoryMediaKind = 'image' | 'video' | 'text' | 'file' | 'scheduled-post' | 'link';
export type StoryOwnerKind = 'profile' | 'page' | 'hub';

export interface StoryGradient {
  from: string;
  to: string;
  via?: string;
}

export interface Story {
  id: string;
  ownerKind: StoryOwnerKind;
  ownerId: string;
  ownerLabel: string;
  ownerAvatar?: string;
  /** Tipo principal del contenido. */
  media: StoryMediaKind;
  /** URL / dataURL / texto plano según el tipo. */
  content: string;
  /** Texto superpuesto opcional. */
  caption?: string;
  /** Fondo decorativo (gradiente o color sólido). */
  background?: StoryGradient | string;
  createdAt: string;
  /** Fecha en que dejará de aparecer en el strip activo. */
  expiresAt: string;
  /** Una vez expirada, ¿se guarda en el archivo? */
  archived: boolean;
  /** Personalización: glyph, etiqueta de categoría, color. */
  category?: string;
  categoryColor?: string;
  /** Lista de viewers que la han visto (solo ids; preserva privacidad). */
  viewedBy: string[];
  /** Permisos: pública en la red, sólo seguidores, o privada. */
  visibility: 'red' | 'seguidores' | 'privada';
}

interface StoriesContextValue {
  stories: Story[];
  activeStories: Story[];
  archivedStories: Story[];
  byOwner: (ownerKind: StoryOwnerKind, ownerId: string, opts?: { includeArchived?: boolean }) => Story[];
  addStory: (story: Omit<Story, 'id' | 'createdAt' | 'archived' | 'viewedBy'>) => Story;
  removeStory: (id: string) => void;
  markViewed: (id: string, viewerId: string) => void;
  extendTTL: (id: string, hours: number) => void;
}

const StoriesContext = createContext<StoriesContextValue | null>(null);
const STORAGE_KEY = 'starseed.stories.v1';

function loadStories(): Story[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  // Semilla con historias de ejemplo para los perfiles canónicos
  const now = Date.now();
  return [
    {
      id: 'story-seed-1',
      ownerKind: 'profile',
      ownerId: 'starseeduser',
      ownerLabel: 'Tú',
      media: 'text',
      content: 'Bienvenido al sistema de historias temporales del SOSD ✦',
      caption: 'Configura el TTL de cada historia desde 1 hora hasta 30 días.',
      background: { from: '#7c3aed', via: '#0ea5e9', to: '#10b981' },
      createdAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
      archived: false,
      category: 'Sistema',
      categoryColor: '#a78bfa',
      viewedBy: [],
      visibility: 'red',
    },
    {
      id: 'story-seed-2',
      ownerKind: 'hub',
      ownerId: 'hub-conexiones',
      ownerLabel: 'Hub',
      media: 'text',
      content: 'Asamblea Ontocrática mañana 17:00',
      caption: 'Vota la nueva Ley de Soberanía de Datos.',
      background: { from: '#0ea5e9', to: '#7c3aed' },
      createdAt: new Date(now - 30 * 60_000).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      archived: false,
      category: 'Gobernanza',
      categoryColor: '#38bdf8',
      viewedBy: [],
      visibility: 'red',
    },
  ];
}

function persist(items: Story[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* noop */ }
}

export function StoriesProvider({ children }: { children: ReactNode }) {
  const [stories, setStories] = useState<Story[]>([]);

  // Hidrato en cliente para evitar mismatch
  useEffect(() => {
    setStories(loadStories());
  }, []);

  // Marca como archivadas las historias expiradas, una vez por minuto
  useEffect(() => {
    const tick = () => {
      setStories((prev) => {
        const now = Date.now();
        let changed = false;
        const next = prev.map((s) => {
          if (!s.archived && new Date(s.expiresAt).getTime() <= now) {
            changed = true;
            return { ...s, archived: true };
          }
          return s;
        });
        if (changed) persist(next);
        return changed ? next : prev;
      });
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const addStory = useCallback<StoriesContextValue['addStory']>((s) => {
    const story: Story = {
      ...s,
      id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      archived: false,
      viewedBy: [],
    };
    setStories((prev) => {
      const next = [story, ...prev];
      persist(next);
      return next;
    });
    return story;
  }, []);

  const removeStory = useCallback((id: string) => {
    setStories((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const markViewed = useCallback((id: string, viewerId: string) => {
    setStories((prev) => {
      const next = prev.map((s) =>
        s.id === id && !s.viewedBy.includes(viewerId)
          ? { ...s, viewedBy: [...s.viewedBy, viewerId] }
          : s
      );
      persist(next);
      return next;
    });
  }, []);

  const extendTTL = useCallback((id: string, hours: number) => {
    setStories((prev) => {
      const next = prev.map((s) => {
        if (s.id !== id) return s;
        const newExp = new Date(new Date(s.expiresAt).getTime() + hours * 3_600_000).toISOString();
        return { ...s, expiresAt: newExp, archived: false };
      });
      persist(next);
      return next;
    });
  }, []);

  const byOwner = useCallback<StoriesContextValue['byOwner']>((kind, id, opts) => {
    return stories.filter((s) => {
      if (s.ownerKind !== kind || s.ownerId !== id) return false;
      if (!opts?.includeArchived && s.archived) return false;
      return true;
    });
  }, [stories]);

  const activeStories = useMemo(() => stories.filter((s) => !s.archived), [stories]);
  const archivedStories = useMemo(() => stories.filter((s) => s.archived), [stories]);

  const value = useMemo<StoriesContextValue>(
    () => ({
      stories,
      activeStories,
      archivedStories,
      byOwner,
      addStory,
      removeStory,
      markViewed,
      extendTTL,
    }),
    [stories, activeStories, archivedStories, byOwner, addStory, removeStory, markViewed, extendTTL]
  );

  return <StoriesContext.Provider value={value}>{children}</StoriesContext.Provider>;
}

export function useStories(): StoriesContextValue {
  const ctx = useContext(StoriesContext);
  // Fallback seguro durante prerender/build (SSG) de páginas como /hub:
  // en runtime el <StoriesProvider> de AppProviders provee el valor real.
  if (!ctx) {
    const noop = () => undefined as any;
    return {
      stories: [],
      activeStories: [],
      archivedStories: [],
      byOwner: () => [],
      addStory: () => undefined as any,
      removeStory: noop,
      markViewed: noop,
      extendTTL: noop,
    };
  }
  return ctx;
}

// Presets de TTL para el creador
export const STORY_TTL_PRESETS: { label: string; hours: number }[] = [
  { label: '1 hora', hours: 1 },
  { label: '6 horas', hours: 6 },
  { label: '12 horas', hours: 12 },
  { label: '24 horas', hours: 24 },
  { label: '3 días', hours: 72 },
  { label: '7 días', hours: 168 },
  { label: '30 días', hours: 720 },
];

export const STORY_GRADIENTS: { label: string; gradient: StoryGradient }[] = [
  { label: 'Cósmico',    gradient: { from: '#7c3aed', via: '#0ea5e9', to: '#10b981' } },
  { label: 'Aurora',     gradient: { from: '#0ea5e9', to: '#a78bfa' } },
  { label: 'Solar',      gradient: { from: '#f59e0b', via: '#ef4444', to: '#7c3aed' } },
  { label: 'Verdoso',    gradient: { from: '#10b981', to: '#0ea5e9' } },
  { label: 'Crepúsculo', gradient: { from: '#ec4899', via: '#a78bfa', to: '#0ea5e9' } },
  { label: 'Tierra',     gradient: { from: '#d97706', via: '#dc2626', to: '#7c2d12' } },
  { label: 'Sombra',     gradient: { from: '#1e293b', to: '#0f172a' } },
];
