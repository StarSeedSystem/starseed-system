/**
 * StarSeed OS — Red Mesh · ROUTER DE DECISIÓN Mesh ↔ Wi-Fi (Adenda 97 · SOP §4).
 * ============================================================================
 * El "cerebro" que decide EN FRACCIONES DE SEGUNDO por dónde viaja cada envío.
 * Clave del diseño: la decisión es SÍNCRONA y O(1) — lee el estado cacheado
 * (que las sondas de health.ts y la telemetría del radio alimentan en segundo
 * plano) y aplica umbrales + histéresis. Nada de red en el camino caliente.
 *
 * Política por CLASE (SOP §4.2):
 *   P0 alert    → DUAL (mesh con wantAck + Wi-Fi si vive). La alerta llega SÍ o SÍ.
 *   P1 message  → mejor ruta; mesh si Wi-Fi degradada.
 *   P2 state    → Wi-Fi preferente; mesh solo como fallback real.
 *   P3 bulk     → Wi-Fi; por mesh únicamente si la neurona lo fuerza (regla).
 *
 * Histéresis anti-aleteo: para VOLVER a Wi-Fi tras usar mesh se exige
 * `score_wifi ≥ WIFI_RECOVER_SCORE` en ≥ WIFI_RECOVER_PROBES sondas seguidas.
 *
 * PURO respecto al DOM (testeable con tsx). NUNCA lanza.
 */

import {
  MESH_CLASS_SIZE_LIMIT,
  MESH_USABLE_SCORE,
  WIFI_HEALTHY_SCORE,
  WIFI_RECOVER_PROBES,
  WIFI_RECOVER_SCORE,
} from "./constants";
import { getConnectivitySettings } from "./connectivity";
import { getMeshState, pushRouteDecision } from "./store";
import type { MeshRules, RouteDecision, TrafficClass } from "./types";

/* ── Histéresis (memoria mínima del router) ────────────────────────────────── */

let usingMeshFallback = false;
let wifiRecoverStreak = 0;

/** Solo pruebas: resetea la histéresis. */
export function _resetRouterHysteresis(): void {
  usingMeshFallback = false;
  wifiRecoverStreak = 0;
}

/**
 * Actualiza la histéresis con cada publicación de salud Wi-Fi (la llama
 * health.ts indirectamente vía suscripción en index.ts, o el simulador).
 */
export function feedWifiSample(score: number): void {
  if (!usingMeshFallback) return;
  if (score >= WIFI_RECOVER_SCORE) {
    wifiRecoverStreak += 1;
    if (wifiRecoverStreak >= WIFI_RECOVER_PROBES) {
      usingMeshFallback = false;
      wifiRecoverStreak = 0;
    }
  } else {
    wifiRecoverStreak = 0;
  }
}

/* ── Decisión ──────────────────────────────────────────────────────────────── */

export interface DecideRouteInput {
  cls: TrafficClass;
  sizeBytes: number;
  /** Reglas de la neurona origen (null → por defecto). */
  neuronRules?: MeshRules | null;
  /** ¿Hay tokens de airtime para al menos 1 trozo? (lo responde sync.ts). */
  airtimeAvailable?: boolean;
}

/**
 * decideRoute — SÍNCRONA, O(1). Devuelve la decisión YA registrada en el
 * historial del store (razón + métricas del instante).
 */
