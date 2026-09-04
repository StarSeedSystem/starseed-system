// src/components/layout/dock-config.ts
/**
 * Configuración persistente del OmniDock (Trinity Anchor) — el usuario
 * puede añadir, quitar y reordenar items. Los items "Hermes" son
 * predeterminados y se ofrecen como opciones añadibles. Lo mismo aplica
 * al Nexus y a /agent: el catálogo de "opciones rápidas" es el mismo y
 * el usuario decide qué exponer en cada superficie.
 */

import type React from 'react';
import {
  LayoutDashboard, CircleUser, MessagesSquare, Bell, Users, BookOpen, Library,
  Network, BrainCircuit, Settings, Compass, PenLine, ShieldCheck, LayoutGrid,
  Server, Vote, Lightbulb, Cpu, Brain, ShoppingBag, Award, AppWindow,
  CalendarClock, GitBranch, Sparkles, Zap, Wrench, Plug, Eye, HardDrive, Boxes,
  Camera, Images, RadioTower, Antenna, Radio, AudioLines, Gauge,
  Smile,
} from 'lucide-react';
// Garantía de botones predeterminados con la VERSIÓN DENTRO DEL PAYLOAD
// (Adenda 149 · tanda 3). El módulo es puro y sin dependencias: lo comparten
// este archivo y el motor de sincronización, que también debe normalizar.
import {
  DOCK_STORAGE_KEY,
  DOCK_DEFAULTS_VERSION,
  DOCK_DEFAULT_ON_IDS,
  normalizeDockState,
  parseDockPayload,
  registerDockSeedProvider,
  toDockPayload,
  type DockItemLike,
} from '@/lib/dock/dock-defaults';

export type DockColor = 'neutral' | 'cyan' | 'crimson' | 'amber' | 'emerald' | 'purple';

export interface DockItemConfig {
  id: string;
  label: string;
  iconKey: DockIconKey;
  path: string;
  color: DockColor;
  /** Visible en el dock (true) o solo disponible en el catálogo (false). */
  enabled: boolean;
  /** Origen: 'preset' (Hermes/system) o 'user' (custom). */
  origin: 'preset' | 'user';
}

/**
 * Cada clave representa un icono ÚNICO y concreto de `lucide-react`,
 * elegido para encajar con el concepto del item del dock. No se reutiliza
 * ningún icono entre items: cada sección tiene su propia identidad visual.
 * Todas las claves están mapeadas en `ICON_MAP` (ver omni-dock.tsx) — no se
 * depende del fallback genérico.
 */
export type DockIconKey =
  | 'LayoutDashboard' | 'CircleUser' | 'MessagesSquare' | 'Bell' | 'Users'
  | 'BookOpen' | 'Library' | 'Network' | 'BrainCircuit' | 'Settings'
  | 'Compass' | 'PenLine' | 'ShieldCheck' | 'LayoutGrid' | 'Server'
  | 'Vote' | 'Lightbulb' | 'Cpu' | 'Brain' | 'ShoppingBag'
  | 'Award' | 'AppWindow' | 'CalendarClock' | 'GitBranch' | 'Sparkles'
  | 'Zap' | 'Wrench' | 'Plug' | 'Eye' | 'HardDrive' | 'Boxes'
  // ── Medios (Cámara + Galería) ──
  | 'Camera' | 'Images'
  // ── Red / Conexiones (Red Mesh + Señales) ──
  | 'RadioTower' | 'Antenna'
  // ── Feed de red ──
  | 'Radio'
  // ── Voces (Ola 228) ──
  | 'AudioLines'
  // ── Mando (Ola 231) ──
  | 'Gauge'
  // ── Mundo de los avatares (Ola 234) ──
  | 'Smile';

/**
 * Mapa iconKey → componente de lucide-react. Fuente ÚNICA de verdad: la usan
 * tanto el OmniDock como el catálogo de accesos rápidos (QuickOptionsGrid),
 * que antes tenía su propio mapa con claves distintas (Home, User, …) y por eso
 * casi todos los items acababan en el icono de respaldo.
 */
export const DOCK_ICON_MAP: Record<DockIconKey, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, CircleUser, MessagesSquare, Bell, Users, BookOpen, Library,
  Network, BrainCircuit, Settings, Compass, PenLine, ShieldCheck, LayoutGrid,
  Server, Vote, Lightbulb, Cpu, Brain, ShoppingBag, Award, AppWindow,
  CalendarClock, GitBranch, Sparkles, Zap, Wrench, Plug, Eye, HardDrive, Boxes,
  Camera, Images, RadioTower, Antenna, Radio, AudioLines, Gauge, Smile,
};

/** Icono de respaldo defensivo (DOCK_ICON_MAP es total: no debería usarse). */
export const DOCK_FALLBACK_ICON = LayoutGrid;

const STORAGE_KEY = DOCK_STORAGE_KEY;
const FOLDERS_KEY = 'starseed.dock.folders.v1';
const FOLDER_STATE_KEY = 'starseed.dock.folders.open.v1';

/**
 * Folder del dock: agrupa varios items (por id) bajo una sola entrada que,
 * al pulsarse, se expande para revelar sus accesos directos hijos y se vuelve
 * a colapsar. Es ADITIVO: los items siguen existiendo en el catálogo; una
 * folder solo decide cuáles se muestran agrupados. El estado abierto/cerrado
 * se persiste aparte (FOLDER_STATE_KEY) para no ensuciar la definición.
 */
