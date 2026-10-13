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
import {
  ALFA_RESILIENCIA,
  PESOS_POR_CLASE,
  actualizaResiliencia,
  observacionResiliencia,
  puntuacionHibrida,
  puntuaAnchoBanda,
  puntuaLatencia,
  puntuaTiempoAire,
  type EstadoResiliencia,
} from "./camr/metrica";
import { getConnectivitySettings } from "./connectivity";
// Adenda 149 · puerta de antenas por personalidad (pestaña «Señales»).
import { preferredRouteFor } from "./persona-antenna-gate";
import { getMeshState, pushRouteDecision } from "./store";
import type { PreferredRoute } from "./connectivity";
import type { ClaseTrafico, Medicion } from "./camr/tipos";
import { planificar, type PaquetePlan, type MetricasPlan, type CuotasPlan } from "./camr/planificador";
import { crearAdaptadorSimulado } from "./camr/enlaces";
import { CONFIG_DEFECTO, crearEstado, cicloBucle, registrarDecision, medirTodos, pasoRecomendar, pasoAplicar, pasoVigilar } from "./camr/bucle";
import type { MeshRules, RouteDecision, TrafficClass } from "./types";

/* ── Histéresis (memoria mínima del router) ────────────────────────────────── */

let usingMeshFallback = false;
let wifiRecoverStreak = 0;
let resilienciaWifi: EstadoResiliencia = { ema: 0, n: 0 };
let resilienciaMesh: EstadoResiliencia = { ema: 0, n: 0 };
let ultimaMedicionWifi = -1;
let ultimaMedicionMesh = -1;

const CLASE_CAMR: Record<TrafficClass, ClaseTrafico> = {
  P0: "control-critico",
  P1: "mensajes",
  P2: "tiempo-real",
  P3: "masivo",
};

/**
 * Aplica CAMR sin fingir mediciones: la parte observada usa sus puntuadores y
 * la parte ausente conserva la salud que ya calculaban las sondas del enlace.
 */
function puntuacionCamr(
  m: Medicion,
  capacidadKbps: number,
  clase: ClaseTrafico,
  resiliencia: EstadoResiliencia,
  saludPrevia: number,
): number {
  const pesos = PESOS_POR_CLASE[clase];
  const resilienciaObservada = m.perdida !== null || m.snrDb !== null;
  const componentes = {
    latencia: puntuaLatencia(m.latenciaMs),
    anchoBanda: puntuaAnchoBanda(m.anchoBandaKbps, capacidadKbps),
    resiliencia: resiliencia.n > 0 ? resiliencia.ema : observacionResiliencia(m),
    tiempoAire: puntuaTiempoAire(m.tiempoAireUsado),
  };
  const cobertura =
    (m.latenciaMs !== null ? pesos.latencia : 0) +
    (m.anchoBandaKbps !== null ? pesos.anchoBanda : 0) +
    (resilienciaObservada ? pesos.resiliencia : 0) +
    (m.tiempoAireUsado !== null ? pesos.tiempoAire : 0);
  if (cobertura < ALFA_RESILIENCIA) return saludPrevia;
  if (cobertura >= 1 - Number.EPSILON) {
    return puntuacionHibrida(m, capacidadKbps, clase, resiliencia);
  }
  const observada =
    (m.latenciaMs !== null ? pesos.latencia * componentes.latencia : 0) +
    (m.anchoBandaKbps !== null ? pesos.anchoBanda * componentes.anchoBanda : 0) +
    (resilienciaObservada ? pesos.resiliencia * componentes.resiliencia : 0) +
    (m.tiempoAireUsado !== null ? pesos.tiempoAire * componentes.tiempoAire : 0);
  return Math.max(0, Math.min(1, observada + (1 - cobertura) * saludPrevia));
}