export function decideRoute(input: DecideRouteInput): RouteDecision {
  const s = getMeshState();
  const wifiScore = s.wifiHealth.score;
  const meshScore = s.meshHealth.score;
  const meshReady = s.status === "ready" || s.status === "degraded";
  const rules = input.neuronRules ?? null;
  const airtime = input.airtimeAvailable ?? true;

  const make = (route: RouteDecision["route"], reason: RouteDecision["reason"]): RouteDecision => {
    const d: RouteDecision = {
      route,
      reason,
      cls: input.cls,
      sizeBytes: input.sizeBytes,
      wifiScore,
      meshScore,
      at: Date.now(),
    };
    pushRouteDecision(d);
    return d;
  };

  // Reglas duras de la neurona. "off" (no participa) y "listen-only" (jamás
  // transmite) NUNCA enrutan a la malla — ni siquiera P0: son roles que el
  // usuario eligió precisamente para no emitir por radio. Van por Wi-Fi si la
  // hay, o quedan fuera de la malla (offline-queue = NO se encola en mesh, ver
  // sendOverMesh). No dependemos de `wifiScore > 0` (que es también el estado
  // inicial del store, antes de la primera sonda).
  if (rules && (rules.role === "off" || rules.role === "listen-only")) {
    return make(wifiScore >= 0.05 ? "wifi" : "offline-queue", wifiScore >= 0.05 ? "wifi-healthy" : "all-links-down");
  }
  // Clase no permitida por la neurona (salvo P0, que la seguridad justifica).
  if (rules && !rules.allowedClasses.includes(input.cls) && input.cls !== "P0") {
    return make(wifiScore >= 0.05 ? "wifi" : "offline-queue", wifiScore >= 0.05 ? "wifi-healthy" : "all-links-down");
  }

  // Sin radio: Wi-Fi o cola offline.
  if (!meshReady) {
    return wifiScore > 0.05
      ? make("wifi", "no-radio")
      : make("offline-queue", "all-links-down");
  }

  // Ajustes de conectividad de la neurona (modo dual + ruta preferida, Adenda 98).
  const conn = (() => {
    try {
      return getConnectivitySettings();
    } catch {
      return { dualMode: true, preferred: "auto" as const };
    }
  })();
  const fitsClass = input.sizeBytes <= MESH_CLASS_SIZE_LIMIT[input.cls];
  const meshUsable = meshScore >= MESH_USABLE_SCORE && fitsClass && airtime;

  // P0: dual SIEMPRE que haya malla (y Wi-Fi si vive). La seguridad manda.
  if (input.cls === "P0") {
    return make(wifiScore > 0.05 ? "dual" : "mesh", "critical-dual-path");
  }

  // ¿La neurona (o la ruta preferida) fuerza mesh para esta clase?
  const preferMesh = conn.preferred === "mesh";
  const forcedMesh =
    (!!rules && rules.role === "interactive" && rules.priority === "high" && !s.wifiHealth.score &&
      rules.allowedClasses.includes(input.cls)) ||
    (preferMesh && rules?.allowedClasses.includes(input.cls) !== false);

  const wifiHealthy = usingMeshFallback
    ? wifiScore >= WIFI_RECOVER_SCORE && wifiRecoverStreak + 1 >= WIFI_RECOVER_PROBES
    : wifiScore >= WIFI_HEALTHY_SCORE;

  // MODO DUAL (Adenda 98): con ambas vías sanas, la PRESENCIA (P1) viaja por
  // las DOS a la vez — así los vecinos de la malla ven la neurona aunque solo
  // uno de los dos medios les llegue. El resto de clases elige una ruta (no se
  // duplica tráfico pesado en la malla). Respeta airtime y la ruta preferida.
  if (
    conn.dualMode &&
    input.cls === "P1" &&
    wifiHealthy &&
    meshUsable &&
    conn.preferred === "auto"
  ) {
    // Wi-Fi está sana (llegamos aquí con wifiHealthy): limpiar la histéresis de
    // fallback igual que la rama wifi-healthy, para no re-enrutar P1 a mesh-only.
    usingMeshFallback = false;
    wifiRecoverStreak = 0;
    return make("dual", "critical-dual-path");
  }

  if (wifiHealthy && !forcedMesh) {
    usingMeshFallback = false;
    return make("wifi", "wifi-healthy");
  }

  // Ruta preferida = mesh (con ambas sanas): usar la malla explícitamente.
  if (preferMesh && meshUsable) {
    usingMeshFallback = false; // no es fallback: es preferencia del usuario
    return make("mesh", "mesh-forced-by-rule");
  }

  // Wi-Fi degradada → ¿la malla puede con esto?
  if (!fitsClass) {
    return wifiScore > 0.05
      ? make("wifi", "payload-too-large")
      : make("offline-queue", "payload-too-large");
  }
  if (meshScore >= MESH_USABLE_SCORE) {
    usingMeshFallback = true;
    wifiRecoverStreak = 0;
    if (!airtime) return make("queued-mesh", "duty-budget-exhausted");
    return make("mesh", forcedMesh ? "mesh-forced-by-rule" : "wifi-degraded");
  }

  // Ninguna ruta sana.
  if (wifiScore > 0.05) return make("wifi", "mesh-unhealthy");
  return make("offline-queue", "all-links-down");
}