export interface DockFolderConfig {
  id: string;
  label: string;
  iconKey: DockIconKey;
  color: DockColor;
  /** ids de DockItemConfig contenidos en el folder, en orden. */
  itemIds: string[];
  /** Visible en el dock. */
  enabled: boolean;
}

/** Folders por defecto: ninguno (el usuario los crea desde el editor). */
export const DOCK_FOLDER_PRESETS: DockFolderConfig[] = [];

export function loadDockFolders(): DockFolderConfig[] {
  if (typeof window === 'undefined') return DOCK_FOLDER_PRESETS;
  try {
    const raw = window.localStorage.getItem(FOLDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Defensivo: normaliza cada folder y descarta entradas corruptas.
        return parsed
          .filter((f) => f && typeof f.id === 'string' && Array.isArray(f.itemIds))
          .map((f) => ({
            id: String(f.id),
            label: String(f.label ?? 'Folder'),
            iconKey: (f.iconKey ?? 'LayoutGrid') as DockIconKey,
            color: (f.color ?? 'neutral') as DockColor,
            itemIds: (f.itemIds as unknown[]).map((x) => String(x)),
            enabled: f.enabled !== false,
          }));
      }
    }
  } catch { /* noop */ }
  return DOCK_FOLDER_PRESETS;
}

export function saveDockFolders(folders: DockFolderConfig[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch { /* noop */ }
}

export function resetDockFolders() {
  saveDockFolders(DOCK_FOLDER_PRESETS);
}

/** Estado abierto/cerrado de cada folder (id → boolean). Persistido. */
export function loadDockFolderOpenState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(FOLDER_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
    }
  } catch { /* noop */ }
  return {};
}

export function saveDockFolderOpenState(state: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(state));
  } catch { /* noop */ }
}

/**
 * Catálogo base. Por defecto el dock muestra solo secciones del sistema +
 * UN solo botón de IA (Astraura AI). El resto de superficies IA (Cerebro,
 * Skills, Tools, MCPs, Sentidos, Setup) están disponibles desde el editor
 * para añadir si el usuario quiere accesos rápidos extra.
 *
 * Cada item tiene un icono propio y distinto (sin repeticiones) acorde a
 * su concepto, y un acento de color tematizado.
 */
