"use client";

/**
 * StarSeed OS — Red Mesh · DESCUBRIMIENTO P2P CONTINUO (Adenda 97 · SOP §3).
 * ============================================================================
 * Mantiene la topología VIVA de la malla: quién está, quién entra, quién se
 * va — de forma pasiva (escuchar NodeInfo/telemetría/paquetes: cero airtime,
 * cero batería extra) con un único sweep perezoso de presencia.
 *
 * El transporte llama a `feedNode()`/`feedSelfTelemetry()`; discovery decide
 * presencia (online → stale → offline) y publica al store. NUNCA lanza.
 */

import {
  NODE_OFFLINE_MS,
  NODE_STALE_MS,
  NODE_SWEEP_INTERVAL_MS,
} from "./constants";
import { refreshMeshHealth } from "./health";
import { getMeshState, replaceMeshNodes, upsertMeshNode } from "./store";
import type { MeshNodeInfo, MeshNodePresence } from "./types";

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function presenceFor(lastHeard: number, now: number): MeshNodePresence {
  const silence = now - lastHeard;
  if (silence <= NODE_STALE_MS) return "online";
  if (silence <= NODE_OFFLINE_MS) return "stale";
  return "offline";
}

/** Alimenta un nodo oído/actualizado (lo llama el transporte). */
export function feedNode(partial: Partial<MeshNodeInfo> & { num: number }): void {
  try {
    upsertMeshNode(partial);
    refreshMeshHealth();
  } catch {
    /* */
  }
}

/** Telemetría del NODO LOCAL (utilización de canal, batería del radio). */
export function feedSelfTelemetry(patch: Partial<MeshNodeInfo>): void {
  try {
    const self = getMeshState().self;
    if (self) upsertMeshNode({ ...patch, num: self.num, isSelf: true });
    refreshMeshHealth();
  } catch {
    /* */
  }
}

/** Sweep perezoso de presencia (un solo timer, 30 s). Idempotente. */
export function startDiscovery(): void {
  if (sweepTimer || typeof window === "undefined") return;
  sweepTimer = setInterval(() => {
    try {
      const now = Date.now();
      const s = getMeshState();
      if (!s.nodes.length) return;
      let changed = false;
      const nodes = s.nodes.map((n) => {
        const presence = n.isSelf ? "online" : presenceFor(n.lastHeard, now);
        if (presence !== n.presence) {
          changed = true;
          return { ...n, presence };
        }
        return n;
      });
      if (changed) {
        replaceMeshNodes(nodes);
        refreshMeshHealth();
      }
    } catch {
      /* */
    }
  }, NODE_SWEEP_INTERVAL_MS);
}

export function stopDiscovery(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}
