"use client";

/**
 * StarSeed OS — Red Mesh · PRIVACIDAD Y PERMISOS DE USO (Adenda 98).
 * ============================================================================
 * Opciones de privacidad de ESTA neurona en la malla y la federación:
 *
 *   · visibility     → quién ve esta neurona en la topología federada:
 *                      "account" (mis otras neuronas · por defecto) | "private"
 *                      (no publico nada a la federación; la malla LoRa local
 *                      sigue igual — eso lo gobierna el propio radio).
 *   · sharePosition  → si mi posición GPS (cuando el radio la tiene) viaja en
 *                      la instantánea federada. POR DEFECTO NO (privacidad
 *                      primero: la ubicación es de las cosas más sensibles).
 *   · shareName      → si el nombre legible de mis nodos viaja a la federación
 *                      (OFF = solo números de nodo).
 *   · relayUse       → PERMISO DE USO de esta neurona como relé de la malla a
 *                      nivel de app: "all" (cualquier sobre StarSeed oído),
 *                      "alerts" (solo alertas P0 · por defecto), "none".
 *                      (El reenvío de RADIO puro lo decide el firmware del
 *                      nodo con su rol Meshtastic; esto gobierna NUESTRA capa.)
 *
 * Persistencia local-first por dispositivo + evento. SSR-safe. NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const MESH_PRIVACY_EVENT = "starseed:mesh-privacy";
const MESH_PRIVACY_LS_KEY = "starseed.mesh.privacy.v1";

export type MeshVisibility = "account" | "private";
export type MeshRelayUse = "all" | "alerts" | "none";

/**
 * Presencia de ESTA neurona en el RADAR PÚBLICO de la malla (entre cuentas):
 *   · "visible"    → aparece como usuario activo (etiqueta según shareName) y,
 *                    si sharePosition está ON, con posición aproximada.
 *   · "anonymous"  → participa en la malla pública (da y recibe) PERO sin
 *                    mostrar datos de usuario ni ubicación de la neurona (por
 *                    defecto: privacidad primero).
 *   · "off"        → no emite faro al radar público (sigue usando la malla,
 *                    pero es invisible en el radar entre cuentas).
 */
export type PublicRadarMode = "visible" | "anonymous" | "off";

export interface MeshPrivacySettings {
  visibility: MeshVisibility;
  sharePosition: boolean;
  shareName: boolean;
  relayUse: MeshRelayUse;
  /** Cómo aparece esta neurona en el radar público de la malla (entre cuentas). */
  publicRadar: PublicRadarMode;
}

/**
 * EL RELÉ SIEMPRE ESTÁ ACTIVO (petición de Alex · principio de procomún): cada
 * neurona da y recibe de forma justa y eficiente para TODA la red — no se puede
 * desactivar. `relayUse` queda fijado a "all" y `getMeshPrivacy` lo fuerza
 * siempre, ignorando cualquier valor guardado o cualquier intento de cambiarlo.
 * (La privacidad de IDENTIDAD — visibility/posición/nombre — sí es configurable;
 * lo que no se toca es la PARTICIPACIÓN como relé, que es el bien común.)
 */
export const RELAY_ALWAYS_ON: MeshRelayUse = "all";

export const DEFAULT_MESH_PRIVACY: MeshPrivacySettings = {
  visibility: "account",
  sharePosition: false, // privacidad primero: la ubicación no viaja salvo opt-in
  shareName: true,
  relayUse: RELAY_ALWAYS_ON, // no configurable
  publicRadar: "anonymous", // participa en la malla pública sin exponer usuario/ubicación
};

export function getMeshPrivacy(): MeshPrivacySettings {
  try {
    const raw = safeGet(MESH_PRIVACY_LS_KEY);
    if (!raw) return { ...DEFAULT_MESH_PRIVACY };
    const j = JSON.parse(raw) as Partial<MeshPrivacySettings>;
    return {
      visibility: j.visibility === "private" ? "private" : "account",
      sharePosition: typeof j.sharePosition === "boolean" ? j.sharePosition : DEFAULT_MESH_PRIVACY.sharePosition,
      shareName: typeof j.shareName === "boolean" ? j.shareName : DEFAULT_MESH_PRIVACY.shareName,
      // El relé SIEMPRE activo: no se lee del almacenamiento ni se puede apagar.
      relayUse: RELAY_ALWAYS_ON,
      publicRadar:
        j.publicRadar === "visible" || j.publicRadar === "off" || j.publicRadar === "anonymous"
          ? j.publicRadar
          : DEFAULT_MESH_PRIVACY.publicRadar,
    };
  } catch {
    return { ...DEFAULT_MESH_PRIVACY };
  }
}

export function setMeshPrivacy(patch: Partial<MeshPrivacySettings>): MeshPrivacySettings {
  const prev = getMeshPrivacy();
  // El relé NO se puede cambiar: se ignora cualquier `relayUse` del patch y
  // queda siempre "all" (dar y recibir justo para toda la red).
  const { relayUse: _ignored, ...rest } = patch;
  const next = { ...prev, ...rest, relayUse: RELAY_ALWAYS_ON };
  try {
    safeSet(MESH_PRIVACY_LS_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(MESH_PRIVACY_EVENT, { detail: next }));
      // Al ENTRAR en "private", borra la fila ya publicada (no basta con dejar
      // de subir: la última instantánea seguiría legible ~10 min). Import
      // dinámico para no acoplar este módulo liviano a Supabase. Nunca lanza.
      if (prev.visibility !== "private" && next.visibility === "private") {
        void import("./federation").then((m) => m.purgeMeshTopology()).catch(() => {});
      }
    }
  } catch {
    /* */
  }
  return next;
}