export const DOCK_PRESETS: DockItemConfig[] = [
  // ── Sistema (visibles por defecto) ──
  { id: 'escritorios',   label: 'Escritorio',          iconKey: 'AppWindow',       path: '/escritorios',           color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'dashboard',     label: 'Dashboard',           iconKey: 'LayoutDashboard', path: '/dashboard',             color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'profile',       label: 'Perfil',              iconKey: 'CircleUser',      path: '/profile',               color: 'neutral', enabled: true,  origin: 'preset' },
  { id: 'messages',      label: 'Mensajes',            iconKey: 'MessagesSquare',  path: '/messages',              color: 'crimson', enabled: true,  origin: 'preset' },
  { id: 'notifications', label: 'Notificaciones',      iconKey: 'Bell',            path: '/notifications',         color: 'amber',   enabled: true,  origin: 'preset' },
  { id: 'hub',           label: 'Hub',                 iconKey: 'Users',           path: '/hub',                   color: 'emerald', enabled: true,  origin: 'preset' },
  { id: 'mylib',         label: 'Librería · Biblioteca', iconKey: 'Library',        path: '/library',               color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'netlib',        label: 'Librería Global',     iconKey: 'Library',         path: '/library?tab=explorar',  color: 'cyan',    enabled: false, origin: 'preset' },
  // Red·Nodos ya NO es botón del dock (pedido del usuario): vive dentro del
  // Hub (/hub?tab=red). Queda en el catálogo por si alguien lo quiere de vuelta.
  { id: 'nodes',         label: 'Red · Nodos',        iconKey: 'Network',         path: '/hub?tab=red',           color: 'crimson', enabled: false, origin: 'preset' },
  // ── IA: UN solo botón a la página principal por defecto ──
  { id: 'ai-studio',     label: 'Astraura AI',           iconKey: 'BrainCircuit',    path: '/agent',                 color: 'purple',  enabled: true,  origin: 'preset' },
  // Ola 6 · Adenda 158: la Imaginación Intuitiva es una PÁGINA propia, siempre
  // activa en segundo plano. Va al dock porque es donde el usuario va a querer
  // asomarse a lo que su IA está imaginando ahora mismo.
  { id: 'imaginacion',   label: 'Imaginación',         iconKey: 'Sparkles',        path: '/imaginacion',           color: 'purple',  enabled: true,  origin: 'preset' },
  { id: 'settings',      label: 'Ajustes',             iconKey: 'Settings',        path: '/settings',              color: 'neutral', enabled: true,  origin: 'preset' },
  { id: 'navegador',     label: 'Navegador',           iconKey: 'Compass',         path: '/navegador',             color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'pizarra',       label: 'Pizarra',             iconKey: 'PenLine',         path: '/pizarra',               color: 'purple',  enabled: true,  origin: 'preset' },
  { id: 'seguridad',     label: 'Seguridad',           iconKey: 'ShieldCheck',     path: '/seguridad',             color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'funciones',     label: 'Funciones',           iconKey: 'LayoutGrid',      path: '/funciones',             color: 'purple',  enabled: true,  origin: 'preset' },
  { id: 'servicios',     label: 'Servicios y Fuentes', iconKey: 'Server',          path: '/servicios',             color: 'cyan',    enabled: false, origin: 'preset' },
  { id: 'decisiones',    label: 'Decisiones',          iconKey: 'Vote',            path: '/decisiones',            color: 'amber',   enabled: false, origin: 'preset' },
  { id: 'conocimiento',  label: 'Conocimiento',        iconKey: 'Lightbulb',       path: '/conocimiento',          color: 'cyan',    enabled: false, origin: 'preset' },
  { id: 'cerebros',      label: 'Cerebros',            iconKey: 'Cpu',             path: '/cerebros',              color: 'purple',  enabled: false, origin: 'preset' },
  { id: 'cerebro',       label: 'Cerebro',             iconKey: 'Brain',           path: '/cerebro',               color: 'purple',  enabled: true,  origin: 'preset' },
  // La Tienda DESAPARECIÓ como concepto: sus funciones viven fundidas en la
  // pestaña «Explorar» de la Librería (/library). El item 'tienda' se retiró
  // del catálogo y la migración v5 lo purga de las configs guardadas.
  { id: 'insignias',     label: 'Insignias',           iconKey: 'Award',           path: '/insignias',             color: 'amber',   enabled: false, origin: 'preset' },
  { id: 'apps-ia',       label: 'Apps IA',             iconKey: 'AppWindow',       path: '/apps-ia',               color: 'emerald', enabled: false, origin: 'preset' },
  // AR/VR es ahora una función AUTOMÁTICA/contextual del OS (se activa donde
  // corresponde: espacio inmersivo, hub XR contextual y acciones de Aurora),
  // no un botón del dock. Se mantiene disponible en el catálogo (enabled:false)
  // por si el usuario quiere un acceso rápido opcional, pero ya no se muestra.
  { id: 'xr-hub',        label: 'Red 3D / VR · AR',    iconKey: 'AppWindow',       path: '/xr',                    color: 'purple',  enabled: false, origin: 'preset' },
  { id: 'recordatorios', label: 'Clima y recordatorios', iconKey: 'CalendarClock',  path: '/clima',                 color: 'cyan',    enabled: true,  origin: 'preset' },
  // La Terminal ya NO es un botón suelto del dock: sus funciones (consola
  // integrada + dispositivos como servidores) viven DENTRO de Cerebros
  // (brains-panel → sección «Terminal y dispositivos»). La ruta /terminal
  // sigue existiendo pero ya no se ofrece como acceso propio del dock.
  { id: 'terminal',      label: 'Terminal',            iconKey: 'Server',          path: '/cerebros#terminal',     color: 'emerald', enabled: false, origin: 'preset' },
  // ── Opciones extra disponibles desde el editor (no visibles por defecto) ──
  { id: 'sincrometro',   label: 'Sincrómetro',         iconKey: 'CalendarClock',   path: '/hub?tab=calendar',      color: 'amber',   enabled: false, origin: 'preset' },
  { id: 'hermes-graph',  label: 'Grafo Cerebro',       iconKey: 'GitBranch',       path: '/network/graph',         color: 'purple',  enabled: false, origin: 'preset' },
  { id: 'hermes-setup',  label: 'IA · Setup',          iconKey: 'Sparkles',        path: '/ai-setup',              color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'hermes-skills', label: 'Skills',              iconKey: 'Zap',             path: '/agent?tab=skills',      color: 'purple',  enabled: false, origin: 'preset' },
  { id: 'hermes-tools',  label: 'Tools',               iconKey: 'Wrench',          path: '/agent?tab=tools',       color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'hermes-mcp',    label: 'MCPs',                iconKey: 'Plug',            path: '/agent?tab=mcp',         color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'hermes-senses', label: 'Sentidos',            iconKey: 'Eye',             path: '/ai-setup?tab=senses',   color: 'amber',   enabled: false, origin: 'preset' },
  { id: 'memoria',       label: 'Memoria',             iconKey: 'HardDrive',       path: '/network/graph',         color: 'cyan',    enabled: false, origin: 'preset' },
  { id: 'servidores-apps', label: 'Servidores de Apps', iconKey: 'Boxes',          path: '/servidores-apps',       color: 'emerald', enabled: false, origin: 'preset' },
  // ── Medios (grupo al FINAL del dock, visible por defecto) ──
  { id: 'camara',        label: 'Cámara',              iconKey: 'Camera',          path: '/camara',                color: 'crimson', enabled: true,  origin: 'preset' },
  { id: 'galeria',       label: 'Galería',             iconKey: 'Images',          path: '/galeria',               color: 'crimson', enabled: true,  origin: 'preset' },
  // ── Red / Conexiones (Adenda 99d: medios correctos — visibles por defecto) ──
  // El centro de la malla P2P (mapa 3D, antenas/bandas, privacidad, peers) y la
  // página Señales (antenas de la neurona + radar de nodos reales) ahora tienen
  // acceso propio en el dock, no solo dentro del hub de conexiones.
  // Red Mesh ya NO va en el dock: sus opciones están integradas en «Señales»
  // (pestaña Red Mesh). El preset queda deshabilitado por defecto y la migración
  // v10 lo retira de los docks existentes. La ruta /red-mesh sigue accesible.
  { id: 'red-mesh',      label: 'Red Mesh',            iconKey: 'Antenna',         path: '/red-mesh',              color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'senales',       label: 'Señales',             iconKey: 'RadioTower',      path: '/senales',               color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'red-feed',      label: 'Feed de red',         iconKey: 'Radio',           path: '/red-feed',              color: 'purple',  enabled: true,  origin: 'preset' },
  // Ola 228: página Voces — estudio de voces y emisión de voz del OS.
  { id: 'voces',         label: 'Voces',               iconKey: 'AudioLines',      path: '/voces',                 color: 'purple',  enabled: true,  origin: 'preset' },
  // Ola 231: Puente de Mando — consola de producción y desarrollo (solo local).
  { id: 'mando',         label: 'Mando',               iconKey: 'Gauge',           path: '/mando',                 color: 'amber',   enabled: true,  origin: 'preset' },
  // Ola 234: Mundo de los avatares — escena 3D viva de los habitantes de la red.
  { id: 'mundo-avatares', label: 'Mundo de los avatares', iconKey: 'Smile',      path: '/mundo-avatares',         color: 'purple',  enabled: true,  origin: 'preset' },
];

