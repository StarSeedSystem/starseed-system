"use client";

/*
 * identidad-dispositivo — UN solo mapa de las TRES identidades de dispositivo
 * que el OS ya usaba por separado, sin unificar (Ola 366 · «malla de neuronas»).
 * ---------------------------------------------------------------------------
 * El OS crea un id de dispositivo estable en TRES sitios distintos, cada uno
 * para su propia capa, y ninguno se conocía al otro:
 *
 *   1. `starseed.device.id`          — motor de sync (entity-state.ts):
 *      biblioteca/escritorios/broadcasts de cuenta (`acct:<uid>`).
 *   2. `starseed.neuron.device-id`   — neuronas (neurons.ts):
 *      registro vivo en `neuron_devices` (heartbeat, capacidades, permisos).
 *   3. `starseed.mesh.device-id.v1`  — malla LoRa/faros (federation.ts):
 *      `os_mesh_topology` y los faros de `os_mesh_relay`.
 *
 * Este módulo NO sustituye ninguno (romper las claves existentes perdería el
 * historial de cada neurona ya registrada) — solo los LEE los tres y expone un
 * mapa único, para que capas nuevas (la malla de neuronas WebRTC) puedan
 * correlacionar "esta neurona" ↔ "este faro" ↔ "este deviceId de sync" sin
 * inventar una CUARTA identidad.
 *
 * `neuron_devices.capabilities` ya llevaba `syncDeviceId` (Adenda 71-bis); este
 * módulo añade `meshDeviceId` al mismo sitio (ver `neurons.ts::detectCapabilities`),
 * y los faros de la red sináptica llevan una etiqueta corta {nid, sid} con estos
 * mismos ids (ver `server-relay.ts::emitBeacon`) — así un faro propio se
 * reconoce como "mi otra neurona" sin depender solo de `owner_id` en RLS.
 *
 * Defensivo/SSR-safe: en el servidor devuelve ids vacíos; nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

const LS_SYNC = "starseed.device.id";
const LS_NEURON = "starseed.neuron.device-id";
const LS_MESH = "starseed.mesh.device-id.v1";

/** Las tres identidades de ESTE dispositivo, correlacionadas. */
export interface IdentidadDispositivo {
  /** Motor de sync (entity-state.ts) — biblioteca, escritorios, broadcasts de cuenta. */
  syncDeviceId: string;
  /** Registro de neuronas (neurons.ts) — `neuron_devices`, heartbeat, capacidades. */
  neuronDeviceId: string;
  /** Malla LoRa/faros (federation.ts) — `os_mesh_topology`, faros de `os_mesh_relay`. */
  meshDeviceId: string;
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Lee (o crea, si falta) el id de una identidad concreta. Reutiliza EXACTAMENTE
 * la misma clave que su módulo dueño histórico — nunca genera un id nuevo si ya
 * existe uno, para no "duplicar" una neurona/faro/dispositivo ya registrado.
 */
function leerOCrear(clave: string): string {
  if (typeof window === "undefined") return "";
  try {
    const existente = safeGet(clave);
    if (existente && existente.trim()) return existente;
    const id = uuid();
    safeSet(clave, id);
    return id;
  } catch {
    return "";
  }
}

/**
 * Id de NEURONA de este medio (`starseed.neuron.device-id`), el mismo que devuelve
 * `thisDeviceId()` de neurons.ts, pero sin arrastrar ese módulo (registro, Supabase…): es lo que
 * usan los módulos hoja —avisos por neurona, ventanas de arranque— para saber «quién soy».
 * Crea el id si faltara (mismo formato). Nunca lanza; vacío en el servidor.
 */
export function neuronDeviceIdActual(): string {
  return leerOCrear(LS_NEURON);
}

/**
 * identidadDispositivo — mapa único de las tres identidades de ESTE dispositivo.
 * NUNCA lanza; SSR-safe (ids vacíos en el servidor). Idempotente: no crea nada
 * que no existiera ya (cada clave ya se crea, por separado, en su módulo dueño;
 * aquí solo se lee — o se crea con el MISMO formato si de verdad faltara).
 */
export function identidadDispositivo(): IdentidadDispositivo {
  return {
    syncDeviceId: leerOCrear(LS_SYNC),
    neuronDeviceId: leerOCrear(LS_NEURON),
    meshDeviceId: leerOCrear(LS_MESH),
  };
}

/** Etiqueta corta para embeber en un faro de la red sináptica (no PII). */
export interface EtiquetaFaroPropio {
  /** `neuronDeviceId` corto (para casar un faro con una fila de `neuron_devices`). */
  nid?: string;
  /** `syncDeviceId` corto (para dirigir broadcasts de cuenta a esa neurona). */
  sid?: string;
}

/** Etiqueta de identidad para el payload de `emitBeacon()`. Nunca lanza. */
export function etiquetaFaroPropio(): EtiquetaFaroPropio {
  try {
    const id = identidadDispositivo();
    return {
      ...(id.neuronDeviceId ? { nid: id.neuronDeviceId } : {}),
      ...(id.syncDeviceId ? { sid: id.syncDeviceId } : {}),
    };
  } catch {
    return {};
  }
}

/* ─────────────────────── Adoptar la identidad de una neurona ya conocida ─────────────────────── */

/**
 * Alias de identidad de ESTE origen (localStorage; NUNCA se sincroniza: cada medio tiene el suyo).
 * Guarda a quién adoptó este medio y cuál era su id propio, para poder explicarlo, deshacerlo o
 * limpiar la fila duplicada que el registro de neuronas creó al arrancar.
 */
export const CLAVE_ALIAS_DISPOSITIVO = "starseed.device.alias.v1";

export interface AliasDispositivo {
  v: 1;
  neurona: {
    /** Id de la neurona de la cuenta cuya identidad usa ahora este medio. */
    adoptada: string;
    /** Id de neurona que tenía este medio antes de adoptar (su fila propia quedó huérfana). */
    propia: string;
    /** Epoch ms de la adopción. */
    ts: number;
  } | null;
}

/** Un id de neurona válido: el que crea `crypto.randomUUID()` o el de reserva `n-…`/`id-…`. */
const ID_NEURONA_VALIDO = /^[A-Za-z0-9][A-Za-z0-9_.-]{5,79}$/;

export function esIdNeuronaValido(id: unknown): id is string {
  return typeof id === "string" && ID_NEURONA_VALIDO.test(id);
}

/** Lee el alias de este origen (sin adopción: `{ v: 1, neurona: null }`). Nunca lanza. */
export function leerAliasDispositivo(): AliasDispositivo {
  const vacio: AliasDispositivo = { v: 1, neurona: null };
  try {
    const raw = safeGet(CLAVE_ALIAS_DISPOSITIVO);
    if (!raw) return vacio;
    const j = JSON.parse(raw) as Partial<AliasDispositivo> | null;
    const n = j?.neurona;
    if (n && esIdNeuronaValido(n.adoptada) && typeof n.propia === "string" && typeof n.ts === "number") {
      return { v: 1, neurona: { adoptada: n.adoptada, propia: n.propia, ts: n.ts } };
    }
    return vacio;
  } catch {
    return vacio;
  }
}

export interface ResultadoAdopcion {
  ok: boolean;
  /** Id de neurona que tenía este medio antes (vacío si no había o falló). */
  anterior: string;
  /** Id de neurona que usa ahora este medio. */
  adoptada: string;
  /** Por qué no se adoptó, si `ok` es false. */
  motivo?: "id-invalido" | "sin-almacenamiento";
}

/**
 * «Esta neurona ES esa que ya configuré»: este medio pasa a usar el id de neurona de la cuenta
 * indicado. SOLO cambia el id de NEURONA (`starseed.neuron.device-id`): lo que cuelga de él —
 * nombre, permisos, ajustes, overrides de sistemas por personalidad— es de la cuenta y llega solo.
 *
 * Los otros dos ids NO se comparten a propósito, y esto es lo que evita romper cosas ya guardadas:
 *  · `starseed.device.id` (sync) suprime el eco de las propias escrituras (`self: row.device_id ===
 *    deviceId()`) y firma los broadcasts: dos orígenes con el mismo id se ignorarían entre sí.
 *  · `starseed.mesh.device-id.v1` (malla) ancla la clave pública de cada nodo la primera vez que
 *    se ve (TOFU): compartirlo haría que un origen «suplantara» a otro ante la malla.
 * El mapeo queda en `starseed.device.alias.v1` (por origen). Idempotente: adoptar el id que ya se
 * usa no cambia nada. Nunca lanza.
 */
export function adoptarNeurona(idAdoptada: string, ahora: number = Date.now()): ResultadoAdopcion {
  if (!esIdNeuronaValido(idAdoptada)) return { ok: false, anterior: "", adoptada: "", motivo: "id-invalido" };
  try {
    if (typeof window === "undefined") return { ok: false, anterior: "", adoptada: "", motivo: "sin-almacenamiento" };
    const actual = safeGet(LS_NEURON)?.trim() || "";
    if (actual === idAdoptada) return { ok: true, anterior: actual, adoptada: idAdoptada };
    // Se conserva el id propio ORIGINAL aunque se readopte otra neurona más tarde.
    const previo = leerAliasDispositivo().neurona;
    const propia = previo?.propia || actual;
    safeSet(CLAVE_ALIAS_DISPOSITIVO, JSON.stringify({ v: 1, neurona: { adoptada: idAdoptada, propia, ts: ahora } } satisfies AliasDispositivo));
    safeSet(LS_NEURON, idAdoptada);
    // `thisDeviceId()` (neurons.ts) lee el disco directamente: si la escritura cayó a memoria
    // (almacenamiento bloqueado) el id NO cambió de verdad para el resto del OS.
    if (window.localStorage.getItem(LS_NEURON) !== idAdoptada) {
      return { ok: false, anterior: actual, adoptada: actual, motivo: "sin-almacenamiento" };
    }
    return { ok: true, anterior: actual, adoptada: idAdoptada };
  } catch {
    return { ok: false, anterior: "", adoptada: "", motivo: "sin-almacenamiento" };
  }
}
