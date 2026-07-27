"use client";

/**
 * StarSeed OS — Red Mesh · FEDERACIÓN DE TOPOLOGÍAS (Adenda 98 · v2).
 * ============================================================================
 * Comparte, entre las neuronas de la MISMA cuenta soberana, una INSTANTÁNEA
 * COMPACTA de la malla LoRa que cada una ve — para dibujar una topología
 * federada (qué vecinos alcanza cada neurona) sin exponer la malla a terceros.
 *
 *   · PUSH: cada ~45 s (throttled) sube self + vecinos online (campos mínimos)
 *     a `os_mesh_topology` (upsert por device_id). Solo si hay malla lista.
 *   · PULL: cada ~60 s lee las instantáneas RECIENTES de las OTRAS neuronas de
 *     la cuenta y las publica en el store como `remoteTopologies` (la UI las
 *     pinta como "vía otra neurona").
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

const DEVICE_ID_KEY = "starseed.mesh.device-id.v1";
const PUSH_INTERVAL_MS = 45_000;
const PULL_INTERVAL_MS = 60_000;
/** Instantáneas más viejas que esto se ignoran al leer (neurona apagada). */
const REMOTE_FRESH_MS = 10 * 60_000;

let pushTimer: ReturnType<typeof setInterval> | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

/** Id estable de ESTE dispositivo (no PII; aleatorio, persistido local). */
function deviceId(): string {
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

async function ownerId(supabase: NonNullable<Awaited<ReturnType<typeof client>>>): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Sube la instantánea compacta de la malla local (si hay). Nunca lanza. */
async function pushSnapshot(): Promise<void> {
  try {
    const s = getMeshState();
    if (s.status !== "ready" && s.status !== "degraded") return;
    // PRIVACIDAD (Adenda 98): "private" = esta neurona NO publica nada a la
    // federación; nombres y posición solo viajan con opt-in explícito.
    const privacy = getMeshPrivacy();
    if (privacy.visibility === "private") return;
    const supabase = await client();
    if (!supabase) return;
    const owner = await ownerId(supabase);
    if (!owner) return; // sin sesión → sin federación (local sigue igual)

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
    await supabase.from("os_mesh_topology").upsert(
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
  } catch {
    /* federación best-effort */
  }
}

/** Lee las instantáneas de las OTRAS neuronas de la cuenta. Nunca lanza. */
async function pullSnapshots(): Promise<void> {
  try {
    const supabase = await client();
    if (!supabase) return;
    const owner = await ownerId(supabase);
    if (!owner) return;
    const { data, error } = await supabase
      .from("os_mesh_topology")
      .select("device_id, device_label, snapshot, online_count, updated_at")
      .eq("owner_id", owner)
      .order("updated_at", { ascending: false })
      .limit(24);
    if (error || !Array.isArray(data)) return;

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
  } catch {
    /* */
  }
}

/** Arranca la federación (idempotente). Coste ~0 sin sesión/malla. */
export function startMeshFederation(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  // Primer pull rápido para poblar la UI; luego cadencia normal.
  void pullSnapshots();
  pushTimer = setInterval(() => void pushSnapshot(), PUSH_INTERVAL_MS);
  pullTimer = setInterval(() => void pullSnapshots(), PULL_INTERVAL_MS);
}

export function stopMeshFederation(): void {
  started = false;
  if (pushTimer) clearInterval(pushTimer);
  if (pullTimer) clearInterval(pullTimer);
  pushTimer = null;
  pullTimer = null;
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
