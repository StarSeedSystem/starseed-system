"use client";

/*
 * lan-sync — Orquestador de SINCRONIZACIÓN DIRECTA (P2P WebRTC) entre dispositivos
 * de la misma cuenta, sobre `webrtc-mesh.ts` + señalización por la cuenta.
 * ---------------------------------------------------------------------------
 * QUÉ ES (ahora REAL):
 *   Conecta dos dispositivos de la MISMA cuenta que comparten IP pública (ver
 *   `device-registry.ts`) mediante una conexión P2P directa:
 *     - Transporte de datos: RTCPeerConnection + RTCDataChannel (P2P directo).
 *       La IP privada/LAN nunca se expone; ICE negocia la mejor ruta (host/srflx).
 *     - SEÑALIZACIÓN VÍA LA CUENTA: oferta/respuesta SDP + ICE viajan por la
 *       cuenta soberana (Supabase Realtime, con fallback a `prefs.signals[]`).
 *       NO hay servidor de señalización de terceros.
 *     - STUN público (stun.l.google.com). Sin TURN: en NAT simétrico puede fallar
 *       (se reporta con honestidad, no se simula éxito).
 *
 * COMPATIBILIDAD:
 *   Mantiene la API pública previa (`createPeerOffer`, `acceptOffer`,
 *   `beginDirectSync`, `isWebRtcSupported`, `lanSyncStatus`, `describeLanSync`,
 *   tipos) para no romper el panel. Internamente ahora sí negocia de verdad.
 *
 * DEGRADACIÓN HONESTA:
 *   - Sin WebRTC → "unsupported".
 *   - Sin sesión (no hay cuenta = no hay buzón de señalización) → "not-configured"
 *     con mensaje claro (hay que iniciar sesión en ambos dispositivos).
 *   - Con todo disponible → negocia y devuelve "connecting"/"connected"/"error".
 *
 * Alineado con CLAUDE.md: Identidad Soberana (la cuenta es el canal),
 * descentralización (P2P directo), defensivo (nunca rompe).
 */

import type { DeviceInfo } from "@/lib/network/device-registry";
import { createClient } from "@/utils/supabase/client";
import {
  initMesh,
  isWebRtcSupported as meshWebRtcSupported,
  type MeshHandle,
  type PeerSnapshot,
} from "@/lib/network/webrtc-mesh";

/* ------------------------------------------------------------------ */
/* Tipos del contrato (compatibles con la versión previa)            */
/* ------------------------------------------------------------------ */

/** Estado de disponibilidad del transporte directo. */
export type LanSyncStatus =
  | "not-configured" // andamiaje presente pero falta sesión/cuenta para señalizar
  | "unsupported" // el entorno no soporta WebRTC
  | "ready" // listo para negociar
  | "connecting"
  | "connected"
  | "error";

/** Resultado uniforme y defensivo de cualquier operación de este módulo. */
export interface LanSyncResult {
  ok: boolean;
  status: LanSyncStatus;
  /** Mensaje honesto para mostrar en la UI. */
  detail: string;
  /** Oferta/respuesta SDP serializada (cuando aplique). */
  sdp?: string;
}

