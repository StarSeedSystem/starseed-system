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
  emitBeaconDetallado,
  purgeBeacon,
  pullBeaconsDetallado,
  pullRelayInbox,
  pullPublicFeed,
  pullPublicExtra,
  pullRelayExtra,
  subscribeEndpointStream,
  registerIdentity,
  refreshIdentities,
  refreshRevocations,
  isRevoked,
  EVENTO_DESPERTAR_RELE,
  type RelayBeacon,
  type RelayInboundItem,
} from "./server-relay";
// CRL de certificados de dispositivo (Adenda 128): conjunto verificado de certs revocados.
import { refreshDeviceCertRevocations } from "./device-revocation";
import { masterFingerprint } from "./master-identity";
// Contrato «consumo» (2026-09-29): bucles con líder, visibilidad, freno y parada ante 400/404.
import { crearBucle, MINUTO_MS, type BucleFondo, type FalloConsulta } from "@/lib/network/bucle-fondo";
import { esLider, alCambiarLider } from "@/lib/consumo/lider-pestana";
import { frenoActivo } from "@/lib/consumo/freno";

/**
 * Cadencias (2026-09-29 · contrato «consumo»). Antes: faro 40 s, radar 30 s, bandeja 30 s y
 * feed + identidades + revocaciones + CRL cada 30 s, en CADA pestaña y con la pestaña oculta
 * (≈ 1.000 peticiones/h a `os_mesh_relay` por pestaña + un `getUser()` en cada una). Ahora
 * solo la pestaña líder, nunca con el dispositivo oculto:
 */
/** Faro propio + radar de faros ajenos, en la MISMA vuelta (el faro vive 35 min). */
export const FAROS_CADA_MS = 20 * MINUTO_MS;
/** Bandeja de relé con el dispositivo a la vista; el broadcast de cuenta la despierta antes. */
export const BANDEJA_CADA_MS = 5 * MINUTO_MS;
/** Bandeja tras varias vueltas vacías seguidas (vuelve a 5 min en cuanto llega algo). */
export const BANDEJA_EN_CALMA_MS = 15 * MINUTO_MS;
const VACIAS_PARA_CALMA = 3;
/** Feed público de otras neuronas. */
export const FEED_PUBLICO_CADA_MS = 15 * MINUTO_MS;
/** Actas de revocación de identidades (seguridad: más a menudo que el registro). */
export const REVOCACIONES_CADA_MS = 30 * MINUTO_MS;
/** Registro de identidades (drenado completo) + CRL de certificados de dispositivo. */
export const IDENTIDADES_CADA_MS = 60 * MINUTO_MS;
/** `refreshNearbyNow()` (al abrir un widget) no relee el radar más de una vez cada 2 min. */
const RADAR_MANUAL_MIN_MS = 2 * MINUTO_MS;

/** Evento DOM al actualizar el radar (superficies sueltas). */
export const MESH_NEARBY_EVENT = "starseed:mesh-nearby";

let nearby: RelayBeacon[] = [];
type NearbyListener = (beacons: RelayBeacon[]) => void;
const listeners = new Set<NearbyListener>();

let started = false;
let buclesSinapticos: BucleFondo[] = [];
let bucleFaros: BucleFondo | null = null;
let bucleBandeja: BucleFondo | null = null;
/** Vueltas seguidas de la bandeja sin nada nuevo (cadencia adaptativa). */
let bandejaVacias = 0;
/** Última lectura del radar en ESTA pestaña (para acotar `refreshNearbyNow`). */
let ultimoRadarEn = 0;
/** Bajas de: broadcast de cuenta que despierta la bandeja y cambio de líder. */
let despertarOff: (() => void) | null = null;
let liderOff: (() => void) | null = null;
/** Desuscripción del realtime SSE del servidor propio. */
let streamOff: (() => void) | null = null;
/**
 * Marca de agua de la bandeja de relé de SUPABASE (`pullRelayInbox`): solo entregamos lo posterior
 * a esto. Avanza al `next` EXPLÍCITO del drenado (incluye filas propias / de otras neuronas de la
 * cuenta, ausentes de `items`), para que una ráfaga de esas filas no atasque la frontera.
 */
