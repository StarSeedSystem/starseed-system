"use client";

/**
 * StarSeed OS — Red Mesh · SINCRONIZACIÓN MULTIDIMENSIONAL (Adenda 97 · SOP §5).
 * ============================================================================
 * Cola de salida por PRIORIDAD con presupuesto de airtime (token bucket) que
 * respeta el duty cycle de la región. Aquí se FILTRA (whitelist por tipo), se
 * empaqueta (codec), se trocea y se drena hacia el transporte activo.
 *
 *   P0 alert    → reserva propia de airtime: una alerta NUNCA espera por bulk.
 *   P1 message  → primera en la cola general.
 *   P2 state    → deltas de memoria/config.
 *   P3 manifest → solo bajo orden explícita (el router ya lo garantiza).
 *
 * El drenaje es un bucle perezoso (500 ms) que solo trabaja si hay cola Y
 * transporte listo — coste cero en reposo. NUNCA lanza.
 */

import {
  AIRTIME_MS_PER_CHUNK_BY_PRESET,
  AIRTIME_P0_RESERVE_MS,
  MESH_ALERT_EVENT,
} from "./constants";
import { encodeMessage } from "./codec";
import { getMeshState, setMeshState, setQueueCounts } from "./store";
import type {
  AirtimeBudget,
  MeshPayloadType,
  MeshSendOptions,
  MeshTransport,
  SyncItem,
  TrafficClass,
} from "./types";

/* ── Whitelist de campos por tipo (SOP §5.1: jamás viaja un objeto entero) ── */

const FIELD_WHITELIST: Record<MeshPayloadType, readonly string[]> = {
  // oid = id de ORIGEN estable de la alerta (dedupe de relé); ttl = saltos de
  // reemisión restantes (se decrementa en cada relé, se descarta en 0).
  alert: ["k", "geo", "ttl", "txt", "sev", "oid"],
  message: ["to", "txt", "cv"], // destinatario lógico, texto (cifrado E2E), conversación
  presence: ["h", "n", "b"], // handle, nombre corto, batería
  "state-delta": ["ns", "base", "patch"], // namespace, hash base, parche
  manifest: ["h", "dn", "pk", "bd"], // handle, displayName, clave pública, insignias
  "chunk-req": ["mid", "idx"], // msgId + índices que faltan
  // Publicación de contenido: por la MALLA viaja solo el puntero/campos mínimos
  // (el contenido completo va por el feed de servidor); estos son los campos que
  // emiten los emisores (posts de entidad y biblioteca).
  post: ["id", "entity_type", "entity_slug", "body", "media_url", "kind", "name", "category", "folder", "entity"],
};

