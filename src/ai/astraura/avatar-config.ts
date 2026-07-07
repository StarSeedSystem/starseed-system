"use client";

/**
 * StarSeed OS — Astraura · Config del AVATAR DE AURORA
 * ============================================================================
 * Preferencia LOCAL (por dispositivo — mismo criterio que
 * `sync-providers.ts::ACTIVE_PROVIDER_KEY`: es una elección de ESTA pantalla,
 * no de la cuenta, así que NO viaja con el sync oficial) de cómo se muestra el
 * avatar visual de Aurora junto a su chat:
 *
 *   · "none"   — nada (comportamiento de hoy, cero cambios visuales).
 *   · "orbe"   — DEFAULT. Orbe animado MEJORADO (envuelve `AuroraOrb` con una
 *                etiqueta de estado legible: idle/escuchando/hablando/
 *                pensando) — siempre disponible, sin red ni dependencias
 *                nuevas.
 *   · "live2d" — OPCIONAL. Si `modeloUrl` apunta a un modelo Live2D propio del
 *                usuario, el runtime se carga por CDN de forma perezosa
 *                (nunca en SSR, nunca como dependencia npm obligatoria). Sin
 *                URL, sin red o si algo falla, DEGRADA a "orbe" honestamente.
 *
 * Ver `src/components/aurora/aurora-avatar.tsx` (el componente) y
 * `architecture/astraura-inteligencia.md` §18 (Avatar de Aurora).
 *
 * SSR-safe y defensivo: nunca lanza, todo acceso a window/localStorage
 * protegido. Mismo patrón que `tts-oss/voice-config.ts`.
 */

export type AuroraAvatarMode = "none" | "orbe" | "live2d";
/** Dónde se monta el avatar respecto al chat: dentro del flujo o flotante. */
export type AuroraAvatarPosition = "inline" | "floating";

export interface AuroraAvatarConfig {
  mode: AuroraAvatarMode;
  /** URL del modelo Live2D (solo se usa si mode === "live2d"). */
  modeloUrl?: string;
  /** Tamaño del avatar en píxeles (lado del marco cuadrado). */
  size: number;
  /** "inline" (dentro del chat) o "floating" (esquina fija de pantalla). */
  position: AuroraAvatarPosition;
}

export const AURORA_AVATAR_CONFIG_KEY = "starseed.aurora.avatar.v1";
/** Evento interno (mismo tab) emitido al cambiar la config del avatar. */
export const AURORA_AVATAR_CONFIG_EVENT = "starseed:aurora-avatar-config";

const MIN_SIZE = 72;
const MAX_SIZE = 320;

/** Config por defecto: orbe animado, 132px, dentro del flujo del chat. */
export const DEFAULT_AVATAR_CONFIG: AuroraAvatarConfig = {
  mode: "orbe",
  modeloUrl: undefined,
  size: 132,
  position: "inline",
};

const VALID_MODES: readonly AuroraAvatarMode[] = ["none", "orbe", "live2d"];
const VALID_POSITIONS: readonly AuroraAvatarPosition[] = ["inline", "floating"];

function isValidMode(v: unknown): v is AuroraAvatarMode {
  return typeof v === "string" && (VALID_MODES as readonly string[]).includes(v);
}
function isValidPosition(v: unknown): v is AuroraAvatarPosition {
  return typeof v === "string" && (VALID_POSITIONS as readonly string[]).includes(v);
}
function clampSize(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : DEFAULT_AVATAR_CONFIG.size;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(v)));
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Lee la config del avatar (default: orbe · 132px · inline). NUNCA lanza. */
export function getAvatarConfig(): AuroraAvatarConfig {
  const ls = safeLocalStorage();
  if (!ls) return { ...DEFAULT_AVATAR_CONFIG };
  try {
    const raw = ls.getItem(AURORA_AVATAR_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_AVATAR_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AuroraAvatarConfig>;
    return {
      mode: isValidMode(parsed?.mode) ? parsed.mode : DEFAULT_AVATAR_CONFIG.mode,
      modeloUrl:
        typeof parsed?.modeloUrl === "string" && parsed.modeloUrl.trim()
          ? parsed.modeloUrl.trim()
          : undefined,
      size: clampSize(parsed?.size),
      position: isValidPosition(parsed?.position) ? parsed.position : DEFAULT_AVATAR_CONFIG.position,
    };
  } catch {
    return { ...DEFAULT_AVATAR_CONFIG };
  }
}

/** Escribe (merge parcial) la config del avatar y notifica al tab. NUNCA lanza. */
export function setAvatarConfig(patch: Partial<AuroraAvatarConfig>): void {
  const current = getAvatarConfig();
  const next: AuroraAvatarConfig = {
    mode: isValidMode(patch.mode) ? patch.mode : current.mode,
    modeloUrl: "modeloUrl" in patch ? (patch.modeloUrl?.trim() || undefined) : current.modeloUrl,
    size: "size" in patch ? clampSize(patch.size) : current.size,
    position: isValidPosition(patch.position) ? patch.position : current.position,
  };
  const ls = safeLocalStorage();
  if (ls) {
    try {
      ls.setItem(AURORA_AVATAR_CONFIG_KEY, JSON.stringify(next));
    } catch {
      /* cuota/modo privado: degrada en silencio */
    }
  }
  emitChange();
}

/** Restaura la config del avatar al default (orbe · 132px · inline). */
export function resetAvatarConfig(): void {
  const ls = safeLocalStorage();
  if (ls) {
    try {
      ls.removeItem(AURORA_AVATAR_CONFIG_KEY);
    } catch {
      /* */
    }
  }
  emitChange();
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_AVATAR_CONFIG_EVENT));
  } catch {
    /* */
  }
}

/** Suscribe a cambios de la config del avatar (mismo tab + otras pestañas). */
export function subscribeAvatarConfig(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === AURORA_AVATAR_CONFIG_KEY) cb();
  };
  try {
    window.addEventListener(AURORA_AVATAR_CONFIG_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
  } catch {
    /* */
  }
  return () => {
    try {
      window.removeEventListener(AURORA_AVATAR_CONFIG_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    } catch {
      /* */
    }
  };
}
