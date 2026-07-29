"use client";

/**
 * StarSeed OS — RED SINÁPTICA · ENTREGA CON FAILOVER Y RECIBOS (Adenda 99).
 * ============================================================================
 * Ejecuta un `TransmitPlan` (del enrutador sináptico) por sus VÍAS reales, con
 * FAILOVER: si la primaria falla, prueba las alternativas en orden hasta que
 * una entregue. En modo `dual` (alertas P0) emite por dos vías a la vez para
 * redundancia. Produce un RECIBO con la traza — a través de QUÉ nodos y/o
 * servidores viajó, con estado y marca de tiempo — que alimenta los INDICADORES
 * de la UI ("¿se transmitió?, ¿por dónde?"), justo lo que pidió Alex.
 *
 * DISEÑO: el orquestador es PURO y testeable — las vías concretas (malla,
 * servidor) se INYECTAN como `DeliveryPorts`. El cableado real vive en index.ts
 * (malla → cola de sync; servidor → server-relay). Así se puede probar el
 * failover sin red ni DOM. NUNCA lanza: un recibo siempre sale.
 */

import { planTransmission, label } from "./synaptic-router";
import type {
  TransmitPlan,
  TransmitLeg,
  TransmitRequest,
  TransmitScope,
  TransmitVia,
  NetworkContext,
} from "./synaptic-router";
import type { TrafficClass } from "./types";

/* ── Recibo de entrega ─────────────────────────────────────────────────────── */

export type HopStatus = "confirmed" | "sent" | "failed" | "skipped" | "queued";

/** Un paso ejecutado del plan (vía + resultado + a través de qué). */
export interface DeliveryHop {
  via: TransmitVia;
  label: string;
  role: "primary" | "fallback" | "dual";
  status: HopStatus;
  /** Detalle honesto para la UI. */
  detail: string;
  /** A TRAVÉS de qué viajó: nodo(s) de la malla o fila del servidor. */
  through?: string;
  at: number;
}

/**
 * Estado de una entrega — HONESTO sobre el grado de certeza:
 *   · delivered = una vía CONFIRMÓ (fila creada en servidor público, o ACK).
 *   · sent      = llegó a un transporte (encolado a la malla / subido al relé)
 *                 pero aún SIN confirmación de recepción — se transmitió, no
 *                 se garantiza la recogida. (La malla es best-effort; el relé
 *                 espera a que el destinatario lo extraiga.)
 *   · partial   = modo dual con redundancia degradada (una vía cayó).
 *   · queued    = ninguna vía viva ahora; en cola para reintento.
 *   · failed    = había transporte pero todas las vías fallaron.
 */
export type DeliveryStatus = "delivered" | "sent" | "partial" | "queued" | "failed";

export interface DeliveryReceipt {
  id: string;
  scope: TransmitScope;
  cls: TrafficClass;
  summary: string;
  hops: DeliveryHop[];
  status: DeliveryStatus;
  startedAt: number;
  endedAt: number;
}

/** Resultado que devuelve una vía concreta al ejecutarse. */
export interface HopOutcome {
  /** ¿Alcanzó un transporte (encolado a la malla / subido al servidor)? */
  ok: boolean;
  /** Confirmación FUERTE (fila de servidor creada / ACK de malla). */
  confirmed?: boolean;
  /** A través de qué (nodo/servidor) — para la traza del recibo. */
  through?: string;
  detail: string;
}

/** Vías concretas inyectadas (las cablea index.ts con la malla y el servidor). */
export interface DeliveryPorts {
  mesh: (leg: TransmitLeg, req: TransmitRequest, payload: unknown) => Promise<HopOutcome>;
  server: (leg: TransmitLeg, req: TransmitRequest, payload: unknown) => Promise<HopOutcome>;
}

/* ── Historial de recibos + notificación a la UI ───────────────────────────── */