/**
 * Migraciones one-shot sobre la config guardada del usuario.
 * ADITIVO y defensivo: sólo retira del dock funciones que dejaron de ser
 * botones (AR/VR pasó a automática; la Terminal vive dentro de Cerebros),
 * sin tocar el resto de las elecciones del usuario ni su orden. Se aplica
 * como mucho una vez por navegador (marca en localStorage).
 */
const DOCK_MIGRATION_KEY = 'starseed.dock.items.migrated.v3';
/** Ids que ya no deben renderizarse como botón suelto del dock. */
const RETIRED_FROM_DOCK = new Set<string>(['xr-hub', 'terminal']);

function applyOneShotMigration(parsed: DockItemConfig[]): DockItemConfig[] {
  if (typeof window === 'undefined') return parsed;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_KEY)) return parsed;
  } catch {
    return parsed;
  }
  const migrated = parsed.map((it) => {
    if (RETIRED_FROM_DOCK.has(it.id) && it.enabled) {
      // Los desactivamos como botón visible; siguen en el catálogo por si el
      // usuario los quiere de vuelta manualmente.
      return { ...it, enabled: false };
    }
    // La Terminal, si sigue presente, reapunta a la sección de Cerebros.
    if (it.id === 'terminal' && it.path === '/terminal') {
      return { ...it, path: '/cerebros#terminal' };
    }
    return it;
  });
  try {
    window.localStorage.setItem(DOCK_MIGRATION_KEY, '1');
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  } catch { /* noop */ }
  return migrated;
}

/**
 * Migración one-shot v4 — FUSIÓN DE MENÚS en todas las cuentas.
 *
 * Problema que resuelve: DOCK_PRESETS ya trae los botones fusionados
 * ('mylib' = Librería · Biblioteca, 'nodes' = Red · Nodos, 'tienda' dentro de
 * la Librería), pero la config guardada del usuario (STORAGE_KEY) conservaba
 * los botones VIEJOS sin fusionar y tenía prioridad al cargar.
 *
 * Qué hace (autorizado por el usuario, es deliberadamente destructivo con los
 * presets guardados — NUNCA con lo creado por el usuario):
 *   (a) DESCARTA los items guardados de origen 'preset' y los sustituye por
 *       los DOCK_PRESETS nuevos (fusionados), con su orden y enabled canónicos.
 *   (b) CONSERVA al final los items origin:'user' (accesos personalizados).
 *   (c) Repunta en los folders guardados (FOLDERS_KEY) los itemIds viejos que
 *       ya no existen a sus equivalentes nuevos (library/biblioteca/store →
 *       'mylib'; red → 'nodes') y elimina los ids huérfanos restantes.
 *   (d) Persiste el resultado y deja la marca para no repetirse.
 *
 * Defensiva y SSR-safe: en el servidor devuelve null (sin efectos); ante
 * storage corrupto degrada sin lanzar.
 */
const DOCK_MIGRATION_V4_KEY = 'starseed.dock.items.migrated.v4';

/** id viejo → id fusionado equivalente (para repuntar folders guardados). */
const LEGACY_DOCK_ID_ALIASES: Record<string, string> = {
  library: 'mylib',
  biblioteca: 'mylib',
  store: 'mylib',
  red: 'nodes',
};

/**
 * Aplica la migración v4 si aún no se aplicó. Devuelve la lista final de items
 * si el usuario tenía config guardada y se migró en esta carga; `null` si no
 * procede (ya migrado, SSR, storage inaccesible o usuario sin config guardada
 * — en este último caso solo repunta folders y deja la marca). Con `null`,
 * el llamador sigue el flujo normal.
 */
