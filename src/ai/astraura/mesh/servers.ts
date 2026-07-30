"use client";

/**
 * StarSeed OS — SERVIDORES DE RED (internet público / relé) · editables.
 * ============================================================================
 * Lista de servidores que la neurona puede usar para el "internet público" y
 * el relé cifrado, INDEPENDIENTE de la malla local P2P:
 *
 *   · "starseed"  → Servidor público StarSeed (por defecto). Entrelaza a TODAS
 *                   las neuronas de la red StarSeed (internet público del OS).
 *                   No editable ni borrable (es el bien común de la red).
 *   · "custom"    → Cualquier servidor privado o público añadido/editable por
 *                   la CUENTA (aquí) o por un GRUPO/página (vía entity_state,
 *                   ver el panel de conectividad de entidad).
 *
 * Persistencia local-first por cuenta (localStorage, sincronizada con la cuenta
 * vía settings-sync). SSR-safe y defensiva: NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const MESH_SERVERS_EVENT = "starseed:mesh-servers";
export const MESH_SERVERS_LS_KEY = "starseed.mesh.servers.v1";

export type MeshServerKind = "starseed" | "custom";
export type MeshServerVisibility = "public" | "private";

export interface MeshServer {
  id: string;
  name: string;
  kind: MeshServerKind;
  /** URL del servidor. El servidor StarSeed usa el Supabase del OS (endpoint vacío). */
  endpoint?: string;
  /** público = entrelaza entre cuentas · privado = solo tu cuenta/grupo. */
  visibility: MeshServerVisibility;
  /** ¿El usuario puede editar/borrar este servidor? (el StarSeed no). */
  editable: boolean;
  notes?: string;
  /** Token bearer para servidores con auth (Adenda 107). Vacío = servidor abierto. */
  token?: string;
}

/** Servidor público StarSeed: por defecto y no editable/borrable. */
export const STARSEED_PUBLIC_SERVER: MeshServer = {
  id: "starseed",
  name: "Servidor público StarSeed",
  kind: "starseed",
  endpoint: "",
  visibility: "public",
  editable: false,
  notes: "Entrelaza a todas las neuronas de la red StarSeed (internet público del OS).",
};

function readCustom(): MeshServer[] {
  try {
    const raw = safeGet(MESH_SERVERS_LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x): MeshServer => ({
        id: String(x.id ?? ""),
        name: String(x.name ?? "Servidor"),
        kind: "custom",
        endpoint: typeof x.endpoint === "string" ? x.endpoint : "",
        visibility: x.visibility === "public" ? "public" : "private",
        editable: true,
        notes: typeof x.notes === "string" ? x.notes : undefined,
        token: typeof x.token === "string" ? x.token : undefined,
      }))
      .filter((s) => s.id && s.id !== "starseed");
  } catch {
    return [];
  }
}

function writeCustom(list: MeshServer[]): void {
  try {
    safeSet(MESH_SERVERS_LS_KEY, JSON.stringify(list.filter((s) => s.editable)));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(MESH_SERVERS_EVENT, { detail: { servers: list } }));
    }
  } catch {
    /* */
  }
}

/** Todos los servidores disponibles para la cuenta: StarSeed + los personalizados. */
export function listMeshServers(): MeshServer[] {
  return [STARSEED_PUBLIC_SERVER, ...readCustom()];
}

export function getMeshServer(id: string): MeshServer | null {
  return listMeshServers().find((s) => s.id === id) ?? null;
}

export function newServerId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `srv-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    /* */
  }
  return `srv-${Math.random().toString(36).slice(2, 10)}`;
}

export function addMeshServer(input: {
  name: string;
  endpoint?: string;
  visibility?: MeshServerVisibility;
  notes?: string;
  token?: string;
}): MeshServer {
  const server: MeshServer = {
    id: newServerId(),
    name: input.name.trim() || "Servidor",
    kind: "custom",
    endpoint: (input.endpoint ?? "").trim(),
    visibility: input.visibility === "public" ? "public" : "private",
    editable: true,
    notes: input.notes,
    token: (input.token ?? "").trim() || undefined,
  };
  writeCustom([...readCustom(), server]);
  return server;
}

export function updateMeshServer(id: string, patch: Partial<Omit<MeshServer, "id" | "kind" | "editable">>): void {
  if (id === "starseed") return; // el StarSeed no se edita
  const list = readCustom().map((s): MeshServer =>
    s.id === id
      ? {
          ...s,
          ...("name" in patch ? { name: (patch.name ?? s.name).trim() || s.name } : {}),
          ...("endpoint" in patch ? { endpoint: (patch.endpoint ?? "").trim() } : {}),
          ...("visibility" in patch ? { visibility: patch.visibility === "public" ? "public" : "private" } : {}),
          ...("notes" in patch ? { notes: patch.notes } : {}),
          ...("token" in patch ? { token: (patch.token ?? "").trim() || undefined } : {}),
        }
      : s,
  );
  writeCustom(list);
}

export function removeMeshServer(id: string): void {
  if (id === "starseed") return; // no borrable
  writeCustom(readCustom().filter((s) => s.id !== id));
}

export function subscribeMeshServers(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(MESH_SERVERS_EVENT, handler);
  return () => window.removeEventListener(MESH_SERVERS_EVENT, handler);
}