let inboxWatermark = 0;
/**
 * Marca de agua SEPARADA del buzón dirigido de un SERVIDOR PROPIO por HTTP (`pullRelayExtra`,
 * protocolo numérico `?since=<ms>`). Se mantiene APARTE del watermark de Supabase: mezclarlos
 * dejaría que un borde del endpoint HTTP empujara el cutoff de Supabase por delante de filas aún
 * NO drenadas (drenado page-capped) y las perdería — mismo motivo por el que el feed público separa
 * `publicCursor` de `publicExtraWatermark`.
 */
let inboxExtraWatermark = 0;
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

/** Aplica una lista de faros al radar de esta pestaña (propia o recibida de la líder). */
function aplicarFaros(faros: RelayBeacon[]): void {
  nearby = Array.isArray(faros) ? faros : [];
  ultimoRadarEn = Date.now();
  publishNearby();
}

/**
 * Una vuelta de FAROS: renueva mi faro y lee el radar (la misma vuelta: dos cosas que
 * caducan juntas). El radar se DIFUNDE a las demás pestañas del dispositivo.
 */
async function vueltaFaros(): Promise<{ fallo: FalloConsulta | null; datos: RelayBeacon[] }> {
  const emision = await emitBeaconDetallado();
  const { faros, fallo } = await pullBeaconsDetallado();
  if (!fallo) aplicarFaros(faros);
  return { fallo: fallo ?? emision.fallo, datos: faros };
}

/** Entrega los items en orden causal aproximado, saltando lo revocado y lo ya entregado. */
function entregar(items: RelayInboundItem[], saltarBloqueados: boolean): number {
  let entregados = 0;
  for (const it of items.slice().sort((a, b) => a.at - b.at)) {
    if (saltarBloqueados && it.locked) continue; // cifrado sin clave: no se puede entregar
    if (isRevoked(it.signerFp)) continue; // identidad revocada: se descarta
    if (it.id && deliveredRelayIds.has(it.id)) continue; // ya entregado
    if (it.id) rememberDelivered(it.id);
    // Adenda 149 · puerta de antenas por personalidad: esto llega por la RED
    // EXTERNA (relé/feed del servidor), no por la radio ⇒ antena "wifi".
    deliverInbound({ type: it.ptype, cls: it.cls, body: it.body, from: 0, verified: it.verified, signerFp: it.signerFp, antena: "wifi" });
    entregados += 1;
  }
  return entregados;
}

async function pollInbox(): Promise<{ fallo: FalloConsulta | null; siguienteMs: number }> {
  // Bandeja de relé StarSeed (Supabase, `next` explícito) + buzón dirigido del servidor propio
  // activo por HTTP (watermark numérico SEPARADO). Se sondean en paralelo con SUS PROPIOS
  // watermarks (ver la nota de inboxExtraWatermark: no se pueden mezclar los relojes).
  const [base, extra] = await Promise.all([
    pullRelayInbox(inboxWatermark),
    pullRelayExtra(inboxExtraWatermark),
  ]);
  // Avanza los watermarks ANTES de cualquier salida temprana: el `next` de la bandeja de relé
  // incluye las filas propias / de otras neuronas de la cuenta (ausentes de `items`), así que una
  // ráfaga de esas filas no deja el watermark atascado. El extra HTTP avanza por el `at` de sus items.
  inboxWatermark = Math.max(inboxWatermark, base.next);
  for (const it of extra) inboxExtraWatermark = Math.max(inboxExtraWatermark, it.at);
  // Entregar del más viejo al más nuevo (orden causal aproximado) ordenando por `at` —ambas
  // fuentes ya vienen en orden distinto—, SALTANDO lo ya entregado (la consulta usa `>=`, así
  // que el borde reaparece cada sondeo; el dedup por deliveredRelayIds cubre esas re-entregas).
  const entregados = entregar([...base.items, ...extra], true);
  // Cadencia adaptativa: tras varias vueltas vacías, en calma (15 min); con algo nuevo, 5 min.
  bandejaVacias = entregados > 0 ? 0 : bandejaVacias + 1;
  return {
    fallo: base.fallo ?? null,
    siguienteMs: bandejaVacias >= VACIAS_PARA_CALMA ? BANDEJA_EN_CALMA_MS : BANDEJA_CADA_MS,
  };
}

