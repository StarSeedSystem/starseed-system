// ════════════════════════════════════════════════════════════════
// qm client para Aurora tools
// ------------------------------------------------------------
// Cablea qm (memoria vectorial cuantizada local) como herramientas
// invocables por Aurora / Astraura 1.58-bit.
// ════════════════════════════════════════════════════════════════

import type { QmConfig } from "../../../ai/astraura/integrations/qm";
import {
  healthCheck,
  initialize,
  upsert,
  search,
  remove,
  listCollections,
  collectionStats,
  embedLocal,
  exportDb,
  importDb,
} from "../../../ai/astraura/integrations/qm";

/** Re-export para runIntegration (registry) */
export {
  healthCheck as health,
  initialize,
  upsert,
  search,
  remove,
  listCollections,
  collectionStats,
  embedLocal,
  exportDb,
  importDb,
};

/** Carga config desde env / user settings. */
export function loadQmConfig(): QmConfig {
  return {
    dbPath: process.env.QM_DB_PATH || ":memory:",
    dimensions: parseInt(process.env.QM_DIMENSIONS || "384", 10),
    quantization: (process.env.QM_QUANTIZATION as QmConfig["quantization"]) || "bit",
    embedModel: process.env.QM_EMBED_MODEL || "mxbai-embed-large-v1",
    timeoutMs: 30000,
    autoInit: true,
    enabled: true,
  };
}

/* ────────────────────────────────────────────────────────────────
   WRAPPERS tipados para runIntegration (registry)
   ──────────────────────────────────────────────────────────────── */

export async function runQmAction(
  action: string,
  config: QmConfig,
  input: Record<string, unknown>
): Promise<IntegrationResult> {
  switch (action) {
    case "health": {
      return healthCheck(config);
    }
    case "initialize": {
      return initialize(config, input);
    }
    case "upsert": {
      const collection = (input.collection as string) || "default";
      const vectors = (input.vectors as QmVector[]) || [];
      return upsert(config, collection, vectors);
    }
    case "search": {
      const collection = (input.collection as string) || "default";
      const queryEmbedding = input.queryEmbedding as Float32Array | Uint8Array | Int8Array;
      if (!queryEmbedding) {
        return { ok: false, error: "queryEmbedding requerido" };
      }
      const k = (input.k as number) || 10;
      const filter = input.filter as Record<string, unknown> | undefined;
      return search(config, collection, queryEmbedding, { k, filter });
    }
    case "remove": {
      const collection = (input.collection as string) || "default";
      const ids = (input.ids as string[]) || [];
      return remove(config, collection, ids);
    }
    case "listCollections": {
      return listCollections(config);
    }
    case "collectionStats": {
      const collection = (input.collection as string) || "default";
      return collectionStats(config, collection);
    }
    case "embedLocal": {
      const texts = (input.texts as string[]) || [];
      return embedLocal(config, texts);
    }
    case "exportDb": {
      return exportDb(config);
    }
    case "importDb": {
      const data = input.data as Uint8Array;
      if (!data) {
        return { ok: false, error: "data (Uint8Array) requerido" };
      }
      return importDb(config, data);
    }
    default: {
      return { ok: false, error: `Acción qm desconocida: ${action}` };
    }
  }
}

/** Test de conexión para registry. */
export async function testQmConnection(config: QmConfig): Promise<IntegrationResult> {
  return healthCheck(config);
}

// Import type for IntegrationResult
import type { IntegrationResult } from "../../../lib/integrations/types";
import type { QmVector } from "../../../ai/astraura/integrations/qm";