function applyDockFusionMigrationV4(saved: DockItemConfig[] | null): DockItemConfig[] | null {
  if (typeof window === 'undefined') return null;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_V4_KEY)) return null;
  } catch {
    return null;
  }

  // (a) Base = presets nuevos (fusionados), clonados para no mutar el catálogo.
  const migrated: DockItemConfig[] = DOCK_PRESETS.map((p) => ({ ...p }));

  // (b) Re-agrega al final SOLO los items personalizados del usuario
  //     (origin:'user'), normalizados y de-duplicados por id.
  const presetIds = new Set(migrated.map((i) => i.id));
  const seenUser = new Set<string>();
  for (const it of saved ?? []) {
    if (!it || it.origin !== 'user') continue;
    if (typeof it.id !== 'string' || typeof it.path !== 'string') continue;
    if (presetIds.has(it.id) || seenUser.has(it.id)) continue;
    seenUser.add(it.id);
    migrated.push({
      id: it.id,
      label: String(it.label ?? it.id),
      iconKey: (it.iconKey ?? 'LayoutGrid') as DockIconKey,
      path: it.path,
      color: (it.color ?? 'neutral') as DockColor,
      enabled: it.enabled !== false,
      origin: 'user',
    });
  }

  // (c) Folders: repunta ids viejos a sus equivalentes fusionados y elimina
  //     los huérfanos. Solo escribimos si había folders guardados.
  try {
    const validIds = new Set(migrated.map((i) => i.id));
    const rawFolders = window.localStorage.getItem(FOLDERS_KEY);
    if (rawFolders) {
      const folders = loadDockFolders().map((f) => {
        const remapped: string[] = [];
        const seen = new Set<string>();
        for (const oldId of f.itemIds) {
          const next = validIds.has(oldId) ? oldId : LEGACY_DOCK_ID_ALIASES[oldId];
          if (!next || !validIds.has(next) || seen.has(next)) continue; // huérfano o duplicado
          seen.add(next);
          remapped.push(next);
        }
        return { ...f, itemIds: remapped };
      });
      saveDockFolders(folders);
    }
  } catch { /* noop: los folders no deben impedir la migración de items */ }

  // (d) Persistir y marcar (v4 subsume la v3: la marcamos también).
  try {
    // Solo se snapshot-ea la lista si el usuario TENÍA config guardada; si no,
    // se mantiene en modo "presets vivos" (ya fusionados de serie) y solo se
    // repuntan folders + se deja la marca.
    if (saved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V4_KEY, '1');
    window.localStorage.setItem(DOCK_MIGRATION_KEY, '1');
  } catch { /* noop */ }

  return saved ? migrated : null;
}

/**
 * Migración one-shot v5 — LIBRERÍA SIN TIENDA + dock depurado.
 *
 * Autorizada por el usuario (2026-07): la Tienda desapareció como concepto
 * (vive fundida en «Explorar» de la Librería) y Red·Nodos dejó de ser botón
 * del dock (vive dentro del Hub). Sobre la config GUARDADA del usuario:
 *   (a) QUITA los items preset 'tienda', 'nodes' y 'netlib'. Lo creado por
 *       el usuario (origin:'user') se conserva SIEMPRE, aunque coincida el id.
 *   (b) INSERTA 'escritorios' habilitado al inicio si falta (y lo habilita
 *       si estaba apagado): es la puerta principal del OS.
 *   (c) PURGA de los folders guardados los ids huérfanos (referencias a
 *       items que ya no existen, p. ej. 'tienda').
 *   (d) Persiste (solo si había config guardada) y deja la marca one-shot.
 *
 * Defensiva y SSR-safe: en el servidor no hace nada; ante storage corrupto
 * degrada sin lanzar. Sin config guardada solo purga folders + marca.
 */
const DOCK_MIGRATION_V5_KEY = 'starseed.dock.items.migrated.v5';
/** Presets retirados del dock en v5 (la Tienda ya ni existe en el catálogo). */
const RETIRED_PRESETS_V5 = new Set<string>(['tienda', 'nodes', 'netlib']);

function applyDockLibraryMigrationV5(items: DockItemConfig[], hadSaved: boolean): DockItemConfig[] {
  if (typeof window === 'undefined') return items;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_V5_KEY)) return items;
  } catch {
    return items;
  }

  let migrated = items;

  if (hadSaved) {
    // (a) Fuera 'tienda'/'nodes'/'netlib' de la config guardada (solo presets;
    //     los accesos origin:'user' son intocables).
    migrated = migrated.filter((it) => !(RETIRED_PRESETS_V5.has(it.id) && it.origin !== 'user'));

    // (b) 'escritorios' habilitado al inicio si falta; habilitado si estaba off.
    const esc = migrated.find((i) => i.id === 'escritorios');
    if (!esc) {
      const preset = DOCK_PRESETS.find((p) => p.id === 'escritorios');
      if (preset) migrated = [{ ...preset, enabled: true }, ...migrated];
    } else if (!esc.enabled) {
      migrated = migrated.map((i) => (i.id === 'escritorios' ? { ...i, enabled: true } : i));
    }
  }

  // (c) Folders: purga ids huérfanos (items que ya no existen tras la v5).
  try {
    const validIds = new Set(migrated.map((i) => i.id));
    const rawFolders = window.localStorage.getItem(FOLDERS_KEY);
    if (rawFolders) {
      const folders = loadDockFolders().map((f) => ({
        ...f,
        itemIds: f.itemIds.filter((id) => validIds.has(id)),
      }));
      saveDockFolders(folders);
    }
  } catch { /* noop: los folders no deben impedir la migración */ }

  // (d) Persistir y marcar.
  try {
    if (hadSaved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V5_KEY, '1');
  } catch { /* noop */ }

  return migrated;
}

/**
 * Migración v6: el botón 'escritorios' debe estar SIEMPRE el primero (izquierda,
 * junto a Dashboard) en TODAS las cuentas — incluidas las que ya corrieron v5 y
 * lo tenían al final (aparecía a la derecha). Mueve 'escritorios' al índice 0 y
 * lo habilita; si falta, lo inserta al inicio. Se aplica una sola vez por navegador.
 */
const DOCK_MIGRATION_V6_KEY = 'starseed.dock.items.migrated.v6';

