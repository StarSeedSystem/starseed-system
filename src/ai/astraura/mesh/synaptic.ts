"use client";

/**
 * StarSeed OS — RED SINÁPTICA · COORDINADOR (Adenda 99).
 * ============================================================================
 * La capa que hace VIVA la red sináptica sobre el servidor:
 *
 *   · AUTO-DESCUBRIMIENTO: emite un FARO periódico (esta neurona está en línea)
 *     y sondea los faros de las demás → RADAR de conexiones cercanas. Así una
 *     neurona detecta a otras que corren el sistema mesh P2P de StarSeed, desde
 *     cualquier dispositivo, sin configurar nada.
 *   · BANDEJA DE RELÉ: sondea el puente cifrado por si hay datos privados a
 *     larga distancia dirigidos a esta cuenta/neurona y los ENTREGA (descifrados)
 *     a las dimensiones (memoria, chat…), reutilizando `deliverInbound`.
 *
 * Idempotente y best-effort: sin sesión/red no hace nada y la malla local sigue
 * igual (coste ~0 en reposo). NUNCA lanza.
 */

import { deliverInbound } from "./sync";
import {
  emitBeacon,
  purgeBeacon,
  pullBeacons,
  pullRelayInbox,
  pullPublicFeed,
  type RelayBeacon,
} from "./server-relay";

/** Cadencias (ms). El faro se refresca antes de caducar (BEACON_TTL 5 min). */
const BEACON_EMIT_MS = 40_000;
const BEACON_PULL_MS = 30_000;
const INBOX_POLL_MS = 30_000;

/** Evento DOM al actualizar el radar (superficies sueltas). */
export const MESH_NEARBY_EVENT = "starseed:mesh-nearby";

let nearby: RelayBeacon[] = [];
type NearbyListener = (beacons: RelayBeacon[]) => void;
const listeners = new Set<NearbyListener>();

let started = false;
let emitTimer: ReturnType<typeof setInterval> | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;
let inboxTimer: ReturnType<typeof setInterval> | null = null;
let publicTimer: ReturnType<typeof setInterval> | null = null;
/** Marca de agua de la bandeja: solo entregamos lo posterior a esto. */
let inboxWatermark = 0;
/** Marca de agua del feed público (contenido de otras neuronas). */
let publicWatermark = 0;
/**
 * IDs de relés YA entregados. Necesario porque la consulta filtra con `>=`
 * (created_at inclusivo): la fila que fija la marca de agua reaparece en el
 * siguiente sondeo. Sin este dedup se reentregaría cada 30 s (alertas repetidas,
 * mensajes duplicados). Acotado para no crecer sin límite.
 */
const deliveredRelayIds = new Set<string>();
const MAX_DELIVERED_IDS = 500;
function rememberDelivered(id: string): void {
  deliveredRelayIds.add(id);
  if (deliveredRelayIds.size > MAX_DELIVERED_IDS) {
    const first = deliveredRelayIds.values().next().value;
    if (first) deliveredRelayIds.delete(first);
  }
}

/** Neuronas cercanas detectadas por faro (copia; para uso imperativo). */
export function getNearbyBeacons(): RelayBeacon[] {
  return nearby.slice();
}

/**
 * Referencia ESTABLE del radar (cambia solo cuando `nearby` se reemplaza en un
 * refresco): contrato de `useSyncExternalStore`. NO devolver copias aquí.
 */
export function getNearbySnapshot(): RelayBeacon[] {
  return nearby;
}

/** Suscripción al radar de cercanas (devuelve unsubscribe). */
export function subscribeNearby(cb: NearbyListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function publishNearby(): void {
  const snapshot = nearby.slice();
  for (const l of listeners) {
    try {
      l(snapshot);
    } catch {
      /* */
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(MESH_NEARBY_EVENT, { detail: { count: nearby.length } }));
    } catch {
      /* */
    }
  }
}

async function refreshBeacons(): Promise<void> {
  try {
    nearby = await pullBeacons();
    publishNearby();
  } catch {
    /* */
  }
}

async function pollInbox(): Promise<void> {
  try {
    const items = await pullRelayInbox(inboxWatermark);
    if (!items.length) return;
    // Avanzar la marca de agua al más reciente (acota la ventana de consulta).
    for (const it of items) inboxWatermark = Math.max(inboxWatermark, it.at);
    // Entregar del más viejo al más nuevo (orden causal aproximado), SALTANDO lo
    // ya entregado (la consulta usa `>=`, así que el borde reaparece cada sondeo).
    for (const it of items.slice().reverse()) {
      if (it.locked) continue; // cifrado sin clave: no se puede entregar
      if (it.id && deliveredRelayIds.has(it.id)) continue; // ya entregado
      if (it.id) rememberDelivered(it.id);
      deliverInbound({ type: it.ptype, cls: it.cls, body: it.body, from: 0 });
    }
  } catch {
    /* */
  }
}

/**
 * Sondeo del FEED PÚBLICO: recoge el contenido publicado por OTRAS neuronas y lo
 * entrega igual que la bandeja privada (evento `mesh-inbound`). Cierra el bucle
 * publicar→almacenar→recibir. Mismo dedup por id que la bandeja de relé.
 */
async function pollPublicFeed(): Promise<void> {
  try {
    const items = await pullPublicFeed(publicWatermark);
    if (!items.length) return;
    for (const it of items) publicWatermark = Math.max(publicWatermark, it.at);
    for (const it of items.slice().reverse()) {
      if (it.id && deliveredRelayIds.has(it.id)) continue; // ya entregado
      if (it.id) rememberDelivered(it.id);
      deliverInbound({ type: it.ptype, cls: it.cls, body: it.body, from: 0 });
    }
  } catch {
    /* */
  }
}

/** Arranca el descubrimiento + la bandeja de relé + el feed público (idempotente). */
export function startSynapticLayer(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  // Al arrancar solo recogemos lo MUY reciente (no un histórico).
  inboxWatermark = Date.now() - 5 * 60_000;
  publicWatermark = Date.now() - 5 * 60_000;
  void refreshBeacons(); // radar inmediato
  void emitBeacon(); // anunciarme ya
  emitTimer = setInterval(() => void emitBeacon(), BEACON_EMIT_MS);
  pullTimer = setInterval(() => void refreshBeacons(), BEACON_PULL_MS);
  inboxTimer = setInterval(() => void pollInbox(), INBOX_POLL_MS);
  publicTimer = setInterval(() => void pollPublicFeed(), INBOX_POLL_MS);
}

/** Detiene la capa y retira el faro de esta neurona. */
export function stopSynapticLayer(): void {
  started = false;
  if (emitTimer) clearInterval(emitTimer);
  if (pullTimer) clearInterval(pullTimer);
  if (inboxTimer) clearInterval(inboxTimer);
  if (publicTimer) clearInterval(publicTimer);
  emitTimer = pullTimer = inboxTimer = publicTimer = null;
  void purgeBeacon();
}

/** Fuerza un refresco inmediato del radar (p. ej. al abrir el widget). */
export function refreshNearbyNow(): void {
  void refreshBeacons();
}