/** Filtra un body a su whitelist (defensa en profundidad; puro). */
export function filterBody(type: MeshPayloadType, body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object") return out;
  const allowed = FIELD_WHITELIST[type] ?? [];
  for (const k of allowed) {
    const v = (body as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/* ── Token bucket de airtime ───────────────────────────────────────────────── */

let lastRefillAt = 0;
let activePreset = "UNSET";

/** Fija el preset del módem activo (lo informa el adaptador/panel). */
export function setActiveModemPreset(preset: string): void {
  activePreset = (preset || "UNSET").toUpperCase();
}

/** Preset del módem activo (para la UI y la federación). */
export function getActiveModemPreset(): string {
  return activePreset;
}

export function estimateChunkAirtimeMs(): number {
  return AIRTIME_MS_PER_CHUNK_BY_PRESET[activePreset] ?? AIRTIME_MS_PER_CHUNK_BY_PRESET.UNSET;
}

/** Rellena el bucket según el tiempo transcurrido y el duty objetivo. */
function refillBudget(): AirtimeBudget {
  const s = getMeshState();
  const b = { ...s.budget };
  const now = Date.now();
  if (lastRefillAt === 0) lastRefillAt = now;
  const elapsed = now - lastRefillAt;
  lastRefillAt = now;
  // duty % del tiempo real transcurrido se convierte en tokens de airtime.
  const gained = (elapsed * b.targetDutyPct) / 100;
  b.availableMs = Math.min(b.capacityMs, b.availableMs + gained);
  setMeshState({ budget: b });
  return b;
}

/**
 * ¿Hay presupuesto para N trozos de la clase dada?
 * P0 puede usar TODO el saldo (incluida su reserva, que ya está DENTRO de
 * availableMs — no se suma encima); las clases no críticas deben dejar la
 * reserva de P0 intacta. Como `consumeAirtime` permite deuda acotada, un P0
 * con el bucket a cero ESPERA a que se rellene (no transmite ilimitadamente).
 */
export function airtimeAvailableFor(cls: TrafficClass, chunks: number): boolean {
  const b = refillBudget();
  const cost = chunks * estimateChunkAirtimeMs();
  if (cls === "P0") return b.availableMs >= cost;
  // Las clases no críticas dejan intacta la reserva de P0.
  return b.availableMs - b.reservedP0Ms >= cost;
}

function consumeAirtime(ms: number): void {
  const s = getMeshState();
  // Se permite DEUDA acotada (saldo negativo hasta -capacidad): así una ráfaga
  // de P0 con el bucket vacío queda "a deber" y el siguiente envío espera a que
  // el refill reponga tokens, en vez de olvidar el gasto (clamp a 0). Respeta
  // el duty cycle legal incluso para alertas.
  const next = Math.max(-s.budget.capacityMs, s.budget.availableMs - ms);
  const b = { ...s.budget, availableMs: next };
  setMeshState({ budget: b });
}

/* ── Cola por prioridad ────────────────────────────────────────────────────── */

const CLASS_ORDER: TrafficClass[] = ["P0", "P1", "P2", "P3"];
const queues: Record<TrafficClass, SyncItem[]> = { P0: [], P1: [], P2: [], P3: [] };
let drainTimer: ReturnType<typeof setInterval> | null = null;
let transportRef: (() => MeshTransport | null) | null = null;
let seq = 0;
/**
 * CERROJO de re-entrada del drenaje (Adenda 97 · fix crítico): sin esto, el
 * setInterval de 500 ms lanzaba un pase nuevo mientras el anterior dormía sus
 * 400 ms entre trozos → N mensajes al aire a la vez, se anulaba el espaciado de
 * cortesía y el presupuesto de airtime se validaba contra un saldo obsoleto.
 * Con el cerrojo SOLO hay un pase activo: eso además cierra la ventana
 * peek→shift (ningún otro pase puede tomar el mismo item durante el await).
 */
let draining = false;

/** Tope de mensajes en cola POR CLASE: descarta el más viejo (no P0) si se colma. */
const QUEUE_CAP_BY_CLASS: Record<TrafficClass, number> = { P0: 64, P1: 128, P2: 128, P3: 64 };

function publishCounts(): void {
  const byClass = {
    P0: queues.P0.length,
    P1: queues.P1.length,
    P2: queues.P2.length,
    P3: queues.P3.length,
  };
  setQueueCounts(byClass.P0 + byClass.P1 + byClass.P2 + byClass.P3, byClass);
}

/** Registra cómo obtener el transporte activo (lo llama index.ts). */
export function bindSyncTransport(getter: () => MeshTransport | null): void {
  transportRef = getter;
  if (!drainTimer && typeof window !== "undefined") {
    drainTimer = setInterval(() => void drainOnce(), 500);
  }
}

export function unbindSyncTransport(): void {
  transportRef = null;
  if (drainTimer) clearInterval(drainTimer);
  drainTimer = null;
}

/** Encola un elemento (ya decidido por el router hacia mesh). Nunca lanza. */
export function enqueueMeshSync(
  item: Omit<SyncItem, "id" | "createdAt" | "attempts"> & { id?: string },
): void {
  try {
    const it: SyncItem = {
      id: item.id || `ms-${Date.now().toString(36)}-${(seq++).toString(36)}`,
      type: item.type,
      cls: item.cls,
      body: filterBody(item.type, item.body),
      dest: item.dest,
      wantAck: item.cls === "P0" ? true : item.wantAck,
      neuronId: item.neuronId,
      createdAt: Date.now(),
      attempts: 0,
    };
    queues[it.cls].push(it);
    // Tope por clase: si se colma, descarta el MÁS VIEJO (nunca supera el cap).
    const cap = QUEUE_CAP_BY_CLASS[it.cls];
    if (queues[it.cls].length > cap) {
      queues[it.cls].splice(0, queues[it.cls].length - cap);
      setMeshState({ lastError: `cola ${it.cls} llena: se descartaron envíos antiguos` });
    }
    // Prioridad de neurona: "high" adelanta dentro de su clase.
    publishCounts();
  } catch {
    /* */
  }
}

/** Un pase de drenaje: envía COMO MUCHO un mensaje (todos sus trozos). */
async function drainOnce(): Promise<void> {
  if (draining) return; // cerrojo de re-entrada (ver arriba)
  draining = true;
  try {
    const transport = transportRef?.() ?? null;
    if (!transport) return;
    const s = getMeshState();
    if (s.status !== "ready" && s.status !== "degraded") return;

    let cls: TrafficClass | undefined;
    for (const c of CLASS_ORDER) {
      if (queues[c].length) {
        cls = c;
        break;
      }
    }
    if (!cls) return;
    const item = queues[cls][0];
    if (!item) return;

    const encoded = await encodeMessage(item.body, {
      cls: item.cls,
      type: item.type,
      ackReq: !!item.wantAck,
    });
    // El cerrojo garantiza que nadie más tocó la cola durante el await, pero
    // comprobamos igual que el item sigue a la cabeza (defensa en profundidad).
    if (queues[cls][0] !== item) return;
    if (!encoded) {
      // No cabe ni comprimido → descartar con honestidad (queda en el historial).
      queues[cls].shift();
      publishCounts();
      setMeshState({ lastError: `payload ${item.type} demasiado grande para la malla` });
      return;
    }
    if (!airtimeAvailableFor(item.cls, encoded.frames.length)) return; // esperar tokens

    queues[cls].shift();
    publishCounts();

    const sendOpts: MeshSendOptions = {
      dest: item.dest,
      wantAck: !!item.wantAck && item.dest !== undefined,
    };
    let sentChunks = 0;
    for (const frame of encoded.frames) {
      const receipt = await transport.send(frame, sendOpts);
      if (receipt.ok) {
        sentChunks += 1;
        consumeAirtime(estimateChunkAirtimeMs());
        // Espaciar trozos: cortesía con la malla (CSMA ya lo hace, doblamos).
        if (encoded.frames.length > 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      } else {
        // Fallo de TX: reintentar el mensaje entero más tarde (máx. 3 veces).
        item.attempts += 1;
        if (item.attempts < 3) queues[item.cls].push(item);
        else setMeshState({ lastError: `TX fallida (${item.type}): ${receipt.error ?? "?"}` });
        publishCounts();
        return;
      }
    }
    if (sentChunks > 0) publishCounts();
  } catch {
    /* el drenaje nunca revienta */
  } finally {
    draining = false; // liberar el cerrojo pase lo que pase
  }
}

/* ── Recepción: entregar payloads reensamblados a sus dimensiones ──────────── */

/**
 * Entrega un mensaje reensamblado (lo llama index.ts). Alertas → evento DOM
 * global (voz/notificaciones lo escuchan según las reglas de cada neurona).
 */
export function deliverInbound(msg: {
  type: MeshPayloadType;
  cls: TrafficClass;
  body: unknown;
  from: number;
  /** Firma pública verificada (Adenda 106). */
  verified?: boolean;
  /** Fingerprint de la identidad firmante (Adenda 107). */
  signerFp?: string;
}): void {
  try {
    if (typeof window === "undefined") return;
    if (msg.type === "alert") {
      window.dispatchEvent(new CustomEvent(MESH_ALERT_EVENT, { detail: { ...msg, at: Date.now() } }));
    }
    // Mensajería/estado: evento genérico; los consumidores (chat, memoria)
    // se suscriben sin acoplar este módulo a sus stores.
    window.dispatchEvent(
      new CustomEvent("starseed:mesh-inbound", { detail: { ...msg, at: Date.now() } }),
    );
  } catch {
    /* */
  }
}

/** Solo pruebas/panel: instantánea de la cola. */
export function peekQueues(): Record<TrafficClass, number> {
  return {
    P0: queues.P0.length,
    P1: queues.P1.length,
    P2: queues.P2.length,
    P3: queues.P3.length,
  };
}