function applyDockEscritorioFirstV6(items: DockItemConfig[], hadSaved: boolean): DockItemConfig[] {
  if (typeof window === 'undefined') return items;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_V6_KEY)) return items;
  } catch {
    return items;
  }

  let migrated = items;
  const idx = migrated.findIndex((i) => i.id === 'escritorios');
  if (idx === -1) {
    const preset = DOCK_PRESETS.find((p) => p.id === 'escritorios');
    if (preset) migrated = [{ ...preset, enabled: true }, ...migrated];
  } else if (idx !== 0 || !migrated[idx].enabled) {
    const esc = { ...migrated[idx], enabled: true };
    migrated = [esc, ...migrated.filter((_, i) => i !== idx)];
  }

  try {
    if (hadSaved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V6_KEY, '1');
  } catch { /* noop */ }

  return migrated;
}

/**
 * Migración v7 — grupo "Medios" (Cámara + Galería) al FINAL del dock,
 * habilitado por defecto, incluso en cuentas con dock ya guardado (donde el
 * flujo normal añadiría cualquier preset nuevo como deshabilitado). Se aplica
 * una sola vez por navegador; no reordena ni toca nada más de la config del usuario.
 */
const DOCK_MIGRATION_V7_KEY = 'starseed.dock.items.migrated.v7';
const MEDIA_GROUP_IDS = ['camara', 'galeria'];

function applyDockMediaGroupV7(items: DockItemConfig[], hadSaved: boolean): DockItemConfig[] {
  if (typeof window === 'undefined') return items;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_V7_KEY)) return items;
  } catch {
    return items;
  }

  let migrated = items;
  for (const id of MEDIA_GROUP_IDS) {
    const idx = migrated.findIndex((i) => i.id === id);
    if (idx === -1) {
      const preset = DOCK_PRESETS.find((p) => p.id === id);
      if (preset) migrated = [...migrated, { ...preset, enabled: true }];
    } else if (!migrated[idx].enabled) {
      migrated = migrated.map((it, i) => (i === idx ? { ...it, enabled: true } : it));
    }
  }

  try {
    if (hadSaved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V7_KEY, '1');
  } catch { /* noop */ }

  return migrated;
}

/**
 * Migración v8 — grupo "Red / Conexiones" (Red Mesh + Señales) habilitado por
 * defecto, INCLUSO en cuentas con dock ya guardado (donde el flujo normal
 * añadiría cualquier preset nuevo como deshabilitado y por eso el usuario "no
 * veía" las páginas nuevas). Una sola vez por navegador; no reordena nada más.
 */
const DOCK_MIGRATION_V8_KEY = 'starseed.dock.items.migrated.v8';
const CONNECTIVITY_GROUP_IDS = ['red-mesh', 'senales'];

function applyDockConnectivityGroupV8(items: DockItemConfig[], hadSaved: boolean): DockItemConfig[] {
  if (typeof window === 'undefined') return items;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_V8_KEY)) return items;
  } catch {
    return items;
  }

  let migrated = items;
  for (const id of CONNECTIVITY_GROUP_IDS) {
    const idx = migrated.findIndex((i) => i.id === id);
    if (idx === -1) {
      const preset = DOCK_PRESETS.find((p) => p.id === id);
      if (preset) migrated = [...migrated, { ...preset, enabled: true }];
    } else if (!migrated[idx].enabled) {
      migrated = migrated.map((it, i) => (i === idx ? { ...it, enabled: true } : it));
    }
  }

  try {
    if (hadSaved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V8_KEY, '1');
  } catch { /* noop */ }

  return migrated;
}

/**
 * Migración v9 — RE-asegura el botón «Señales» (y Red Mesh) en el dock. La v8 se
 * marcó como aplicada en muchos dispositivos ANTES de que «Señales» quedara bien
 * registrado, así que algunos usuarios seguían sin verlo. Clave NUEVA → corre una
 * vez más en cada navegador y garantiza que 'senales' está presente y habilitado.
 * No reordena nada más.
 */
const DOCK_MIGRATION_V9_KEY = 'starseed.dock.items.migrated.v9';
const CONNECTIVITY_GROUP_IDS_V9 = ['senales'];

function applyDockSenalesV9(items: DockItemConfig[], hadSaved: boolean): DockItemConfig[] {
  if (typeof window === 'undefined') return items;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_V9_KEY)) return items;
  } catch {
    return items;
  }

  let migrated = items;
  for (const id of CONNECTIVITY_GROUP_IDS_V9) {
    const idx = migrated.findIndex((i) => i.id === id);
    if (idx === -1) {
      const preset = DOCK_PRESETS.find((p) => p.id === id);
      if (preset) migrated = [...migrated, { ...preset, enabled: true }];
    } else if (!migrated[idx].enabled) {
      migrated = migrated.map((it, i) => (i === idx ? { ...it, enabled: true } : it));
    }
  }

  try {
    if (hadSaved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V9_KEY, '1');
  } catch { /* noop */ }

  return migrated;
}

/**
 * Migración v10 — RETIRA el botón «Red Mesh» del dock: sus opciones ya están
 * integradas en «Señales» (pestaña Red Mesh). Una vez por navegador; no toca
 * nada más. La ruta /red-mesh sigue accesible desde Señales y el catálogo.
 */
const DOCK_MIGRATION_V10_KEY = 'starseed.dock.items.migrated.v10';

