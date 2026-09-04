// src/lib/dock/dock-defaults.ts
/**
 * GARANTÍA DE BOTONES PREDETERMINADOS DEL DOCK — versión DENTRO del payload.
 * ═══════════════════════════════════════════════════════════════════════════
 * Adenda 149 · tanda 3 (2026-08-09). Tercer intento sobre el mismo síntoma:
 * «Señales» (`senales`) y «Feed de red» (`red-feed`) NO aparecían en el dock de
 * algunas neuronas y cuentas. Los dos intentos anteriores fallaron por la MISMA
 * razón de fondo, que aquí se corrige de raíz.
 *
 * ── POR QUÉ FALLARON LOS INTENTOS 1 Y 2 ────────────────────────────────────
 * El estado del dock vive en `starseed.dock.items.v2`, que SÍ viaja con la
 * cuenta (settings-sync.ts · SYNCED_KEYS → `user_settings.prefs`). Las marcas
 * `starseed.dock.items.migrated.vN`, en cambio, son LOCALES a cada navegador y
 * NO viajan. El orden real de una carga es:
 *
 *   1. `loadDockConfig()` (montaje del OmniDock) → lee localStorage y corre las
 *      migraciones one-shot. `applyDockDefaultsOnV13` consumía su bandera
 *      AQUÍ, en el primer instante, ANTES de que llegara nada de la red.
 *   2. `startRealtimeSync()` → `connectForUser()` → `pullAndApplyNow()`: una
 *      ida y vuelta de RED, por lo que SIEMPRE resuelve DESPUÉS del paso 1.
 *   3. `applyRemoteChanges()` escribía el payload REMOTO tal cual en
 *      localStorage (sin normalizar) y despachaba `starseed:sync:apply`.
 *   4. El dock recargaba → `loadDockConfig()` otra vez → pero la bandera v13 ya
 *      estaba consumida (paso 1) y `ensureDefaultDockItems` SOLO añadía ids
 *      AUSENTES: un item presente con `enabled:false` no se volvía a encender
 *      JAMÁS. → el botón desaparecía para siempre en esa neurona.
 *
 *   Y aunque `ensureDefaultDockItems` sí reparara el caso «ausente», esa
 *   escritura ocurría dentro de la ventana anti-eco de `applyRemoteChanges`
 *   (`recentlyAppliedRemote`), así que NUNCA se empujaba a la cuenta: la
 *   reparación se quedaba en ese dispositivo y el siguiente `pull` volvía a
 *   pisarla con el payload viejo (marcas LWW empatadas ⇒ el remoto gana).
 *
 * ── LA SOLUCIÓN: LA VERSIÓN VIAJA CON EL DATO, NO CON EL DISPOSITIVO ───────
 * El payload persistido pasa a ser un sobre `{ defaultsVersion, items }`. Como
 * la versión va DENTRO del mismo valor sincronizado, es imposible que se
 * desparejen (a diferencia de una clave aparte con su propia marca LWW):
 *
 *   · payload con `defaultsVersion` ausente o < DOCK_DEFAULTS_VERSION →
 *     se FUERZA presencia + `enabled:true` de todos los DOCK_DEFAULT_ON_IDS,
 *     se estampa la versión actual y se reescribe/sincroniza de vuelta.
 *   · payload con `defaultsVersion >= DOCK_DEFAULTS_VERSION` → se respeta
 *     íntegro lo que el usuario haya personalizado, incluido APAGAR el botón.
 *     La personalización vuelve a ser de verdad del usuario.
 *
 * Así, una cuenta antigua que abra CUALQUIER neurona recibe su payload viejo →
 * lo normaliza → los botones aparecen → el payload ya versionado se sincroniza
 * de vuelta y llega al resto de sus dispositivos, perfiles y páginas. Esto es
 * lo que pedía el usuario: «los cambios deben actualizarse en todo el OS, la
 * red y las cuentas, perfiles y páginas ya generadas».
 *
 * Este módulo es PURO y sin dependencias (ni React, ni lucide, ni localStorage)
 * a propósito: lo importan tanto `components/layout/dock-config.ts` como el
 * motor de sincronización (`lib/sync/realtime-sync.ts`, `lib/settings-sync.ts`)
 * sin arrastrar el catálogo de iconos al bundle de sync ni crear ciclos.
 */

/** Clave real del estado del dock (la misma de siempre: el sobre es aditivo). */
export const DOCK_STORAGE_KEY = 'starseed.dock.items.v2';

/**
 * Versión ACTUAL de los predeterminados garantizados. Subir este número vuelve
 * a forzar (una sola vez por payload, en toda la red) la presencia y el
 * encendido de `DOCK_DEFAULT_ON_IDS`. Sustituye para siempre al patrón de
 * banderas one-shot por navegador (`starseed.dock.items.migrated.vN`), que era
 * justo lo que no llegaba a las cuentas viejas.
 */