/** Descriptor mínimo de una sesión P2P. */
export interface PeerSessionInfo {
  /** Id de este dispositivo (origen). */
  fromDeviceId: string;
  /** Id del dispositivo destino (mismo dueño, misma red inferida). */
  toDeviceId: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Detección de soporte (real, no simulada)                          */
/* ------------------------------------------------------------------ */

/** ¿El navegador expone la API de WebRTC? (comprobación real). */
export function isWebRtcSupported(): boolean {
  return meshWebRtcSupported();
}

/**
 * lanSyncStatus — estado honesto del transporte directo HOY (síncrono).
 *  - Sin WebRTC → "unsupported".
 *  - Con WebRTC → "ready" (listo para negociar; la sesión se comprueba al
 *    iniciar, de forma asíncrona, en `beginDirectSync`).
 */
export function lanSyncStatus(): LanSyncStatus {
  if (!isWebRtcSupported()) return "unsupported";
  return "ready";
}

/** Texto honesto para la UI según el estado. */
export function describeLanSync(status: LanSyncStatus = lanSyncStatus()): string {
  switch (status) {
    case "unsupported":
      return "Este navegador no soporta conexión directa (WebRTC).";
    case "not-configured":
      return "Preparado. La señalización viaja por tu cuenta; inicia sesión en ambos dispositivos para conectar.";
    case "ready":
      return "Listo para conectar por red directa (WebRTC). La señalización viaja por tu cuenta.";
    case "connecting":
      return "Estableciendo conexión directa…";
    case "connected":
      return "Conectado por red directa.";
    case "error":
      return "No se pudo establecer la conexión directa.";
    default:
      return "Estado desconocido.";
  }
}

/* ------------------------------------------------------------------ */
/* Sesión                                                            */
/* ------------------------------------------------------------------ */

async function getUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Mesh compartido a nivel de módulo                                 */
/* ------------------------------------------------------------------ */

/**
 * Un único mesh por (dispositivo, cuenta) reutilizado entre llamadas. La UI
 * puede tomar el handle vía `getSharedMesh()` para escuchar peers y enviar pings.
 */
let sharedMesh: MeshHandle | null = null;
let sharedMeshKey: string | null = null; // `${userId}:${deviceId}`

/**
 * ensureMesh — crea (o reutiliza) el mesh para este dispositivo + cuenta.
 * Devuelve null si no hay WebRTC o no hay sesión (degradación honesta).
 * NUNCA lanza.
 */
export async function ensureMesh(self: DeviceInfo | null): Promise<MeshHandle | null> {
  try {
    if (!isWebRtcSupported()) return null;
    if (!self?.id) return null;
    const userId = await getUserId();
    if (!userId) return null;

    const key = `${userId}:${self.id}`;
    if (sharedMesh && sharedMeshKey === key) return sharedMesh;

    // Cambió la identidad: cerramos el anterior.
    if (sharedMesh && sharedMeshKey !== key) {
      try {
        sharedMesh.closeMesh();
      } catch {
        /* noop */
      }
      sharedMesh = null;
      sharedMeshKey = null;
    }

    const mesh = initMesh(self.id, userId);
    if (!mesh) return null;
    sharedMesh = mesh;
    sharedMeshKey = key;
    return mesh;
  } catch {
    return null;
  }
}

/** Devuelve el mesh compartido actual (o null si no se ha iniciado). */
export function getSharedMesh(): MeshHandle | null {
  return sharedMesh;
}

/** Cierra y descarta el mesh compartido (para desmontajes). NUNCA lanza. */
export function teardownMesh(): void {
  try {
    sharedMesh?.closeMesh();
  } catch {
    /* noop */
  }
  sharedMesh = null;
  sharedMeshKey = null;
}

/* ------------------------------------------------------------------ */
/* Mapeo PeerSnapshot → LanSyncResult                                */
/* ------------------------------------------------------------------ */

function peerToResult(snap: PeerSnapshot): LanSyncResult {
  switch (snap.state) {
    case "connected":
      return { ok: true, status: "connected", detail: describeLanSync("connected") };
    case "connecting":
      return { ok: true, status: "connecting", detail: describeLanSync("connecting") };
    case "failed":
      return {
        ok: false,
        status: "error",
        detail:
          "No se pudo establecer la conexión directa (posible NAT simétrico sin TURN, o el otro dispositivo no está conectado).",
      };
    case "closed":
    default:
      return { ok: false, status: "error", detail: describeLanSync("error") };
  }
}

/* ------------------------------------------------------------------ */
/* API pública de negociación (ahora REAL)                           */
/* ------------------------------------------------------------------ */

/**
 * createPeerOffer — inicia la negociación P2P con `target`: crea el mesh (si no
 * existe), lanza la oferta (SDP) por la señalización de la cuenta y devuelve el
 * estado inicial (normalmente "connecting"). La conexión se completa de forma
 * asíncrona vía ICE/answer; la UI observa el progreso con `getSharedMesh().onPeer`.
 *
 * NUNCA lanza: siempre devuelve un LanSyncResult.
 */
export async function createPeerOffer(
  self: DeviceInfo | null,
  target: DeviceInfo | null,
): Promise<LanSyncResult> {
  try {
    if (!isWebRtcSupported()) {
      return {
        ok: false,
        status: "unsupported",
        detail: "Este navegador no soporta WebRTC; no hay conexión directa disponible.",
      };
    }
    if (!self?.id || !target?.id) {
      return {
        ok: false,
        status: "ready",
        detail: "Faltan dispositivos (origen/destino) para negociar.",
      };
    }

    const mesh = await ensureMesh(self);
    if (!mesh) {
      return {
        ok: false,
        status: "not-configured",
        detail:
          "Inicia sesión para conectar: la señalización viaja por tu cuenta y hace falta en ambos dispositivos.",
      };
    }

    const snap = await mesh.connectToDevice(target.id);
    return peerToResult(snap);
  } catch {
    return { ok: false, status: "error", detail: describeLanSync("error") };
  }
}

/**
 * acceptOffer — con la señalización por la cuenta, las ofertas ENTRANTES se
 * responden AUTOMÁTICAMENTE por el mesh (`initMesh` suscribe la señalización y
 * contesta). Este método se conserva por compatibilidad de API:
 *   - Sin argumento: asegura que el mesh esté vivo y escuchando (idempotente).
 *   - Con `offerSdp`: valida su forma y confirma que el mesh lo manejará.
 *
 * NUNCA lanza: siempre devuelve un LanSyncResult.
 */
export async function acceptOffer(offerSdp?: string, self?: DeviceInfo | null): Promise<LanSyncResult> {
  try {
    if (!isWebRtcSupported()) {
      return {
        ok: false,
        status: "unsupported",
        detail: "Este navegador no soporta WebRTC; no se puede aceptar la conexión directa.",
      };
    }
    // Asegura el mesh vivo si nos pasan `self` (si no, usa el compartido).
    const mesh = self ? await ensureMesh(self) : getSharedMesh();
    if (!mesh) {
      return {
        ok: false,
        status: "not-configured",
        detail: "Inicia sesión para aceptar conexiones directas (la señalización viaja por tu cuenta).",
      };
    }
    if (offerSdp && !offerSdp.trim()) {
      return { ok: false, status: "ready", detail: "No se recibió ninguna oferta que aceptar." };
    }
    // El mesh responde las ofertas entrantes automáticamente.
    return {
      ok: true,
      status: "ready",
      detail: "Escuchando ofertas entrantes; se responderán automáticamente por tu cuenta.",
    };
  } catch {
    return { ok: false, status: "error", detail: describeLanSync("error") };
  }
}

/**
 * beginDirectSync — orquestador de alto nivel que usa la UI: inicia la
 * sincronización directa con un dispositivo de la misma red (o cualquiera de la
 * cuenta si no se pudo inferir la red). Crea/asegura el mesh y lanza la oferta.
 *
 * Flujo real: ensureMesh(self) → connectToDevice(target) → (ICE/answer async).
 * La UI observa el progreso con el handle del mesh.
 */
export async function beginDirectSync(
  self: DeviceInfo | null,
  target: DeviceInfo | null,
): Promise<LanSyncResult> {
  if (!isWebRtcSupported()) {
    return {
      ok: false,
      status: "unsupported",
      detail: "Este navegador no soporta conexión directa (WebRTC).",
    };
  }
  if (!self?.id) {
    return { ok: false, status: "ready", detail: "No se ha detectado este dispositivo todavía." };
  }
  if (!target?.id) {
    return {
      ok: false,
      status: "ready",
      detail: "No hay ningún dispositivo destino para conectar (abre StarSeed en otro equipo con tu sesión).",
    };
  }
  return createPeerOffer(self, target);
}