function applyDockRemoveRedMeshV10(items: DockItemConfig[], hadSaved: boolean): DockItemConfig[] {
  if (typeof window === 'undefined') return items;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_V10_KEY)) return items;
  } catch {
    return items;
  }

  const had = items.some((i) => i.id === 'red-mesh');
  const migrated = had ? items.filter((i) => i.id !== 'red-mesh') : items;

  try {
    if (hadSaved && had) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V10_KEY, '1');
  } catch { /* noop */ }

  return migrated;
}

/**
 * Migración v11 — añade/habilita «Feed de red» (/red-feed) por defecto, incluso
 * en cuentas con dock ya guardado. Una vez por navegador; no reordena nada más.
 */
const DOCK_MIGRATION_V11_KEY = 'starseed.dock.items.migrated.v11';

function applyDockRedFeedV11(items: DockItemConfig[], hadSaved: boolean): DockItemConfig[] {
  if (typeof window === 'undefined') return items;
  try {
    if (window.localStorage.getItem(DOCK_MIGRATION_V11_KEY)) return items;
  } catch {
    return items;
  }

  let migrated = items;
  const idx = migrated.findIndex((i) => i.id === 'red-feed');
  if (idx === -1) {
    const preset = DOCK_PRESETS.find((p) => p.id === 'red-feed');
    if (preset) migrated = [...migrated, { ...preset, enabled: true }];
  } else if (!migrated[idx].enabled) {
    migrated = migrated.map((it, i) => (i === idx ? { ...it, enabled: true } : it));
  }

  try {
    if (hadSaved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V11_KEY, '1');
  } catch { /* noop */ }

  return migrated;
}

/**
 * Migración v12 — REFUERZO de «Señales» ante sync entre dispositivos. La clave
 * `starseed.dock.items.v2` se sincroniza entre neuronas del mismo usuario, pero
 * las marcas `starseed.dock.items.migrated.vN` son LOCALES a cada navegador y
 * no viajan con el sync. Si un dispositivo guarda 'senales' deshabilitado (o
 * ausente) y esa config llega por sync a otra neurona que YA consumió su guard
 * v9 en su momento, esa neurona no lo vuelve a aplicar y el botón desaparece.
 * Clave NUEVA → corre una vez más en cada navegador, sin importar el estado de
 * la v9, y garantiza que 'senales' está presente y habilitado. No reordena
 * nada más. Defensiva y SSR-safe, igual que el resto de migraciones one-shot.
 */
const DOCK_MIGRATION_V12_KEY = 'starseed.dock.items.migrated.v12';
function applyDockSenalesForceV12(items: DockItemConfig[], hadSaved: boolean): DockItemConfig[] {
  if (typeof window === 'undefined') return items;
  try { if (window.localStorage.getItem(DOCK_MIGRATION_V12_KEY)) return items; } catch { return items; }
  let migrated = items;
  const idx = migrated.findIndex((i) => i.id === 'senales');
  if (idx === -1) {
    const preset = DOCK_PRESETS.find((p) => p.id === 'senales');
    if (preset) migrated = [...migrated, { ...preset, enabled: true }];
  } else if (!migrated[idx].enabled) {
    migrated = migrated.map((it, i) => (i === idx ? { ...it, enabled: true } : it));
  }
  try {
    if (hadSaved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V12_KEY, '1');
  } catch { /* noop */ }
  return migrated;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BOTONES PREDETERMINADOS GARANTIZADOS — Adenda 149 · tanda 3 (2026-08-09)
 * ═══════════════════════════════════════════════════════════════════════════
 * Tercer intento sobre el mismo síntoma («Señales» y «Feed de red» no aparecen
 * en algunas neuronas/cuentas). Los dos anteriores vivían AQUÍ y fallaban así:
 *
 *  · `applyDockDefaultsOnV13` — bandera one-shot en localStorage. Se consumía
 *    en el PRIMER `loadDockConfig()` del arranque, que ocurre SIEMPRE antes de
 *    que `pullAndApplyNow()` (una ida y vuelta de red) traiga el payload de la
 *    cuenta. Cuando el payload viejo llegaba y el dock releía, la bandera ya
 *    estaba gastada y la migración no volvía a correr NUNCA.
 *  · `ensureDefaultDockItems` — «continua», pero solo añadía ids AUSENTES:
 *    un item presente con `enabled:false` no se re-encendía jamás. Y cuando sí
 *    reparaba, su escritura caía dentro de la ventana anti-eco del sync
 *    (`recentlyAppliedRemote`), así que la reparación NO se empujaba a la
 *    cuenta y el siguiente pull la volvía a pisar (marcas LWW empatadas).
 *
 * Ambos se sustituyen por `normalizeDockState` (lib/dock/dock-defaults.ts),
 * que lleva la VERSIÓN DENTRO DEL PAYLOAD sincronizado en vez de una bandera
 * local por dispositivo, y se aplica en TODOS los caminos de entrada: carga
 * local, sync entrante (realtime + pull manual) y cambio de cuenta/perfil.
 * Los `applyDock*V5..V12` se conservan intactos: siguen resolviendo cosas que
 * la garantía no cubre (fusiones, orden, retiradas) y son inofensivos.
 */

/* `DockItemLike` (módulo puro) describe «un item con id/enabled y campos extra
 * desconocidos»; `DockItemConfig` es la forma fuerte con uniones literales de
 * icono y color. Estructuralmente no son intercambiables para TS (falta la
 * firma de índice en un sentido y los campos obligatorios en el otro), pero en
 * ejecución son EL MISMO objeto: la normalización solo mira `id`/`enabled` y
 * conserva el resto por spread. Estos dos puentes acotan la conversión a un
 * único sitio en lugar de esparcir castings por el archivo. */
const asItemsLike = (items: DockItemConfig[]): DockItemLike[] => items as unknown as DockItemLike[];
const asItemsConfig = (items: DockItemLike[]): DockItemConfig[] => items as unknown as DockItemConfig[];

/** Semillas canónicas para el camino de sync (que no puede importar este catálogo). */
registerDockSeedProvider((id) => {
  const preset = DOCK_PRESETS.find((p) => p.id === id);
  return preset ? asItemsLike([preset])[0] : null;
});

/** Escribe el estado del dock SIEMPRE como sobre versionado `{defaultsVersion, items}`. */
function persistDockPayload(items: DockItemConfig[], defaultsVersion = DOCK_DEFAULTS_VERSION) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toDockPayload(asItemsLike(items), defaultsVersion)));
  } catch { /* noop: cuota llena o storage bloqueado — el dock sigue vivo en memoria */ }
}