export const MESH_DELIVERY_EVENT = "starseed:mesh-delivery";
const DELIVERY_HISTORY_LIMIT = 40;
/**
 * `recent` se REEMPLAZA en cada cambio (no se muta in situ): así su referencia
 * cambia solo cuando el contenido cambia — contrato de `useSyncExternalStore`
 * (getSnapshot debe devolver la MISMA referencia entre cambios). getRecent…
 * devuelve esa referencia estable directamente (los hooks la comparan por ===).
 */
let recent: DeliveryReceipt[] = [];
type DeliveryListener = (receipts: DeliveryReceipt[]) => void;
const listeners = new Set<DeliveryListener>();

function recordReceipt(r: DeliveryReceipt): void {
  recent = [r, ...recent].slice(0, DELIVERY_HISTORY_LIMIT);
  for (const l of listeners) {
    try {
      l(recent);
    } catch {
      /* un listener roto no tumba al resto */
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(MESH_DELIVERY_EVENT, { detail: { at: r.endedAt } }));
    } catch {
      /* */
    }
  }
}

/** Últimos recibos de entrega (referencia ESTABLE para los indicadores/hook). */
export function getRecentDeliveries(): DeliveryReceipt[] {
  return recent;
}

/** Suscripción a los recibos (devuelve unsubscribe). */
export function subscribeDeliveries(cb: DeliveryListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Solo pruebas: vacía el historial. */
export function _resetDeliveries(): void {
  recent = [];
}

/* ── El orquestador ────────────────────────────────────────────────────────── */

let deliverySeq = 0;
function receiptId(): string {
  return `dlv-${Date.now().toString(36)}-${(deliverySeq++).toString(36)}`;
}

function portFor(via: TransmitVia, ports: DeliveryPorts) {
  return via === "server-public" || via === "server-relay" ? ports.server : ports.mesh;
}

/**
 * Ejecuta un plan ya calculado. PURO respecto a la red (usa los ports). Registra
 * el recibo y lo emite. Nunca lanza.
 */
export async function executePlan(
  plan: TransmitPlan,
  req: TransmitRequest,
  payload: unknown,
  ports: DeliveryPorts,
): Promise<DeliveryReceipt> {
  const startedAt = Date.now();
  const hops: DeliveryHop[] = [];

  const runLeg = async (
    leg: TransmitLeg,
    role: DeliveryHop["role"],
  ): Promise<HopOutcome> => {
    let out: HopOutcome;
    try {
      out = await portFor(leg.via, ports)(leg, req, payload);
    } catch {
      out = { ok: false, detail: "excepción en la vía" };
    }
    hops.push({
      via: leg.via,
      label: label(leg.via),
      role,
      status: out.ok ? (out.confirmed ? "confirmed" : "sent") : "failed",
      detail: out.detail,
      through: out.through,
      at: Date.now(),
    });
    return out;
  };

  let anyOk = false;
  let anyConfirmed = false;
  let anyFail = false;

  if (plan.queuedOnly) {
    // Sin vías vivas: se intenta igualmente (por si acaba de volver una); si no,
    // queda como "en cola" para reintento del subsistema.
    const out = await runLeg(plan.primary, "primary");
    if (out.ok) {
      anyOk = true;
      anyConfirmed = !!out.confirmed;
    } else {
      // Reetiquetar el último hop como "en cola" (no es un fallo, es espera).
      const last = hops[hops.length - 1];
      if (last) {
        last.status = "queued";
        last.detail = "sin vías activas: en cola, se reintenta al recuperar red";
      }
    }
  } else if (plan.dual) {
    // Redundancia: primaria + primera alternativa A LA VEZ.
    const legs: TransmitLeg[] = [plan.primary];
    if (plan.fallbacks[0]) legs.push(plan.fallbacks[0]);
    const outs = await Promise.all(legs.map((l) => runLeg(l, "dual")));
    for (const o of outs) {
      anyOk = anyOk || o.ok;
      anyConfirmed = anyConfirmed || !!o.confirmed;
      anyFail = anyFail || !o.ok;
    }
    const rest = plan.fallbacks.slice(1);
    if (!anyOk && rest.length) {
      // Ambas vías redundantes cayeron → failover secuencial por el resto
      // (robustez: nunca dejamos alternativas viables sin intentar).
      for (let i = 0; i < rest.length; i++) {
        const o = await runLeg(rest[i], "fallback");
        if (o.ok) {
          anyOk = true;
          anyConfirmed = anyConfirmed || !!o.confirmed;
          for (const fb of rest.slice(i + 1)) {
            hops.push({ via: fb.via, label: label(fb.via), role: "fallback", status: "skipped", detail: "respaldo no necesario: una alternativa entregó", at: Date.now() });
          }
          break;
        }
      }
    } else {
      // Alternativas restantes: no hacían falta (ya se emitió por dos vías).
      for (const fb of rest) {
        hops.push({ via: fb.via, label: label(fb.via), role: "fallback", status: "skipped", detail: "no necesaria: envío redundante ya emitido", at: Date.now() });
      }
    }
  } else {
    // Failover secuencial: primaria y, si falla, alternativas hasta que una entregue.
    const primary = await runLeg(plan.primary, "primary");
    anyOk = primary.ok;
    anyConfirmed = !!primary.confirmed;
    if (primary.ok) {
      // Primaria entregó → las alternativas son respaldo no usado.
      for (const fb of plan.fallbacks) {
        hops.push({
          via: fb.via,
          label: label(fb.via),
          role: "fallback",
          status: "skipped",
          detail: "respaldo no necesario: la vía primaria entregó",
          at: Date.now(),
        });
      }
    } else {
      anyFail = true;
      // Recorrer alternativas hasta la primera que entregue.
      let rescued = false;
      for (let i = 0; i < plan.fallbacks.length; i++) {
        const o = await runLeg(plan.fallbacks[i], "fallback");
        if (o.ok) {
          anyOk = true;
          anyConfirmed = anyConfirmed || !!o.confirmed;
          rescued = true;
          // El resto no hace falta.
          for (const fb of plan.fallbacks.slice(i + 1)) {
            hops.push({
              via: fb.via,
              label: label(fb.via),
              role: "fallback",
              status: "skipped",
              detail: "respaldo no necesario: una alternativa entregó",
              at: Date.now(),
            });
          }
          break;
        }
      }
      if (!rescued) anyOk = false;
    }
  }

  let status: DeliveryStatus;
  if (plan.queuedOnly && !anyOk) status = "queued";
  // 'partial': redundancia degradada en modo dual (queríamos 2 vías y una cayó).
  else if (anyOk && plan.dual && anyFail) status = "partial";
  // 'delivered' SOLO con confirmación fuerte (fila de servidor público / ACK).
  else if (anyConfirmed) status = "delivered";
  // 'sent': llegó a un transporte pero sin confirmación (malla encolada, relé
  // subido). Honesto: se transmitió, no está garantizada la recepción.
  else if (anyOk) status = "sent";
  else status = "failed";

  const receipt: DeliveryReceipt = {
    id: receiptId(),
    scope: req.scope,
    cls: req.cls,
    summary: plan.summary,
    hops,
    status,
    startedAt,
    endedAt: Date.now(),
  };
  recordReceipt(receipt);
  return receipt;
}

/**
 * deliver — calcula el plan y lo ejecuta. Punto de entrada de alto nivel. Nunca
 * lanza; siempre devuelve un recibo (con la traza para los indicadores).
 */
export async function deliver(
  req: TransmitRequest,
  payload: unknown,
  ctx: NetworkContext,
  ports: DeliveryPorts,
): Promise<DeliveryReceipt> {
  const plan = planTransmission(req, ctx);
  return executePlan(plan, req, payload, ports);
}
