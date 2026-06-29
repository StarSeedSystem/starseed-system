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
  { id: 'dashboard',     label: 'Dashboard',           iconKey: 'LayoutDashboard', path: '/dashboard',             color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'profile',       label: 'Perfil',              iconKey: 'CircleUser',      path: '/profile/starseeduser',  color: 'neutral', enabled: true,  origin: 'preset' },
  { id: 'messages',      label: 'Mensajes',            iconKey: 'MessagesSquare',  path: '/messages',              color: 'crimson', enabled: true,  origin: 'preset' },
  { id: 'notifications', label: 'Notificaciones',      iconKey: 'Bell',            path: '/notifications',         color: 'amber',   enabled: true,  origin: 'preset' },
  { id: 'hub',           label: 'Hub',                 iconKey: 'Users',           path: '/hub',                   color: 'emerald', enabled: true,  origin: 'preset' },
  { id: 'mylib',         label: 'Mi Biblioteca',       iconKey: 'BookOpen',        path: '/library?view=personal', color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'netlib',        label: 'Librería Global',     iconKey: 'Library',         path: '/library?view=global',   color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'nodes',         label: 'Nodos',               iconKey: 'Network',         path: '/network',               color: 'crimson', enabled: true,  origin: 'preset' },
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
  { id: 'tienda',        label: 'Tienda',              iconKey: 'ShoppingBag',     path: '/store',                 color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'insignias',     label: 'Insignias',           iconKey: 'Award',           path: '/insignias',             color: 'amber',   enabled: false, origin: 'preset' },
  { id: 'apps-ia',       label: 'Apps IA',             iconKey: 'AppWindow',       path: '/apps-ia',               color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'xr-hub',        label: 'Red 3D / VR · AR',    iconKey: 'AppWindow',       path: '/xr',                    color: 'purple',  enabled: true,  origin: 'preset' },
  { id: 'recordatorios', label: 'Recordatorios',       iconKey: 'CalendarClock',   path: '/recordatorios',         color: 'amber',   enabled: true,  origin: 'preset' },
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

export function loadDockConfig(): DockItemConfig[] {
  if (typeof window === 'undefined') return DOCK_PRESETS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DockItemConfig[];
      // Asegurar que cualquier preset nuevo se añada al final como deshabilitado
      const known = new Set(parsed.map((i) => i.id));
      const missing = DOCK_PRESETS.filter((p) => !known.has(p.id)).map((p) => ({ ...p, enabled: false }));
      return [...parsed, ...missing];
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