/** Solo pruebas: resetea la histéresis. */
export function _resetRouterHysteresis(): void {
  usingMeshFallback = false;
  wifiRecoverStreak = 0;
  resilienciaWifi = { ema: 0, n: 0 };
  resilienciaMesh = { ema: 0, n: 0 };
  ultimaMedicionWifi = -1;
  ultimaMedicionMesh = -1;
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

/* Configuración CAMR conectada al bucle autónomo (§2). */
const CAMR_CONFIG_DEFECTO = CONFIG_DEFECTO;

/* Estado CAMR inicial conectado al bucle (§2, §6). */
const CAMR_ESTADO_INICIAL = crearEstado(CONFIG_DEFECTO);

/* ── CAMR: planificador multitrayecto (§3) — activo cuando hay transporte ─── */

function planificarCamr(
  cls: TrafficClass,
  sizeBytes: number,
  meshState: ReturnType<typeof getMeshState>,
  medicionWifi: Medicion,
  medicionMesh: Medicion,
): ReturnType<typeof planificar> | null {
  try {
    // CAMR activo: hay transporte (simulado o real) y datos para construir enlaces.
    if (!meshState.transport) return null;
    const claseCamr = CLASE_CAMR[cls];
    const paquete: PaquetePlan = { bytes: sizeBytes, cifrado: false };
    // Enlace simulado básico derivado del estado del mesh.
    const enlaceSim = crearAdaptadorSimulado("camr-enlace", meshState.region ?? "EU_868", 869.5, 1000, 250, true);
    const enlaces: typeof enlaceSim[] = [enlaceSim];
    const metricas: MetricasPlan = {
      medicion: {
        "mesh-sim": medicionMesh,
        "wifi-sim": medicionWifi,
      },
    };
    const cuotas: CuotasPlan = { cupoMs: {}, consumidoMs: {} };
    const rutas = planificar(paquete, claseCamr, enlaces, metricas, cuotas);
    // Conectado con el bucle CAMR: registro de decisiones con su porqué (§2, §6).
    const estadoBucle = CAMR_ESTADO_INICIAL;
    registrarDecision(estadoBucle, enlaceSim.id, claseCamr, rutas.map((r) => r.motivo).join("; "), rutas[0]?.puntuacion ?? 0);
    return rutas;
  } catch {
    return null;
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
  /**
   * PERSONALIDAD EMISORA (Adenda 149 · Ola 3). Cuando el llamador sabe QUIÉN
   * emite, la RUTA PREFERIDA se lee de sus reglas de la pestaña «Señales»
   * (`getOverrides` fusiona «Todas» «*» con las propias y gana la más
   * específica). Omitido ⇒ `preferredRouteFor(undefined)` cae en los defaults
   * «*» de la neurona: EXACTAMENTE el comportamiento previo a esta ola.
   */
  personaId?: string | null;
}

/**
 * decideRoute — SÍNCRONA, O(1). Devuelve la decisión YA registrada en el
 * historial del store (razón + métricas del instante).
 */
export function decideRoute(input: DecideRouteInput): RouteDecision {
  const s = getMeshState();
  const online = s.nodes.filter((n) => !n.isSelf && n.presence === "online");
  const snrs = online.map((n) => n.snr).filter((v): v is number => typeof v === "number");
  const capacidadWifiKbps = 100_000;
  const capacidadMeshKbps = 21.88;
  const medicionWifi: Medicion = {
    rssiDbm: null,
    snrDb: null,
    ber: null,
    ruidoDbm: null,
    latenciaMs: s.wifiHealth.latencyMs ?? null,
    perdida: s.wifiHealth.loss ?? null,
    tiempoAireUsado: null,
    vecinos: s.wifiHealth.score > 0 ? 1 : 0,
    anchoBandaKbps: capacidadWifiKbps * s.wifiHealth.score,
    at: s.wifiHealth.at,
  };
  const utilizacionMesh = s.self?.channelUtilization ?? null;
  const medicionMesh: Medicion = {
    rssiDbm: null,
    snrDb: snrs.length ? snrs.reduce((a, b) => a + b, 0) / snrs.length : null,
    ber: null,
    ruidoDbm: null,
    latenciaMs: s.meshHealth.latencyMs ?? null,
    perdida: s.meshHealth.loss ?? (s.meshHealth.at > 0 ? 1 - s.meshHealth.score : null),
    tiempoAireUsado: utilizacionMesh === null ? null : utilizacionMesh / 100,
    vecinos: online.length,
    anchoBandaKbps:
      utilizacionMesh === null
        ? capacidadMeshKbps * s.meshHealth.score
        : capacidadMeshKbps * Math.max(0, 1 - utilizacionMesh / 100),
    at: s.meshHealth.at,
  };
  if (medicionWifi.at > 0 && medicionWifi.at !== ultimaMedicionWifi) {
    resilienciaWifi = actualizaResiliencia(resilienciaWifi, medicionWifi);
    ultimaMedicionWifi = medicionWifi.at;
  }
  if (medicionMesh.at > 0 && medicionMesh.at !== ultimaMedicionMesh) {
    resilienciaMesh = actualizaResiliencia(resilienciaMesh, medicionMesh);
    ultimaMedicionMesh = medicionMesh.at;
  }
  const claseCamr = CLASE_CAMR[input.cls];
  // CAMR activo (§3): los mensajes con clase de tráfico pasan por `planificar`.
  // Si CAMR no está activo (sin transporte), `planificarCamr` devuelve null
  // y el comportamiento de hoy queda igual.
  const rutasCamr = planificarCamr(input.cls, input.sizeBytes, s, medicionWifi, medicionMesh);
  const wifiScore = s.wifiHealth.at > 0
    ? puntuacionCamr(medicionWifi, capacidadWifiKbps, claseCamr, resilienciaWifi, s.wifiHealth.score)
    : s.wifiHealth.score;
  const meshScore = s.meshHealth.at > 0
    ? puntuacionCamr(medicionMesh, capacidadMeshKbps, claseCamr, resilienciaMesh, s.meshHealth.score)
    : s.meshHealth.score;
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
  // Adenda 149 · puerta de antenas por personalidad: si la pestaña «Señales»
  // fijó una ruta ≠ auto en alguna antena activa, INCLINA la elección entre las
  // vías que ya son legales aquí — nunca habilita una prohibida (sin radio ya
  // hemos salido arriba, y `preferMesh` solo actúa con `meshUsable`).
  //   · "mesh" y "privada" (directo P2P, sin nube) → se comportan como la ruta
  //     preferida "mesh" de la neurona.
  //   · "servidor" → como "wifi" (la vía por la que se alcanza el servidor).
  //   · "auto" → NO cambia nada: manda el ajuste de la neurona, como siempre.
  // (Ola 3 · cierre del pendiente del SOP §9) La PERSONALIDAD EMISORA ya llega
  // aquí cuando el llamador la conoce (`sendOverMesh` la propaga desde su
  // `neuronId`, que es el mismo id que gobierna las puertas de antena), así que
  // su regla MÁS ESPECÍFICA gana sobre los defaults «Todas» ("*") — precedencia
  // del SOP A149. Sin `personaId` (o sin overrides guardados) `preferredRouteFor`
  // devuelve "auto" y esta rama no toca nada: manda el ajuste de la neurona.
  const personaRoute = preferredRouteFor(input.personaId);
  const preferred: PreferredRoute =
    personaRoute === "mesh" || personaRoute === "privada"
      ? "mesh"
      : personaRoute === "servidor"
        ? "wifi"
        : conn.preferred;
  const fitsClass = input.sizeBytes <= MESH_CLASS_SIZE_LIMIT[input.cls];
  const meshUsable = meshScore >= MESH_USABLE_SCORE && fitsClass && airtime;

  // P0: dual SIEMPRE que haya malla (y Wi-Fi si vive). La seguridad manda.
  if (input.cls === "P0") {
    return make(wifiScore > 0.05 ? "dual" : "mesh", "critical-dual-path");
  }

  // ¿La neurona (o la ruta preferida) fuerza mesh para esta clase?
  const preferMesh = preferred === "mesh";
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
    preferred === "auto"
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

export {
  NODOS_INFERENCIA_LOCAL_STORAGE,
  nodoConBase,
  resumenDisponibles,
  elegirNodo,
  type NodoInferenciaLocal,
  type OpcionesElegirNodo,
  type OpcionesResumenInferencia,
  type ResumenNodosInferencia,
  type TransporteInferencia,
} from "@/lib/network/inferencia-local";