export const DOCK_DEFAULTS_VERSION = 19;

/**
 * Ids que el OS garantiza presentes y encendidos hasta DOCK_DEFAULTS_VERSION.
 * v15 (Ola 6 · Adenda 158) añade `imaginacion`: la página de Imaginación
 * Intuitiva es nueva, así que ninguna cuenta la tiene todavía en su payload y
 * sin esta garantía no aparecería en el dock de nadie.
 * v16 (Ola 228) añade `voces`: la página Voces es nueva y sin esta garantía
 * no aparecería en el dock de las cuentas ya existentes.
 * v17 (Ola 231) añade `mando`: el Puente de Mando es nuevo y sin esta
 * garantía no aparecería en el dock de las cuentas ya existentes.
 * v18 (Ola 234) añade `mundo-avatares`: la escena 3D de los avatares es nueva
 * y sin esta garantía no aparecería en el dock de las cuentas ya existentes.
 * v19 (Ola 237) añade `laboratorio`: el Laboratorio de Astraura (genoma de
 * nueve capas fásicas) es nuevo y sin esta garantía no aparecería en el dock
 * de las cuentas ya existentes.
 */
export const DOCK_DEFAULT_ON_IDS = ['senales', 'red-feed', 'imaginacion', 'voces', 'mando', 'mundo-avatares', 'laboratorio'] as const;

/**
 * Forma mínima de un item del dock para ESTE módulo. Deliberadamente laxa
 * (`[k: string]: unknown`): el tipo fuerte `DockItemConfig` (con las uniones
 * literales de icono y color) vive en `dock-config.ts` y aquí no se necesita —
 * la normalización solo mira `id` y `enabled` y conserva el resto intacto.
 */
export interface DockItemLike {
  id: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/** Sobre persistido/sincronizado del dock. */
export interface DockPayload {
  defaultsVersion: number;
  items: DockItemLike[];
}

export interface DockNormalizeResult {
  /** Payload SIEMPRE versionado y con los predeterminados garantizados. */
  payload: DockPayload;
  /** ¿Hubo que tocar items o estampar la versión? Solo se persiste si es true. */
  changed: boolean;
  /** ¿La entrada traía una lista de items válida? (false ⇒ no hay nada que persistir). */
  hadItems: boolean;
}

/**
 * Semillas de respaldo para poder AÑADIR un botón ausente desde el camino de
 * sync, donde el catálogo real (`DOCK_PRESETS`, que arrastra lucide-react) no
 * está cargado. `dock-config.ts` registra el catálogo canónico al importarse
 * (`registerDockSeedProvider`) y entonces estas semillas dejan de usarse; deben
 * mantenerse SIEMPRE espejo de sus entradas en DOCK_PRESETS.
 */
const FALLBACK_SEEDS: Record<string, DockItemLike> = {
  senales: {
    id: 'senales', label: 'Señales', iconKey: 'RadioTower', path: '/senales',
    color: 'cyan', enabled: true, origin: 'preset',
  },
  'red-feed': {
    id: 'red-feed', label: 'Feed de red', iconKey: 'Radio', path: '/red-feed',
    color: 'purple', enabled: true, origin: 'preset',
  },
  voces: {
    id: 'voces', label: 'Voces', iconKey: 'AudioLines', path: '/voces',
    color: 'purple', enabled: true, origin: 'preset',
  },
  mando: {
    id: 'mando', label: 'Mando', iconKey: 'Gauge', path: '/mando',
    color: 'amber', enabled: true, origin: 'preset',
  },
  'mundo-avatares': {
    id: 'mundo-avatares', label: 'Mundo de los avatares', iconKey: 'Smile',
    path: '/mundo-avatares', color: 'purple', enabled: true, origin: 'preset',
  },
  laboratorio: {
    id: 'laboratorio', label: 'Laboratorio de Astraura', iconKey: 'FlaskConical',
    path: '/laboratorio', color: 'purple', enabled: true, origin: 'preset',
  },
};

let seedProvider: ((id: string) => DockItemLike | null) | null = null;

/**
 * Inyecta el catálogo canónico de presets como fuente de las semillas. Lo llama
 * `dock-config.ts` al importarse, para que un botón añadido por el camino de
 * sync tenga EXACTAMENTE la etiqueta, icono, ruta y color del catálogo vivo (un
 * item ya presente nunca se re-etiqueta después, así que insertarlo mal lo
 * dejaría desfasado para siempre).
 */
export function registerDockSeedProvider(fn: (id: string) => DockItemLike | null): void {
  seedProvider = fn;
}

function seedFor(id: string): DockItemLike | null {
  if (seedProvider) {
    try {
      const fromCatalog = seedProvider(id);
      if (fromCatalog && typeof fromCatalog.id === 'string') return fromCatalog;
    } catch { /* catálogo roto: caemos a la semilla de respaldo */ }
  }
  return FALLBACK_SEEDS[id] ?? null;
}

function isItemLike(value: unknown): value is DockItemLike {
  return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

/**
 * Lee CUALQUIER forma del estado del dock y devuelve items + versión:
 *   · `string`            → JSON del sobre o del array legado.
 *   · `DockItemLike[]`    → formato LEGADO (pre-Adenda 149·3): versión 0.
 *   · `{ defaultsVersion, items }` → sobre versionado actual.
 *   · cualquier otra cosa → `items: null` (no hay config guardada usable).
 *
 * Compatibilidad hacia atrás garantizada: el array legado se sigue entendiendo
 * y se convierte en sobre en la primera escritura.
 */
export function parseDockPayload(input: unknown): { items: DockItemLike[] | null; defaultsVersion: number } {
  let value: unknown = input;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return { items: null, defaultsVersion: 0 }; }
  }
  if (Array.isArray(value)) {
    return { items: value.filter(isItemLike), defaultsVersion: 0 };
  }
  if (value && typeof value === 'object') {
    const obj = value as { items?: unknown; defaultsVersion?: unknown };
    if (Array.isArray(obj.items)) {
      const v = typeof obj.defaultsVersion === 'number' && Number.isFinite(obj.defaultsVersion)
        ? obj.defaultsVersion
        : 0;
      return { items: obj.items.filter(isItemLike), defaultsVersion: v };
    }
  }
  return { items: null, defaultsVersion: 0 };
}

