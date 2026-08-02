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
  pullPublicExtra,
  pullRelayExtra,
  subscribeRelayRealtime,
  subscribeEndpointStream,
  registerIdentity,
  refreshIdentities,
  refreshRevocations,
  isRevoked,
  type RelayBeacon,
  type RelayInboundItem,
} from "./server-relay";
// CRL de certificados de dispositivo (Adenda 128): conjunto verificado de certs revocados.
import { refreshDeviceCertRevocations } from "./device-revocation";
import { masterFingerprint } from "./master-identity";

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
/** Desuscripción del realtime (entrega instantánea). */
let realtimeOff: (() => void) | null = null;
/** Desuscripción del realtime SSE del servidor propio. */
let streamOff: (() => void) | null = null;
/** Marca de agua de la bandeja: solo entregamos lo posterior a esto. */
let inboxWatermark = 0;
/**
 * Cursor keyset COMPUESTO del feed público de Supabase (Adenda 128): par
 * (at, id) que avanza por `id` DENTRO de un empate de created_at. Sustituye al
 * watermark numérico anterior, que se ATASCABA si ≥100 filas compartían el mismo
 * created_at (insert masivo → `now()` idéntico) — DoS de descubrimiento de TODA
 * la red. `pullPublicFeed` devuelve el `next` EXPLÍCITO (incluye las filas
 * propias drenadas, que no vienen en `items`) y aquí se persiste tal cual.
 */
let publicCursor: { atIso: string; id: string } = { atIso: "", id: "" };
/**
 * Marca de agua SEPARADA del feed público de un SERVIDOR PROPIO por HTTP
 * (`pullPublicExtra`, protocolo numérico `?since=<ms>`). Se mantiene APARTE del
 * cursor keyset de Supabase: mezclar el reloj del servidor HTTP con el par
 * (at, id) de Supabase corrompería la frontera keyset (ids de tablas distintas).
 */
let publicExtraWatermark = 0;
/**
 * IDs de relés YA entregados. Necesario porque la consulta filtra con `>=`
 * (created_at inclusivo): la fila que fija la marca de agua reaparece en el
 * siguiente sondeo. Sin este dedup se reentregaría cada 30 s (alertas repetidas,
 * mensajes duplicados). Acotado para no crecer sin límite.
 */
const deliveredRelayIds = new Set<string>();
// ≥ replay-guard MAX_NONCES (Adenda 119): el dedup por id debe durar MÁS que la
// memoria de nonces, para que una re-entrega LEGÍTIMA del mismo item (realtime +
// sondeo) se descarte por id ANTES de que su nonce repetido la marque no-verificada.
const MAX_DELIVERED_IDS = 5000;
function rememberDelivered(id: string): void {
  deliveredRelayIds.add(id);
  if (deliveredRelayIds.size > MAX_DELIVERED_IDS) {
    const first = deliveredRelayIds.values().next().value;
    if (first) deliveredRelayIds.delete(first);
  }
}

/**
 * Avanza un cursor keyset compuesto (at, id) de forma MONOTÓNICA: solo adelanta si
 * el par entrante es estrictamente mayor por (at, y a igualdad de at, por id).
 * Espeja la comparación fila-valor `(created_at, id) >` del RPC `mesh_public_feed`,
 * para que el realtime y el sondeo compartan la MISMA frontera y el descubrimiento
 * nunca retroceda ante empates de created_at. No muta: devuelve el par a conservar.
 */
function advanceCursor(cur: { atIso: string; id: string }, next: { atIso: string; id: string }): { atIso: string; id: string } {
  // Compara por ms parseado (el realtime solo trae `at` en ms → su atIso es de
  // precisión ms; su avance es best-effort y, a lo sumo, provoca re-lecturas
  // deduplicadas en el próximo sondeo, nunca saltos). La precisión de µs la conserva
  // el cursor del SONDEO (pullPublicFeed.next.atIso), que es quien cierra el DoS.
  const ca = Date.parse(cur.atIso) || 0;
  const na = Date.parse(next.atIso) || 0;
  if (na > ca || (na === ca && next.id > cur.id)) return next;
  return cur;
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
    // Bandeja de relé StarSeed + buzón dirigido del servidor propio activo.
    const [base, extra] = await Promise.all([
      pullRelayInbox(inboxWatermark),
      pullRelayExtra(inboxWatermark),
    ]);
    const items = [...base, ...extra];
    if (!items.length) return;
    // Avanzar la marca de agua al más reciente (acota la ventana de consulta).
    for (const it of items) inboxWatermark = Math.max(inboxWatermark, it.at);
    // Entregar del más viejo al más nuevo (orden causal aproximado), SALTANDO lo
    // ya entregado (la consulta usa `>=`, así que el borde reaparece cada sondeo).
    for (const it of items.slice().reverse()) {
      if (it.locked) continue; // cifrado sin clave: no se puede entregar
      if (isRevoked(it.signerFp)) continue; // identidad revocada: se descarta
      if (it.id && deliveredRelayIds.has(it.id)) continue; // ya entregado
      if (it.id) rememberDelivered(it.id);
      deliverInbound({ type: it.ptype, cls: it.cls, body: it.body, from: 0, verified: it.verified, signerFp: it.signerFp });
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
    // Feed público del servidor StarSeed (cursor keyset compuesto) + del servidor
    // propio activo por HTTP (watermark numérico SEPARADO), en paralelo.
    const [base, extra] = await Promise.all([
      pullPublicFeed(publicCursor),
      pullPublicExtra(publicExtraWatermark),
    ]);
    // Avanza SIEMPRE el cursor keyset al `next` EXPLÍCITO (incluye las filas propias
    // drenadas): hacerlo ANTES de cualquier salida temprana evita que ≥FEED_PAGE
    // filas propias con el mismo created_at —ausentes de `items`— reintroduzcan el
    // atasco del DoS de descubrimiento.
    publicCursor = base.next;
    // Avanza el watermark HTTP por el `at` máximo del extra (protocolo numérico).
    for (const it of extra) publicExtraWatermark = Math.max(publicExtraWatermark, it.at);
    const items = [...base.items, ...extra];
    if (!items.length) return;
    for (const it of items.slice().sort((a, b) => a.at - b.at)) {
      if (isRevoked(it.signerFp)) continue; // identidad revocada: se descarta
      if (it.id && deliveredRelayIds.has(it.id)) continue; // ya entregado
      if (it.id) rememberDelivered(it.id);
      deliverInbound({ type: it.ptype, cls: it.cls, body: it.body, from: 0, verified: it.verified, signerFp: it.signerFp });
    }
  } catch {
    /* */
  }
}

