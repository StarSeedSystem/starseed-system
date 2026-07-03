"use client";

/*
 * lan-sync — Andamiaje HONESTO para futura sincronización DIRECTA (P2P WebRTC)
 * entre dispositivos de la misma red.
 * ---------------------------------------------------------------------------
 * QUÉ ES (y qué NO es todavía):
 *   Este módulo define el CONTRATO y los ganchos para conectar dos dispositivos
 *   de la MISMA cuenta que comparten IP pública (ver `device-registry.ts`). Hoy
 *   NO implementa WebRTC completo: los métodos son stubs defensivos que
 *   devuelven un estado honesto ("no configurado"). El objetivo es dejar la API
 *   lista para enchufar la implementación real sin tocar la UI.
 *
 * CÓMO FUNCIONARÁ (diseño):
 *   - Transporte de datos: RTCPeerConnection + RTCDataChannel (P2P directo).
 *     La IP privada/LAN nunca se expone a la web; WebRTC negocia la ruta más
 *     directa posible (host/srflx/relay) mediante ICE.
 *   - SEÑALIZACIÓN VÍA LA CUENTA: el intercambio de oferta/respuesta SDP y de
 *     candidatos ICE viaja a través de la cuenta soberana (Supabase), p.ej.
 *     escribiendo en `user_settings.prefs.network.signals[]` o por Realtime
 *     entre los dispositivos del mismo usuario. NO hay servidor de señalización
 *     de terceros: la propia cuenta hace de buzón cifrable.
 *   - Sin STUN/TURN externos obligatorios: si ambos comparten IP pública/red,
 *     la conexión host-a-host suele bastar; TURN quedaría como opción futura.
 *
 * ESTADO ACTUAL: preparado. Señalización por tu cuenta. Conexión real pendiente.
 *
 * Alineado con CLAUDE.md: Identidad Soberana (la cuenta es el canal),
 * descentralización (P2P directo, sin intermediario), defensivo (nunca rompe).
 */

import type { DeviceInfo } from "@/lib/network/device-registry";

/* ------------------------------------------------------------------ */
/* Tipos del contrato                                                */
/* ------------------------------------------------------------------ */

/** Estado de disponibilidad del transporte directo. */
export type LanSyncStatus =
  | "not-configured" // andamiaje presente, WebRTC aún no implementado (hoy)
  | "unsupported" // el entorno no soporta WebRTC
  | "ready" // listo para negociar (futuro)
  | "connecting"
  | "connected"
  | "error";

/** Resultado uniforme y defensivo de cualquier operación de este módulo. */
export interface LanSyncResult {
  ok: boolean;
  status: LanSyncStatus;
  /** Mensaje honesto para mostrar en la UI. */
  detail: string;
  /** Oferta/respuesta SDP serializada (cuando aplique, en el futuro). */
  sdp?: string;
}

/** Descriptor mínimo de una sesión P2P (para el futuro handshake). */
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
  if (typeof window === "undefined") return false;
  try {
    return typeof (window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection === "function";
  } catch {
    return false;
  }
}

/**
 * lanSyncStatus — estado honesto del transporte directo HOY.
 *  - Sin WebRTC en el entorno → "unsupported".
 *  - Con WebRTC pero sin implementación conectada → "not-configured".
 */
export function lanSyncStatus(): LanSyncStatus {
  if (!isWebRtcSupported()) return "unsupported";
  return "not-configured";
}

/** Texto honesto para la UI según el estado. */
export function describeLanSync(status: LanSyncStatus = lanSyncStatus()): string {
  switch (status) {
    case "unsupported":
      return "Este navegador no soporta conexión directa (WebRTC).";
    case "not-configured":
      return "Preparado. La señalización viaja por tu cuenta; la conexión directa (WebRTC) aún no está activada.";
    case "ready":
      return "Listo para negociar conexión directa.";
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
/* Ganchos del handshake (stubs defensivos — contrato listo)         */
/* ------------------------------------------------------------------ */

function notConfigured(detail?: string): LanSyncResult {
  const status = lanSyncStatus();
  return {
    ok: false,
    status,
    detail: detail ?? describeLanSync(status),
  };
}

/**
 * createPeerOffer — (FUTURO) crea una oferta SDP para conectar con `target`.
 * Hoy: stub defensivo que devuelve "no configurado". El contrato queda listo:
 * cuando se implemente, aquí se creará el RTCPeerConnection, el DataChannel y
 * la oferta, y se PUBLICARÁ vía la cuenta (señalización) hacia `target`.
 *
 * NUNCA lanza: siempre devuelve un LanSyncResult.
 */
export async function createPeerOffer(
  self: DeviceInfo | null,
  target: DeviceInfo | null,
): Promise<LanSyncResult> {
  try {
    if (!isWebRtcSupported()) {
      return notConfigured("Este navegador no soporta WebRTC; no hay conexión directa disponible.");
    }
    if (!self?.id || !target?.id) {
      return {
        ok: false,
        status: lanSyncStatus(),
        detail: "Faltan dispositivos (origen/destino) para negociar.",
      };
    }
    if (!self.publicIp || self.publicIp !== target.publicIp) {
      return {
        ok: false,
        status: lanSyncStatus(),
        detail: "Estos dispositivos no comparten IP pública: no se infiere que estén en la misma red.",
      };
    }
    // Gancho listo. Implementación WebRTC pendiente (señalización por la cuenta).
    return notConfigured();
  } catch {
    return { ok: false, status: "error", detail: describeLanSync("error") };
  }
}

/**
 * acceptOffer — (FUTURO) acepta una oferta SDP recibida (vía la cuenta) y
 * devuelve la respuesta. Hoy: stub defensivo "no configurado".
 *
 * NUNCA lanza: siempre devuelve un LanSyncResult.
 */
export async function acceptOffer(offerSdp?: string): Promise<LanSyncResult> {
  try {
    if (!isWebRtcSupported()) {
      return notConfigured("Este navegador no soporta WebRTC; no se puede aceptar la conexión directa.");
    }
    if (!offerSdp || !offerSdp.trim()) {
      return {
        ok: false,
        status: lanSyncStatus(),
        detail: "No se recibió ninguna oferta que aceptar.",
      };
    }
    // Gancho listo. Implementación WebRTC pendiente.
    return notConfigured();
  } catch {
    return { ok: false, status: "error", detail: describeLanSync("error") };
  }
}

/**
 * beginDirectSync — orquestador de alto nivel que usaría la UI: intenta iniciar
 * la sincronización directa con un dispositivo de la misma red. Hoy devuelve el
 * estado honesto "preparado, señalización por tu cuenta" sin romper nada.
 *
 * En el futuro: createPeerOffer(self, target) → publicar oferta en la cuenta →
 * esperar respuesta → abrir DataChannel → transferir el bundle del dispositivo.
 */
export async function beginDirectSync(
  self: DeviceInfo | null,
  target: DeviceInfo | null,
): Promise<LanSyncResult> {
  const offer = await createPeerOffer(self, target);
  // Si el motivo es puramente "no configurado", damos un mensaje amable.
  if (!offer.ok && offer.status === "not-configured") {
    return {
      ok: false,
      status: "not-configured",
      detail: "Sincronización directa preparada: la señalización irá por tu cuenta. Activación de WebRTC pendiente.",
    };
  }
  return offer;
}
