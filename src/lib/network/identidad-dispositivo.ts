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
