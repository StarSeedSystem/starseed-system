"use client";

/**
 * StarSeed OS — Red Mesh · FEDERACIÓN DE TOPOLOGÍAS (Adenda 98 · v2).
 * ============================================================================
 * Comparte, entre las neuronas de la MISMA cuenta soberana, una INSTANTÁNEA
 * COMPACTA de la malla LoRa que cada una ve — para dibujar una topología
 * federada (qué vecinos alcanza cada neurona) sin exponer la malla a terceros.
 *
 *   · PUSH: cada 10 min sube self + vecinos online (campos mínimos) a
 *     `os_mesh_topology` (upsert por device_id). Solo si hay malla lista.
 *   · PULL: cada 10 min lee las instantáneas RECIENTES de las OTRAS neuronas de
 *     la cuenta y las publica en el store como `remoteTopologies` (la UI las
 *     pinta como "vía otra neurona"); cada 30 min si la última lectura vino vacía.
 *
 *   (2026-09-29 · contrato «consumo») Antes: push 45 s / pull 60 s en cada pestaña, con la
 *   pestaña oculta, y un `getUser()` en cada vuelta. Ahora: solo la pestaña líder, pausa con
 *   el dispositivo oculto, freno remoto y parada ante 400/404 (`bucle-fondo.ts`).
 *
 * Identidad soberana: RLS por owner (la migración). Degradación TOTAL y
 * silenciosa: sin sesión, sin tabla o sin red, no hace nada y la malla local
 * sigue igual. NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { getMeshPrivacy } from "./privacy";
import { getMeshState, setMeshState } from "./store";
import { getActiveModemPreset } from "./sync";
import type { RemoteTopology } from "./types";
import { uidActual } from "@/lib/consumo/usuario";
import { crearBucle, falloDe, MINUTO_MS, type BucleFondo, type FalloConsulta } from "@/lib/network/bucle-fondo";
import { getResumenLocal, recibirResumen } from "@/lib/network/radar-remoto-store";
import { esMensajeRadar, huellaResumen, MSG_RADAR, type ResumenRadar, type SenalCompartida } from "@/lib/network/radar-por-malla";

const DEVICE_ID_KEY = "starseed.mesh.device-id.v1";
export const PUSH_INTERVAL_MS = 10 * MINUTO_MS;
export const PULL_INTERVAL_MS = 10 * MINUTO_MS;
/** Sin topologías ajenas en la última lectura: no hay otra neurona con radio, se mira menos. */
const PULL_EN_CALMA_MS = 30 * MINUTO_MS;
/** Instantáneas más viejas que esto se ignoran al leer (neurona apagada). */
const REMOTE_FRESH_MS = 10 * 60_000;
/** Resumen sin radio: nunca más de un upsert cada 5 min… */
export const RESUMEN_MIN_MS = 5 * MINUTO_MS;
/** …y aunque nada cambie, se refresca a los 15 min (la fila remota caduca a los 10). */
export const RESUMEN_MAX_MS = 15 * MINUTO_MS;

let buclePush: BucleFondo | null = null;
let buclePull: BucleFondo | null = null;
let started = false;

