/**
 * StarSeed OS — Red Mesh · STORE GLOBAL (Adenda 97 · SOP §8).
 * ============================================================================
 * Gestor de estado global del subsistema mesh, patrón de la casa (singleton +
 * suscripción + evento DOM), con API estilo zustand (`getState`/`setState`/
 * `subscribe`) para que la UI use `useSyncExternalStore` (ver use-mesh.ts) sin
 * añadir dependencias nuevas al bundle.
 *
 * SSR-safe: el estado inicial se construye sin tocar window; los eventos DOM
 * solo se emiten si window existe. NUNCA lanza.
 */

import {
  DECISION_HISTORY_LIMIT,
  initialBudget,
  MESH_STATE_EVENT,
} from "./constants";
import type {
  LinkHealth,
  MeshNodeInfo,
  MeshState,
  MeshTopologyEdge,
  RouteDecision,
  TrafficClass,
} from "./types";

type Listener = (state: MeshState) => void;

function now(): number {
  return Date.now();
}

function initialHealth(detail: string): LinkHealth {
  return { score: 0, detail, at: 0 };
}

function initialState(): MeshState {
  return {
    status: "disconnected",
    transport: null,
    nodes: [],
    edges: [],
    wifiHealth: initialHealth("sin medir"),
    meshHealth: initialHealth("sin radio"),
    decisions: [],
    queue: { pending: 0, byClass: { P0: 0, P1: 0, P2: 0, P3: 0 } },
    budget: initialBudget(),
    region: "UNSET",
    updatedAt: 0,
  };
}

let state: MeshState = initialState();
const listeners = new Set<Listener>();

/** Notifica a los suscriptores + emite el evento DOM (para superficies sueltas). */
function notify(): void {
  for (const l of listeners) {
    try {
      l(state);
    } catch {
      /* un listener roto no tumba al resto */
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(MESH_STATE_EVENT, { detail: { at: state.updatedAt } }));
    } catch {
      /* */
    }
  }
}

/** Lee el estado actual (referencia INMUTABLE: cada set crea un objeto nuevo). */
export function getMeshState(): MeshState {
  return state;
}

/** Mezcla un parche y notifica. Nunca lanza. */
export function setMeshState(patch: Partial<MeshState>): void {
  try {
    state = { ...state, ...patch, updatedAt: now() };
    notify();
  } catch {
    /* */
  }
}

/** Suscripción (devuelve unsubscribe) — contrato de useSyncExternalStore. */
export function subscribeMeshState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ── Mutadores de dominio (mantienen las invariantes del estado) ───────────── */

/** Inserta/actualiza un nodo por `num` (merge parcial; conserva lo conocido). */
export function upsertMeshNode(partial: Partial<MeshNodeInfo> & { num: number }): void {
  try {
    const nodes = state.nodes.slice();
    const i = nodes.findIndex((n) => n.num === partial.num);
    if (i >= 0) {
      nodes[i] = { ...nodes[i], ...partial, lastHeard: partial.lastHeard ?? now(), presence: "online" };
    } else {
      nodes.push({ presence: "online", ...partial, lastHeard: partial.lastHeard ?? now() });
    }
    // Orden estable: self primero, luego favoritos, luego por lastHeard desc.
    nodes.sort((a, b) => {
      if (!!a.isSelf !== !!b.isSelf) return a.isSelf ? -1 : 1;
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
      return b.lastHeard - a.lastHeard;
    });
    setMeshState({ nodes, self: nodes.find((n) => n.isSelf) ?? state.self });
  } catch {
    /* */
  }
}

/** Reemplaza la lista de nodos (sweep de presencia de discovery.ts). */
export function replaceMeshNodes(nodes: MeshNodeInfo[]): void {
  setMeshState({ nodes, self: nodes.find((n) => n.isSelf) ?? state.self });
}

/** Registra una arista de topología (dedupe por par from→to). */
export function upsertMeshEdge(edge: MeshTopologyEdge): void {
  try {
    const edges = state.edges.filter((e) => !(e.from === edge.from && e.to === edge.to));
    edges.push(edge);
    // Tope sano para la UI (las aristas viejas caducan por sweep).
    while (edges.length > 400) edges.shift();
    setMeshState({ edges });
  } catch {
    /* */
  }
}

/** Añade una decisión al historial (tope DECISION_HISTORY_LIMIT). */
export function pushRouteDecision(d: RouteDecision): void {
  try {
    const decisions = [d, ...state.decisions].slice(0, DECISION_HISTORY_LIMIT);
    setMeshState({ decisions });
  } catch {
    /* */
  }
}

/** Actualiza los contadores de la cola (los publica sync.ts). */
export function setQueueCounts(pending: number, byClass: Record<TrafficClass, number>): void {
  setMeshState({ queue: { pending, byClass } });
}

/** Resetea todo (pruebas). */
export function resetMeshState(): void {
  state = initialState();
  notify();
}

/**
 * Resetea SOLO lo relativo al radio (desconexión limpia), CONSERVANDO la salud
 * Wi-Fi ya medida y el presupuesto de airtime. Antes `resetMeshState()` borraba
 * `wifiHealth` (score→0, at→0) al desconectar, y como el suscriptor de index.ts
 * ignora `at===0`, la salud Wi-Fi quedaba en "midiendo…" hasta la próxima sonda
 * (hasta 60 s). Ahora la Wi-Fi ni se entera de que se soltó el radio.
 */
export function resetMeshRadio(): void {
  const fresh = initialState();
  state = {
    ...fresh,
    wifiHealth: state.wifiHealth,
    budget: state.budget,
    region: state.region,
    updatedAt: now(),
  };
  notify();
}
