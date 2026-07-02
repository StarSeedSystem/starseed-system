// src/components/layout/dock-config.ts
/**
 * Configuración persistente del OmniDock (Trinity Anchor) — el usuario
 * puede añadir, quitar y reordenar items. Los items "Hermes" son
 * predeterminados y se ofrecen como opciones añadibles. Lo mismo aplica
 * al Nexus y a /agent: el catálogo de "opciones rápidas" es el mismo y
 * el usuario decide qué exponer en cada superficie.
 */

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
  | 'Zap' | 'Wrench' | 'Plug' | 'Eye' | 'HardDrive';

const STORAGE_KEY = 'starseed.dock.items.v2';
const FOLDERS_KEY = 'starseed.dock.folders.v1';
const FOLDER_STATE_KEY = 'starseed.dock.folders.open.v1';

/**
 * Carpeta del dock: agrupa varios items (por id) bajo una sola entrada que,
 * al pulsarse, se expande para revelar sus accesos directos hijos y se vuelve
 * a colapsar. Es ADITIVO: los items siguen existiendo en el catálogo; una
 * carpeta solo decide cuáles se muestran agrupados. El estado abierto/cerrado
 * se persiste aparte (FOLDER_STATE_KEY) para no ensuciar la definición.
 */
export interface DockFolderConfig {
  id: string;
  label: string;
  iconKey: DockIconKey;
  color: DockColor;
  /** ids de DockItemConfig contenidos en la carpeta, en orden. */
  itemIds: string[];
  /** Visible en el dock. */
  enabled: boolean;
}

/** Carpetas por defecto: ninguna (el usuario las crea desde el editor). */
export const DOCK_FOLDER_PRESETS: DockFolderConfig[] = [];

export function loadDockFolders(): DockFolderConfig[] {
  if (typeof window === 'undefined') return DOCK_FOLDER_PRESETS;
  try {
    const raw = window.localStorage.getItem(FOLDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Defensivo: normaliza cada carpeta y descarta entradas corruptas.
        return parsed
          .filter((f) => f && typeof f.id === 'string' && Array.isArray(f.itemIds))
          .map((f) => ({
            id: String(f.id),
            label: String(f.label ?? 'Carpeta'),
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

/** Estado abierto/cerrado de cada carpeta (id → boolean). Persistido. */
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
  { id: 'nodes',         label: 'Red · Nodos',        iconKey: 'Network',         path: '/hub?tab=red',           color: 'crimson', enabled: true,  origin: 'preset' },
  // ── IA: UN solo botón a la página principal por defecto ──
  { id: 'ai-studio',     label: 'Astraura AI',           iconKey: 'BrainCircuit',    path: '/agent',                 color: 'purple',  enabled: true,  origin: 'preset' },
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
  // La Tienda vive DENTRO de la Librería (pestaña propia), no como ruta suelta.
  { id: 'tienda',        label: 'Tienda',              iconKey: 'ShoppingBag',     path: '/library?tab=tienda',    color: 'emerald', enabled: false, origin: 'preset' },
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
 *   (c) Repunta en las carpetas guardadas (FOLDERS_KEY) los itemIds viejos que
 *       ya no existen a sus equivalentes nuevos (library/biblioteca/store →
 *       'mylib'; red → 'nodes') y elimina los ids huérfanos restantes.
 *   (d) Persiste el resultado y deja la marca para no repetirse.
 *
 * Defensiva y SSR-safe: en el servidor devuelve null (sin efectos); ante
 * storage corrupto degrada sin lanzar.
 */
const DOCK_MIGRATION_V4_KEY = 'starseed.dock.items.migrated.v4';

/** id viejo → id fusionado equivalente (para repuntar carpetas guardadas). */
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
 * — en este último caso solo repunta carpetas y deja la marca). Con `null`,
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

  // (c) Carpetas: repunta ids viejos a sus equivalentes fusionados y elimina
  //     los huérfanos. Solo escribimos si había carpetas guardadas.
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
  } catch { /* noop: las carpetas no deben impedir la migración de items */ }

  // (d) Persistir y marcar (v4 subsume la v3: la marcamos también).
  try {
    // Solo se snapshot-ea la lista si el usuario TENÍA config guardada; si no,
    // se mantiene en modo "presets vivos" (ya fusionados de serie) y solo se
    // repuntan carpetas + se deja la marca.
    if (saved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(DOCK_MIGRATION_V4_KEY, '1');
    window.localStorage.setItem(DOCK_MIGRATION_KEY, '1');
  } catch { /* noop */ }

  return saved ? migrated : null;
}

export function loadDockConfig(): DockItemConfig[] {
  if (typeof window === 'undefined') return DOCK_PRESETS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const saved = Array.isArray(parsed) ? (parsed as DockItemConfig[]) : null;

    // Migración v4 (one-shot): si se ejecuta ahora, su resultado ya está
    // persistido y ES la lista final de esta carga.
    const fused = applyDockFusionMigrationV4(saved);
    if (fused) return fused;

    if (saved) {
      // Flujo normal (post-migración): cualquier preset nuevo se añade al
      // final como deshabilitado, y se aplica la migración v3 legada.
      const known = new Set(saved.map((i) => i.id));
      const missing = DOCK_PRESETS.filter((p) => !known.has(p.id)).map((p) => ({ ...p, enabled: false }));
      return applyOneShotMigration([...saved, ...missing]);
    }
  } catch { /* noop */ }
  return DOCK_PRESETS;
}

export function saveDockConfig(items: DockItemConfig[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* noop */ }
}

export function resetDockConfig() {
  saveDockConfig(DOCK_PRESETS);
}