/**
 * Aplica la garantía de predeterminados y persiste SOLO si algo cambió. Es el
 * último paso de todos los flujos de `loadDockConfig`, para que el resultado
 * que ve la UI y el que queda guardado/sincronizado sean el mismo.
 */
function finalizeDockItems(items: DockItemConfig[], hadSaved: boolean, defaultsVersion: number): DockItemConfig[] {
  const { payload, changed } = normalizeDockState({ defaultsVersion, items: asItemsLike(items) });
  const next = asItemsConfig(payload.items);
  // Sin config guardada no se persiste nada: se mantiene el modo «presets vivos»
  // (el catálogo ya trae los botones encendidos) y así un dispositivo recién
  // estrenado no crea una config que pisaría la que va a bajar de la cuenta.
  if (changed && hadSaved) persistDockPayload(next, payload.defaultsVersion);
  return next;
}

export function loadDockConfig(): DockItemConfig[] {
  if (typeof window === 'undefined') return DOCK_PRESETS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // `parseDockPayload` entiende las DOS formas: el array LEGADO (lo que hay
    // hoy en las cuentas ya generadas) y el sobre versionado nuevo.
    const { items: savedItems, defaultsVersion } = parseDockPayload(raw);
    const saved = savedItems ? asItemsConfig(savedItems) : null;

    // Migración v4 (one-shot): si se ejecuta ahora, su resultado ya está
    // persistido; la v5 se aplica encima (quita Tienda/Red·Nodos del dock);
    // la v6 fuerza 'escritorios' al primer puesto; la v7 añade Medios al final.
    const fused = applyDockFusionMigrationV4(saved);
    if (fused) {
      return finalizeDockItems(applyDockSenalesForceV12(applyDockRedFeedV11(applyDockRemoveRedMeshV10(applyDockSenalesV9(applyDockConnectivityGroupV8(applyDockMediaGroupV7(applyDockEscritorioFirstV6(applyDockLibraryMigrationV5(fused, true), true), true), true), true), true), true), true), true, defaultsVersion);
    }

    if (saved) {
      // Flujo normal (post-migración): cualquier preset nuevo se añade al
      // final como deshabilitado, se aplica la migración v3 legada, la v5, la v6 y la v7.
      const known = new Set(saved.map((i) => i.id));
      const missing = DOCK_PRESETS.filter((p) => !known.has(p.id)).map((p) => ({ ...p, enabled: false }));
      return finalizeDockItems(applyDockSenalesForceV12(
        applyDockRedFeedV11(
          applyDockRemoveRedMeshV10(
            applyDockSenalesV9(
              applyDockConnectivityGroupV8(
                applyDockMediaGroupV7(
                  applyDockEscritorioFirstV6(
                    applyDockLibraryMigrationV5(applyOneShotMigration([...saved, ...missing]), true),
                    true,
                  ),
                  true,
                ),
                true,
              ),
              true,
            ),
            true,
          ),
          true,
        ),
        true,
      ), true, defaultsVersion);
    }
  } catch { /* noop */ }
  // Sin config guardada: presets vivos (ya sin 'tienda'); la v5 purga folders
  // huérfanas, la v6 confirma 'escritorios' al inicio y la v7 confirma Medios al final (ambos ya lo están en presets).
  return finalizeDockItems(applyDockSenalesForceV12(applyDockRedFeedV11(applyDockRemoveRedMeshV10(applyDockSenalesV9(applyDockConnectivityGroupV8(applyDockMediaGroupV7(applyDockEscritorioFirstV6(applyDockLibraryMigrationV5(DOCK_PRESETS, false), false), false), false), false), false), false), false), false, 0);
}

/**
 * Guarda la personalización del usuario ESTAMPANDO la versión actual: a partir
 * de aquí, apagar «Señales» o «Feed de red» es una decisión suya y la garantía
 * ya no vuelve a encenderlos (personalizable de verdad). Solo un
 * `DOCK_DEFAULTS_VERSION` mayor en un despliegue futuro volvería a forzarlos.
 */
export function saveDockConfig(items: DockItemConfig[]) {
  persistDockPayload(items);
}

export function resetDockConfig() {
  saveDockConfig(DOCK_PRESETS);
}

/** Re-exportado para las superficies que necesiten conocer la garantía (UI/tests). */
export { DOCK_DEFAULT_ON_IDS, DOCK_DEFAULTS_VERSION };
