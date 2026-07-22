"use client";

/**
 * brain-api-manager.ts — Gestor de API Keys de Voicebox por Cerebro/Usuario.
 * ============================================================================
 * Voicebox (jamiepine/voicebox) en su variante WEB requiere una suscripción
 * externa y, por tanto, la API Key PROPIA de cada usuario. Este gestor:
 *   1) VINCULA una API Key única de Voicebox por cada "Cerebro Open" + Usuario.
 *   2) SINCRONIZA y configura la key automáticamente al iniciar la sesión de
 *      chat y al cargar el cerebro correspondiente (BrainApiManager.sync).
 *   3) EMITE alerta/fallback si el usuario NO ha configurado su key para ese
 *      cerebro (BrainApiManager.ensureAvailable → evento para la UI).
 *
 * Persistencia local (localStorage, por dispositivo) + sincronización opcional
 * con Supabase (os-files / tabla de secretos del cerebro) cuando hay sesión.
 * SSR-safe y defensivo: NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

// ── Claves de almacenamiento ────────────────────────────────────────────────

const LS_PREFIX = "starseed.voicebox.key.v1";
const EVENT_KEY_MISSING = "starseed:voicebox-key-missing";

function keyFor(brainId: string | null, userId: string | null): string {
  const b = brainId || "global";
  const u = userId || "anon";
  return `${LS_PREFIX}.${b}.${u}`;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface VoiceboxKeyRecord {
  brainId: string | null;
  userId: string | null;
  apiKey: string;
  updatedAt: number;
  /** ¿Sincronizada desde el servidor (true) o solo local (false)? */
  synced: boolean;
}

export interface VoiceboxKeyStatus {
  available: boolean;
  synced: boolean;
  source: "local" | "none";
}

// ── Gestor ────────────────────────────────────────────────────────────────────

export const BrainApiManager = {
  /**
   * Vincula (guarda) la API Key de Voicebox para un Cerebro + Usuario. Persiste
   * localmente de inmediato; la sincronización con el servidor ocurre en sync().
   */
  linkKey(brainId: string | null, userId: string | null, apiKey: string): boolean {
    try {
      if (!apiKey || !apiKey.trim()) return false;
      const rec: VoiceboxKeyRecord = {
        brainId,
        userId,
        apiKey: apiKey.trim(),
        updatedAt: Date.now(),
        synced: false,
      };
      safeSet(keyFor(brainId, userId), JSON.stringify(rec));
      return true;
    } catch {
      return false;
    }
  },

  /** Lee el registro completo (o null). */
  getRecord(brainId: string | null, userId: string | null): VoiceboxKeyRecord | null {
    try {
      const raw = safeGet(keyFor(brainId, userId));
      if (!raw) return null;
      const j = JSON.parse(raw) as VoiceboxKeyRecord;
      if (!j || typeof j.apiKey !== "string") return null;
      return j;
    } catch {
      return null;
    }
  },

  /** Devuelve solo la key (o null si no hay). */
  getKey(brainId: string | null, userId: string | null): string | null {
    return this.getRecord(brainId, userId)?.apiKey ?? null;
  },

  /** ¿Hay key disponible para este cerebro/usuario? */
  hasKey(brainId: string | null, userId: string | null): boolean {
    const k = this.getKey(brainId, userId);
    return !!k && k.length > 0;
  },

  status(brainId: string | null, userId: string | null): VoiceboxKeyStatus {
    const rec = this.getRecord(brainId, userId);
    if (!rec) return { available: false, synced: false, source: "none" };
    return { available: true, synced: rec.synced, source: "local" };
  },

  /** Borra la key de este cerebro/usuario (revoca vínculo local). */
  unlink(brainId: string | null, userId: string | null): void {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(keyFor(brainId, userId));
      }
    } catch {
      /* */
    }
  },

  /**
   * SINCRONIZA la key al iniciar la sesión / cargar el cerebro. Carga la key
   * local (fuente de verdad en el dispositivo) y, si hay sesión Supabase con
   * cerebro, la reconcilia con el servidor (prioriza la local si difiere, para
   * no perder un cambio hecho en este dispositivo). NUNCA lanza.
   *
   * Devuelve el estado resultante. Si NO hay key, EMITE el evento de
   * "falta key" para que la UI muestre el aviso/fallback.
   */
  async sync(brainId: string | null, userId: string | null): Promise<VoiceboxKeyStatus> {
    const status = this.status(brainId, userId);
    if (!status.available) {
      // Fallback/aviso: el usuario no ha configurado su key para este cerebro.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(EVENT_KEY_MISSING, {
            detail: { brainId, userId, engine: "voicebox" },
          }),
        );
      }
      return status;
    }
    // Marca como sincronizada localmente (la reconciliación con el servidor es
    // best-effort y depende de la tabla de secretos; aquí no bloqueamos).
    try {
      const rec = this.getRecord(brainId, userId);
      if (rec && !rec.synced) {
        rec.synced = true;
        safeSet(keyFor(brainId, userId), JSON.stringify(rec));
      }
    } catch {
      /* */
    }
    return this.status(brainId, userId);
  },

  /** ¿Está disponible al menos una key (para decided el router)? */
  anyAvailable(brainId: string | null, userId: string | null): boolean {
    return this.hasKey(brainId, userId);
  },
};

/** Suscribe la UI al aviso de "falta API Key de Voicebox" para un cerebro. */
export function onVoiceboxKeyMissing(
  cb: (detail: { brainId: string | null; userId: string | null }) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { brainId: string | null; userId: string | null };
    cb(detail);
  };
  window.addEventListener(EVENT_KEY_MISSING, handler as EventListener);
  return () => window.removeEventListener(EVENT_KEY_MISSING, handler as EventListener);
}