/**
 * Sondeo del FEED PÚBLICO: recoge el contenido publicado por OTRAS neuronas y lo
 * entrega igual que la bandeja privada (evento `mesh-inbound`). Cierra el bucle
 * publicar→almacenar→recibir. Mismo dedup por id que la bandeja de relé.
 */
async function pollPublicFeed(): Promise<{ fallo: FalloConsulta | null }> {
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
  entregar([...base.items, ...extra], false);
  return { fallo: base.fallo ?? null };
}

/**
 * Refresca el conjunto de CERTS de dispositivo revocados contra el ancla maestra
 * PROPIA (todas las neuronas de la cuenta comparten la misma maestra). `masterFingerprint`
 * es asíncrona, de ahí el envoltorio. Tolerante a fallos (no vacía el set si falla la lectura).
 */
async function refreshDeviceCertCRL(): Promise<FalloConsulta | null> {
  const mfp = await masterFingerprint();
  return mfp ? refreshDeviceCertRevocations(mfp) : null;
}

/** Al heredar el liderazgo, esta pestaña solo recoge lo MUY reciente (no reentrega un histórico). */
function fronterasRecientes(): void {
  const hace5 = Date.now() - 5 * 60_000;
  inboxWatermark = Math.max(inboxWatermark, hace5);
  inboxExtraWatermark = Math.max(inboxExtraWatermark, hace5);
  publicExtraWatermark = Math.max(publicExtraWatermark, hace5);
  if (!publicCursor.atIso || Date.parse(publicCursor.atIso) < hace5) {
    publicCursor = { atIso: new Date(hace5).toISOString(), id: "" };
  }
}