/** Arranca el descubrimiento + la bandeja de relé + el feed público (idempotente). */
/**
 * Refresca el conjunto de CERTS de dispositivo revocados contra el ancla maestra
 * PROPIA (todas las neuronas de la cuenta comparten la misma maestra). `masterFingerprint`
 * es asíncrona, de ahí el envoltorio. Tolerante a fallos (no vacía el set si falla la lectura).
 */
function refreshDeviceCertCRL(): void {
  void masterFingerprint().then((mfp) => {
    if (mfp) return refreshDeviceCertRevocations(mfp);
  });
}

export function startSynapticLayer(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  // Al arrancar solo recogemos lo MUY reciente (no un histórico). El cursor keyset
  // parte del par (hace 5 min, id vacío): `id` vacío → pullPublicFeed usa el uuid
  // cero, que incluye todas las filas de ese instante inicial.
  inboxWatermark = Date.now() - 5 * 60_000;
  publicCursor = { atIso: new Date(Date.now() - 5 * 60_000).toISOString(), id: "" };
  publicExtraWatermark = Date.now() - 5 * 60_000;
  void refreshBeacons(); // radar inmediato
  void emitBeacon(); // anunciarme ya
  void registerIdentity(); // publica mi reclamación firmada identidad↔cuenta
  void refreshIdentities(); // mapa verificado fp→cuenta
  void refreshRevocations(); // conjunto verificado de identidades revocadas
  refreshDeviceCertCRL(); // conjunto verificado de CERTS de dispositivo revocados
  emitTimer = setInterval(() => void emitBeacon(), BEACON_EMIT_MS);
  pullTimer = setInterval(() => void refreshBeacons(), BEACON_PULL_MS);
  inboxTimer = setInterval(() => void pollInbox(), INBOX_POLL_MS);
  publicTimer = setInterval(() => {
    void pollPublicFeed();
    void refreshIdentities();
    void refreshRevocations();
    refreshDeviceCertCRL();
  }, INBOX_POLL_MS);
  // Entrega INSTANTÁNEA por realtime (además del sondeo, que sigue de respaldo).
  const onLiveItem = (it: RelayInboundItem) => {
    if (isRevoked(it.signerFp)) return; // identidad revocada: se descarta
    if (it.id && deliveredRelayIds.has(it.id)) return;
    if (it.id) rememberDelivered(it.id);
    // Avanza el cursor keyset por comparación COMPUESTA (at, id): igual que el RPC,
    // así el realtime y el sondeo comparten frontera y no retroceden entre ellos.
    publicCursor = advanceCursor(publicCursor, { atIso: new Date(it.at).toISOString(), id: it.id || "" });
    inboxWatermark = Math.max(inboxWatermark, it.at);
    deliverInbound({ type: it.ptype, cls: it.cls, body: it.body, from: 0, verified: it.verified, signerFp: it.signerFp });
  };
  realtimeOff = subscribeRelayRealtime({ onContent: onLiveItem, onBeacon: () => void refreshBeacons() });
  // Realtime SSE del servidor propio activo (si lo hay).
  streamOff = subscribeEndpointStream(onLiveItem);
}

/** Detiene la capa y retira el faro de esta neurona. */
export function stopSynapticLayer(): void {
  started = false;
  if (emitTimer) clearInterval(emitTimer);
  if (pullTimer) clearInterval(pullTimer);
  if (inboxTimer) clearInterval(inboxTimer);
  if (publicTimer) clearInterval(publicTimer);
  emitTimer = pullTimer = inboxTimer = publicTimer = null;
  if (realtimeOff) realtimeOff();
  if (streamOff) streamOff();
  realtimeOff = streamOff = null;
  void purgeBeacon();
}

/** Fuerza un refresco inmediato del radar (p. ej. al abrir el widget). */
export function refreshNearbyNow(): void {
  void refreshBeacons();
}
