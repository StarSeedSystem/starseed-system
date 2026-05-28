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

export type DockIconKey =
  | 'Home' | 'User' | 'MessageSquare' | 'Bell' | 'Users' | 'Book' | 'Library'
  | 'Network' | 'Settings' | 'BrainCircuit' | 'Brain' | 'Sparkles' | 'Wrench'
  | 'Zap' | 'Eye' | 'Cpu' | 'Server' | 'Database' | 'CalendarDays' | 'Plus';

const STORAGE_KEY = 'starseed.dock.items.v1';

/**
 * Catálogo base. Por defecto el dock muestra solo secciones del sistema +
 * UN solo botón de IA (AI Studio). El resto de superficies IA (Cerebro,
 * Skills, Tools, MCPs, Sentidos, Setup) están disponibles desde el editor
 * para añadir si el usuario quiere accesos rápidos extra.
 */
export const DOCK_PRESETS: DockItemConfig[] = [
  // ── Sistema (visibles por defecto) ──
  { id: 'dashboard',     label: 'Dashboard',        iconKey: 'Home',         path: '/dashboard',           color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'profile',       label: 'Perfil',           iconKey: 'User',         path: '/profile/starseeduser',color: 'neutral', enabled: true,  origin: 'preset' },
  { id: 'messages',      label: 'Mensajes',         iconKey: 'MessageSquare',path: '/messages',            color: 'crimson', enabled: true,  origin: 'preset' },
  { id: 'notifications', label: 'Notificaciones',   iconKey: 'Bell',         path: '/notifications',       color: 'amber',   enabled: true,  origin: 'preset' },
  { id: 'hub',           label: 'Hub',              iconKey: 'Users',        path: '/hub',                 color: 'emerald', enabled: true,  origin: 'preset' },
  { id: 'mylib',         label: 'Mi Biblioteca',    iconKey: 'Book',         path: '/library?view=personal', color: 'cyan',  enabled: true,  origin: 'preset' },
  { id: 'netlib',        label: 'Librería Global',  iconKey: 'Library',      path: '/library?view=global', color: 'cyan',    enabled: true,  origin: 'preset' },
  { id: 'nodes',         label: 'Nodos',            iconKey: 'Network',      path: '/network',             color: 'crimson', enabled: true,  origin: 'preset' },
  // ── IA: UN solo botón a la página principal por defecto ──
  { id: 'ai-studio',     label: 'AI Studio',        iconKey: 'BrainCircuit', path: '/agent',               color: 'purple',  enabled: true,  origin: 'preset' },
  { id: 'settings',      label: 'Ajustes',          iconKey: 'Settings',     path: '/settings',            color: 'neutral', enabled: true,  origin: 'preset' },
  // ── Opciones extra disponibles desde el editor (no visibles por defecto) ──
  { id: 'sincrometro',   label: 'Sincrómetro',      iconKey: 'CalendarDays', path: '/hub?tab=calendar',    color: 'amber',   enabled: false, origin: 'preset' },
  { id: 'hermes-graph',  label: 'Cerebro',          iconKey: 'Brain',        path: '/network/graph',       color: 'purple',  enabled: false, origin: 'preset' },
  { id: 'hermes-setup',  label: 'IA · Setup',       iconKey: 'Cpu',          path: '/ai-setup',            color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'hermes-skills', label: 'Skills',           iconKey: 'Zap',          path: '/agent?tab=skills',    color: 'purple',  enabled: false, origin: 'preset' },
  { id: 'hermes-tools',  label: 'Tools',            iconKey: 'Wrench',       path: '/agent?tab=tools',     color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'hermes-mcp',    label: 'MCPs',             iconKey: 'Server',       path: '/agent?tab=mcp',       color: 'emerald', enabled: false, origin: 'preset' },
  { id: 'hermes-senses', label: 'Sentidos',         iconKey: 'Eye',          path: '/ai-setup?tab=senses', color: 'amber',   enabled: false, origin: 'preset' },
  { id: 'memoria',       label: 'Memoria',          iconKey: 'Database',     path: '/network/graph',       color: 'cyan',    enabled: false, origin: 'preset' },
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