/** Arranca el descubrimiento + la bandeja de relé + el feed público (idempotente). */
export function startSynapticLayer(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  // Al arrancar solo recogemos lo MUY reciente (no un histórico). El cursor keyset
  // parte del par (hace 5 min, id vacío): `id` vacío → pullPublicFeed usa el uuid
  // cero, que incluye todas las filas de ese instante inicial.
  inboxWatermark = Date.now() - 5 * 60_000;
  inboxExtraWatermark = Date.now() - 5 * 60_000;
  publicCursor = { atIso: new Date(Date.now() - 5 * 60_000).toISOString(), id: "" };
  publicExtraWatermark = Date.now() - 5 * 60_000;

  bucleFaros = crearBucle<RelayBeacon[]>({
    nombre: "malla · faros y radar",
    consulta: "os_mesh_relay kind=beacon (update/insert + select)",
    intervaloMs: FAROS_CADA_MS,
    tarea: vueltaFaros,
    difundir: true,
    alRecibirDatos: (faros) => aplicarFaros(faros),
  });
  bucleBandeja = crearBucle({
    nombre: "malla · bandeja de relé",
    consulta: "os_mesh_relay channel=relay kind=data",
    intervaloMs: BANDEJA_CADA_MS,
    tarea: pollInbox,
  });
  const bucleFeed = crearBucle({
    nombre: "malla · feed público",
    consulta: "rpc mesh_public_feed",
    intervaloMs: FEED_PUBLICO_CADA_MS,
    tarea: pollPublicFeed,
  });
  const bucleRevocaciones = crearBucle({
    nombre: "malla · revocaciones de identidad",
    consulta: "os_mesh_relay kind=revocation",
    intervaloMs: REVOCACIONES_CADA_MS,
    tarea: async () => ({ fallo: await refreshRevocations() }),
  });
  const bucleIdentidades = crearBucle({
    nombre: "malla · registro de identidades",
    consulta: "os_mesh_relay kind=identity + device-cert-revocation",
    intervaloMs: IDENTIDADES_CADA_MS,
    tarea: async () => {
      await registerIdentity(); // idempotente: publica mi reclamación firmada una vez por sesión
      const fallo = await refreshIdentities(); // mapa verificado fp→cuenta
      const falloCrl = await refreshDeviceCertCRL(); // CERTS de dispositivo revocados
      return { fallo: fallo ?? falloCrl };
    },
  });
  buclesSinapticos = [bucleFaros, bucleBandeja, bucleFeed, bucleRevocaciones, bucleIdentidades];
  for (const b of buclesSinapticos) b.iniciar();

  // Entrega RÁPIDA entre MIS neuronas sin tocar la base: quien sube un relé avisa por el canal
  // de cuenta y aquí se adelanta la bandeja (respetando líder, visibilidad y freno).
  void import("@/lib/sync/realtime-sync")
    .then((m) => {
      if (!started) return;
      despertarOff = m.onAccountBroadcast(EVENTO_DESPERTAR_RELE, () => {
        bandejaVacias = 0;
        bucleBandeja?.adelantar();
      });
    })
    .catch(() => undefined);
  try {
    liderOff = alCambiarLider((lider) => {
      if (lider) fronterasRecientes();
    });
  } catch {
    liderOff = null;
  }

  // Realtime SSE del servidor propio activo (si lo hay): no es Supabase.
  const onLiveItem = (it: RelayInboundItem) => {
    if (isRevoked(it.signerFp)) return; // identidad revocada: se descarta
    if (it.id && deliveredRelayIds.has(it.id)) return;
    if (it.id) rememberDelivered(it.id);
    // Avanza el cursor keyset por comparación COMPUESTA (at, id): igual que el RPC,
    // así el realtime y el sondeo comparten frontera y no retroceden entre ellos.
    publicCursor = advanceCursor(publicCursor, { atIso: new Date(it.at).toISOString(), id: it.id || "" });
    inboxWatermark = Math.max(inboxWatermark, it.at);
    // Adenda 149 · puerta de antenas por personalidad: vía red externa ⇒ "wifi".
    deliverInbound({ type: it.ptype, cls: it.cls, body: it.body, from: 0, verified: it.verified, signerFp: it.signerFp, antena: "wifi" });
  };
  // (2026-09-29) Ya NO se abre `subscribeRelayRealtime`: `os_mesh_relay` sale de la
  // publicación de Realtime (ver la cabecera de esa función en server-relay.ts).
  streamOff = subscribeEndpointStream(onLiveItem);
}

/** Detiene la capa y retira el faro de esta neurona (solo la líder: es la que lo mantiene). */
export function stopSynapticLayer(): void {
  started = false;
  for (const b of buclesSinapticos) b.detener();
  buclesSinapticos = [];
  bucleFaros = bucleBandeja = null;
  despertarOff?.();
  liderOff?.();
  streamOff?.();
  despertarOff = liderOff = streamOff = null;
  let lider = true;
  try {
    lider = esLider();
  } catch {
    lider = true;
  }
  if (lider) void purgeBeacon();
}

/**
 * Refresco del radar al abrir un widget: como mucho una lectura cada 2 min por pestaña, nunca
 * con el freno activo ni con el bucle de faros parado por un 400/404. Solo LEE (no emite faro).
 */
export function refreshNearbyNow(): void {
  if (Date.now() - ultimoRadarEn < RADAR_MANUAL_MIN_MS) {
    publishNearby();
    return;
  }
  try {
    if (frenoActivo()) return;
  } catch {
    /* sin freno: seguimos */
  }
  if (bucleFaros?.estado().detenido) return;
  ultimoRadarEn = Date.now();
  void pullBeaconsDetallado().then(({ faros, fallo }) => {
    if (!fallo) aplicarFaros(faros);
  });
}