/**
 * FUNCIÓN ÚNICA de normalización — la llaman TODOS los caminos de entrada del
 * estado del dock: carga local inicial, payload remoto entrante del sync
 * (realtime + pull manual) y cambio de cuenta/perfil. Es pura: no lee ni
 * escribe almacenamiento; el llamador persiste solo si `changed`.
 */
export function normalizeDockState(input: unknown): DockNormalizeResult {
  const { items, defaultsVersion } = parseDockPayload(input);

  // Sin lista guardada no hay nada que reparar ni que persistir: el llamador
  // seguirá con el catálogo vivo (DOCK_PRESETS), que ya trae los botones ON.
  if (!items) {
    return { payload: { defaultsVersion: DOCK_DEFAULTS_VERSION, items: [] }, changed: false, hadItems: false };
  }

  // Payload ya al día: se respeta ÍNTEGRO. Si el usuario apagó un botón después
  // de la garantía, esa es su decisión y aquí no se toca (personalizable de verdad).
  if (defaultsVersion >= DOCK_DEFAULTS_VERSION) {
    return { payload: { defaultsVersion, items }, changed: false, hadItems: true };
  }

  // Payload viejo (o sin versionar): se fuerza presencia + encendido.
  let next = items;
  for (const id of DOCK_DEFAULT_ON_IDS) {
    const idx = next.findIndex((it) => it.id === id);
    if (idx === -1) {
      const seed = seedFor(id);
      if (seed) next = [...next, { ...seed, enabled: true }];
    } else if (next[idx].enabled !== true) {
      next = next.map((it, i) => (i === idx ? { ...it, enabled: true } : it));
    }
  }

  // `changed` es SIEMPRE true en esta rama aunque los items ya estuvieran bien:
  // hay que estampar la versión y propagarla, o el mismo payload volvería a
  // normalizarse en cada carga y en cada dispositivo, para siempre.
  return { payload: { defaultsVersion: DOCK_DEFAULTS_VERSION, items: next }, changed: true, hadItems: true };
}

/** Construye el sobre a persistir a partir de una lista de items ya definitiva. */
export function toDockPayload(items: DockItemLike[], defaultsVersion = DOCK_DEFAULTS_VERSION): DockPayload {
  return { defaultsVersion, items };
}

/**
 * Normalización para el CAMINO DE SYNC ENTRANTE (realtime-sync.ts /
 * settings-sync.ts): recibe el valor remoto crudo y devuelve el valor que debe
 * escribirse en localStorage. Si `changed` es true, el llamador además debe
 * sellar la marca LWW con «ahora» y empujar el payload reparado a la cuenta —
 * si no, la reparación se quedaría en este dispositivo y el siguiente pull la
 * volvería a pisar (ese era exactamente el bucle del intento 2).
 */
export function normalizeDockSyncValue(value: unknown): { value: unknown; changed: boolean } {
  const result = normalizeDockState(value);
  if (!result.hadItems || !result.changed) return { value, changed: false };
  return { value: result.payload, changed: true };
}