/** Id estable de ESTE dispositivo (no PII; aleatorio, persistido local). */
export function deviceId(): string {
  try {
    let id = safeGet(DEVICE_ID_KEY);
    if (!id) {
      const rnd = globalThis.crypto?.getRandomValues?.(new Uint32Array(2));
      id = rnd ? `dev-${rnd[0].toString(36)}${rnd[1].toString(36)}` : `dev-${Date.now().toString(36)}`;
      safeSet(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "dev-anon";
  }
}

async function client() {
  try {
    const { createClient } = await import("@/utils/supabase/client");
    return createClient();
  } catch {
    return null;
  }
}

async function ownerId(_supabase: NonNullable<Awaited<ReturnType<typeof client>>>): Promise<string | null> {  // Sin red (antes `getUser()` en cada push/pull).
  try {
    return await uidActual();
  } catch {
    return null;
  }
}

/** Sube la instantánea compacta de la malla local (si hay). Nunca lanza. */
async function pushSnapshot(): Promise<FalloConsulta | null> {
  try {
    const s = getMeshState();
    // Sin radio lista no hay nada que federar: cero peticiones.
    if (s.status !== "ready" && s.status !== "degraded") return null;
    // PRIVACIDAD (Adenda 98): "private" = esta neurona NO publica nada a la
    // federación; nombres y posición solo viajan con opt-in explícito.
    const privacy = getMeshPrivacy();
    if (privacy.visibility === "private") return null;
    const supabase = await client();
    if (!supabase) return null;
    const owner = await ownerId(supabase);
    if (!owner) return null; // sin sesión → sin federación (local sigue igual)

    const nameOf = (n: { shortName?: string; longName?: string }) =>
      privacy.shareName ? n.shortName || n.longName || null : null;
    const online = s.nodes.filter((n) => !n.isSelf && n.presence === "online");
    const snapshot = {
      self: s.self
        ? {
            num: s.self.num,
            name: nameOf(s.self),
            snr: s.self.snr ?? null,
            // La POSICIÓN solo viaja con opt-in explícito (sharePosition).
            ...(privacy.sharePosition && typeof s.self.lat === "number" && typeof s.self.lon === "number"
              ? { lat: s.self.lat, lon: s.self.lon }
              : {}),
          }
        : null,
      nodes: online.slice(0, 40).map((n) => ({
        num: n.num,
        name: nameOf(n),
        snr: typeof n.snr === "number" ? Math.round(n.snr * 10) / 10 : null,
      })),
      region: s.region,
      preset: getActiveModemPreset(),
    };
    const res = await supabase.from("os_mesh_topology").upsert(
      {
        owner_id: owner,
        device_id: deviceId(),
        // El nombre del dispositivo respeta shareName igual que los nodos: con
        // shareName=false NO viaja ("solo números de nodo"), solo el id opaco.
        device_label: privacy.shareName ? s.self?.longName || s.self?.shortName || "Neurona" : "Neurona",
        snapshot,
        online_count: online.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,device_id" },
    );
    return falloDe(res as { error?: unknown; status?: number });
  } catch (e) {
    /* federación best-effort */
    return { message: e instanceof Error ? e.message : "sin red" };
  }
}

/** Lee las instantáneas de las OTRAS neuronas de la cuenta. Nunca lanza. */
async function pullSnapshots(): Promise<{ fallo: FalloConsulta | null; siguienteMs?: number }> {
  try {
    const supabase = await client();
    if (!supabase) return { fallo: null };
    const owner = await ownerId(supabase);
    if (!owner) return { fallo: null };
    const res = await supabase
      .from("os_mesh_topology")
      .select("device_id, device_label, snapshot, online_count, updated_at")
      .eq("owner_id", owner)
      .order("updated_at", { ascending: false })
      .limit(24);
    const { data, error } = res;
    if (error || !Array.isArray(data)) return { fallo: falloDe(res as { error?: unknown; status?: number }) };

    const me = deviceId();
    const cutoff = Date.now() - REMOTE_FRESH_MS;
    const remote: RemoteTopology[] = [];
    for (const row of data as Array<Record<string, unknown>>) {
      const devId = String(row.device_id ?? "");
      if (!devId || devId === me) continue; // no me federo a mí mismo
      const at = row.updated_at ? Date.parse(String(row.updated_at)) : 0;
      if (!at || at < cutoff) continue; // instantánea rancia (neurona apagada)
      remote.push({
        deviceId: devId,
        label: String(row.device_label ?? "Neurona"),
        onlineCount: typeof row.online_count === "number" ? row.online_count : 0,
        snapshot: (row.snapshot ?? {}) as RemoteTopology["snapshot"],
        at,
      });
    }
    setMeshState({ remoteTopologies: remote });
    return { fallo: null, siguienteMs: remote.length ? PULL_INTERVAL_MS : PULL_EN_CALMA_MS };
  } catch (e) {
    return { fallo: { message: e instanceof Error ? e.message : "sin red" } };
  }
}

/** Arranca la federación (idempotente). Coste ~0 sin sesión/malla; solo en la pestaña líder. */
export function startMeshFederation(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  buclePull = crearBucle({
    nombre: "malla · federación (lectura)",
    consulta: "select os_mesh_topology",
    intervaloMs: PULL_INTERVAL_MS,
    tarea: pullSnapshots,
  });
  buclePush = crearBucle({
    nombre: "malla · federación (subida)",
    consulta: "upsert os_mesh_topology",
    intervaloMs: PUSH_INTERVAL_MS,
    arrancarYa: false,
    tarea: async () => ({ fallo: await pushSnapshot() }),
  });
  buclePull.iniciar();
  buclePush.iniciar();
}

export function stopMeshFederation(): void {
  started = false;
  buclePush?.detener();
  buclePull?.detener();
  buclePush = null;
  buclePull = null;
}

/**
 * Borra la fila publicada de ESTA neurona (al pasar a visibilidad "private"):
 * sin esto, la última instantánea (nombre/vecinos/posición) seguía siendo
 * legible por las otras neuronas de la cuenta hasta REMOTE_FRESH_MS (10 min).
 * Best-effort: sin sesión/tabla no hace nada. Nunca lanza.
 */
export async function purgeMeshTopology(): Promise<void> {
  try {
    const supabase = await client();
    if (!supabase) return;
    const owner = await ownerId(supabase);
    if (!owner) return;
    await supabase.from("os_mesh_topology").delete().eq("owner_id", owner).eq("device_id", deviceId());
  } catch {
    /* */
  }
}

/** Fuerza un push inmediato (p. ej. al conectar un radio). Nunca lanza. */
export function pushMeshTopologyNow(): void {
  void pushSnapshot();
}
