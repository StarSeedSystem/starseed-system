import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fusionarEstados,
  prioridadDeElemento,
  resumirDivergencia,
  excedeLimite,
  LIMITE_ELEMENTOS,
  type ElementoSala,
  type EstadoSala,
} from "../sincronia-sala";

export interface TestContext {
  deviceId: string;
  cleanup: () => void;
}

export type BotAction =
  | { type: "add_element" | "update_element" | "delete_element"; elementId: string; elementData?: Partial<ElementoSala> }
  | { type: "sync_states"; remoteState: EstadoSala; expectedConflicts?: string[] };

export interface BotPlaybook {
  name: string;
  actions: BotAction[];
  assertions: SharedStateAssertion[];
}

export interface SharedStateAssertion {
  description: string;
  check: (local: EstadoSala, remote: EstadoSala, merged: EstadoSala) => boolean;
  expected: boolean;
}

export interface MutationTwin {
  fixDescription: string;
  disabledFix: () => void;
  enabledFix: () => void;
  testThatMustFail: () => Promise<void>;
}

const T = 1_757_000_000_000;
const DEVICES = ["movil-ana", "portatil-bruno", "tablet-carla", "desktop-david"] as const;

function createElement(
  id: string,
  device: string,
  timestamp: number,
  extra: Partial<ElementoSala> = {}
): ElementoSala {
  return {
    id,
    tipo: "nota",
    datos: { texto: `${id}@${device}` },
    actualizadoEn: timestamp,
    porDispositivo: device,
    ...extra,
  };
}

function createState(elements: ElementoSala[], clock = 1, roomId = "sala-test"): EstadoSala {
  const mapa: Record<string, ElementoSala> = {};
  for (const e of elements) mapa[e.id] = e;
  return { salaId: roomId, elementos: mapa, reloj: clock };
}

export function createIsolatedTestContext(deviceId: string = "test-device"): TestContext {
  return {
    deviceId,
    cleanup: () => {},
  };
}

export async function executeBotPlaybook(
  context: TestContext,
  playbook: BotPlaybook
): Promise<{ passed: boolean; results: Array<{ action: BotAction; success: boolean; error?: string }> }> {
  let localState = createState([]);
  let remoteState = createState([]);

  const results: Array<{ action: BotAction; success: boolean; error?: string }> = [];

  for (const action of playbook.actions) {
    try {
      let success = false;

      switch (action.type) {
        case "add_element": {
          if (!action.elementData) throw new Error("elementData required for add_element");
          const element = createElement(
            action.elementId,
            context.deviceId,
            T + Date.now(),
            action.elementData
          );
          localState = {
            ...localState,
            elementos: { ...localState.elementos, [action.elementId]: element },
            reloj: localState.reloj + 1,
          };
          success = true;
          break;
        }
        case "update_element": {
          const existing = localState.elementos[action.elementId];
          if (!existing) throw new Error(`Element ${action.elementId} not found`);
          const updated = { ...existing, ...action.elementData, actualizadoEn: T + Date.now() };
          localState = {
            ...localState,
            elementos: { ...localState.elementos, [action.elementId]: updated },
            reloj: localState.reloj + 1,
          };
          success = true;
          break;
        }
        case "delete_element": {
          const existing = localState.elementos[action.elementId];
          if (!existing) throw new Error(`Element ${action.elementId} not found`);
          const deleted = { ...existing, borrado: true, actualizadoEn: T + Date.now() };
          localState = {
            ...localState,
            elementos: { ...localState.elementos, [action.elementId]: deleted },
            reloj: localState.reloj + 1,
          };
          success = true;
          break;
        }
        case "sync_states": {
          if (!action.remoteState) throw new Error("remoteState required for sync_states");
          remoteState = action.remoteState;
          const { resultado, conflictos } = fusionarEstados(localState, remoteState, context.deviceId);
          localState = resultado;
          if (action.expectedConflicts) {
            const conflictsMatch = action.expectedConflicts.every((c) => conflictos.includes(c));
            if (!conflictsMatch) throw new Error(`Expected conflicts ${action.expectedConflicts}, got ${conflictos}`);
          }
          success = true;
          break;
        }
      }
      results.push({ action, success: true });
    } catch (error) {
      results.push({ action, success: false, error: String(error) });
    }
  }

  let allAssertionsPassed = true;
  for (const assertion of playbook.assertions) {
    const passed = assertion.check(localState, remoteState, localState);
    if (passed !== assertion.expected) {
      allAssertionsPassed = false;
      console.error(`ASSERTION FAILED: ${assertion.description}`);
    }
  }

  return { passed: allAssertionsPassed && results.every((r) => r.success), results };
}

export function injectNetworkChaos(
  context: TestContext,
  options: { lagMs?: number; lossPercent?: number; reorder?: boolean }
): () => void {
  const originalFetch = global.fetch;
  const { lagMs = 0, lossPercent = 0, reorder = false } = options;

  global.fetch = vi.fn(async (input, init) => {
    if (lossPercent > 0 && Math.random() * 100 < lossPercent) {
      throw new Error("Network error: simulated packet loss");
    }
    if (lagMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, lagMs));
    }
    return originalFetch(input, init);
  });

  return () => {
    global.fetch = originalFetch;
  };
}

export function createMutationTwin(
  description: string,
  disableFix: () => void,
  enableFix: () => void,
  testFn: () => Promise<void>
): MutationTwin {
  return {
    fixDescription: description,
    disabledFix: disableFix,
    enabledFix: enableFix,
    testThatMustFail: testFn,
  };
}

export async function runMutationTwinCheck(
  _context: TestContext,
  twin: MutationTwin
): Promise<{ caught: boolean; error?: string }> {
  twin.disabledFix();
  try {
    await twin.testThatMustFail();
    twin.enabledFix();
    return { caught: false, error: "Mutation twin FAILED: test passed with fix disabled!" };
  } catch (error) {
    twin.enabledFix();
    return { caught: true };
  }
}

export const CommonAssertions = {
  statesAreEqual: (): SharedStateAssertion => ({
    description: "Local and remote states are equal after merge",
    check: (local: EstadoSala, remote: EstadoSala) => {
      const localKeys = Object.keys(local.elementos).sort();
      const remoteKeys = Object.keys(remote.elementos).sort();
      return JSON.stringify(localKeys) === JSON.stringify(remoteKeys);
    },
    expected: true,
  }),

  elementExists: (elementId: string, shouldExist: boolean = true): SharedStateAssertion => ({
    description: `Element ${elementId} ${shouldExist ? "exists" : "does not exist"}`,
    check: (local: EstadoSala) => {
      return (elementId in local.elementos) === shouldExist;
    },
    expected: true,
  }),

  elementIsDeleted: (elementId: string): SharedStateAssertion => ({
    description: `Element ${elementId} is marked as deleted (lápida)`,
    check: (local: EstadoSala) => {
      return local.elementos[elementId]?.borrado === true;
    },
    expected: true,
  }),

  noConflictsReported: (): SharedStateAssertion => ({
    description: "No unexpected conflicts reported",
    check: (_local: EstadoSala, _remote: EstadoSala, merged: EstadoSala) => {
      return !Object.keys(merged.elementos).some((k) => k.startsWith("conflict-"));
    },
    expected: true,
  }),

  clockIsMax: (): SharedStateAssertion => ({
    description: "Merged clock is max of both clocks",
    check: (local: EstadoSala, remote: EstadoSala, merged: EstadoSala) => {
      return merged.reloj === Math.max(local.reloj, remote.reloj);
    },
    expected: true,
  }),

  divergenceResummarized: (expectedText: string): SharedStateAssertion => ({
    description: `Divergence summary matches: ${expectedText}`,
    check: (local: EstadoSala, remote: EstadoSala) => {
      const summary = resumirDivergencia(local, remote);
      return summary === expectedText;
    },
    expected: true,
  }),
};

export const ExamplePlaybooks = {
  basicAddAndSync: (deviceId: string): BotPlaybook => ({
    name: "Basic Add Element and Sync",
    actions: [
      {
        type: "add_element",
        elementId: "elem-1",
        elementData: { tipo: "nota", datos: { texto: "Hola" } },
      },
      {
        type: "sync_states",
        remoteState: createState([
          createElement("elem-1", "other-device", T + 100, { tipo: "nota", datos: { texto: "Hola" } }),
        ]),
      },
    ],
    assertions: [
      CommonAssertions.elementExists("elem-1"),
      CommonAssertions.clockIsMax(),
      CommonAssertions.noConflictsReported(),
    ],
  }),

  concurrentEditSameElement: (deviceId: string): BotPlaybook => ({
    name: "Concurrent Edit - Same Element",
    actions: [
      {
        type: "add_element",
        elementId: "shared-elem",
        elementData: { tipo: "nota", datos: { texto: "Original" } },
      },
      {
        type: "sync_states",
        remoteState: createState([
          createElement("shared-elem", "other-device", T + 1000, { tipo: "nota", datos: { texto: "Remote edit" } }),
        ]),
      },
    ],
    assertions: [
      CommonAssertions.elementExists("shared-elem"),
      CommonAssertions.clockIsMax(),
    ],
  }),

  deleteAndResurrect: (deviceId: string): BotPlaybook => ({
    name: "Delete Element then Resurrect via Edit",
    actions: [
      {
        type: "add_element",
        elementId: "elem-to-delete",
        elementData: { tipo: "nota", datos: { texto: "Will be deleted" } },
      },
      {
        type: "delete_element",
        elementId: "elem-to-delete",
      },
      {
        type: "sync_states",
        remoteState: createState([
          createElement("elem-to-delete", "other-device", T + 2000, { tipo: "nota", datos: { texto: "Resurrected!" } }),
        ]),
      },
    ],
    assertions: [
      CommonAssertions.elementExists("elem-to-delete"),
      CommonAssertions.clockIsMax(),
    ],
  }),

  tombstonePersistence: (deviceId: string): BotPlaybook => ({
    name: "Tombstone Persists When Merging with Unaware Peer",
    actions: [
      {
        type: "add_element",
        elementId: "tombstone-elem",
        elementData: { tipo: "nota", datos: { texto: "Will be tombstoned" } },
      },
      {
        type: "delete_element",
        elementId: "tombstone-elem",
      },
      {
        type: "sync_states",
        remoteState: createState([
          createElement("tombstone-elem", "other-device", T, { tipo: "nota", datos: { texto: "Original" } }),
        ]),
      },
    ],
    assertions: [
      CommonAssertions.elementIsDeleted("tombstone-elem"),
      CommonAssertions.clockIsMax(),
    ],
  }),

  priorityOrdering: (deviceId: string): BotPlaybook => ({
    name: "Priority Ordering P0-P3",
    actions: [
      {
        type: "add_element",
        elementId: "p0-cursor",
        elementData: { tipo: "cursor", datos: {} },
      },
      {
        type: "add_element",
        elementId: "p1-nota",
        elementData: { tipo: "nota", datos: { texto: "Content" } },
      },
      {
        type: "add_element",
        elementId: "p2-posicion",
        elementData: { tipo: "posicion", datos: { x: 10, y: 20 } },
      },
      {
        type: "add_element",
        elementId: "p3-historial",
        elementData: { tipo: "historial", datos: {} },
      },
    ],
    assertions: [
      CommonAssertions.elementExists("p0-cursor"),
      CommonAssertions.elementExists("p1-nota"),
      CommonAssertions.elementExists("p2-posicion"),
      CommonAssertions.elementExists("p3-historial"),
    ],
  }),

  limitExceededWarning: (deviceId: string): BotPlaybook => ({
    name: "Limit Exceeded Conflict Warning",
    actions: [
      {
        type: "sync_states",
        remoteState: createState(
          Array.from({ length: LIMITE_ELEMENTOS + 1 }, (_, i) =>
            createElement(`elem-${i}`, "other-device", T + i, { tipo: "nota" })
          )
        ),
      },
    ],
    assertions: [
      CommonAssertions.noConflictsReported(),
    ],
  }),

  antiEcho: (deviceId: string): BotPlaybook => ({
    name: "Anti-Echo: Own Changes Ignored on Return",
    actions: [
      {
        type: "add_element",
        elementId: "my-elem",
        elementData: { tipo: "nota", datos: { texto: "My edit" } },
      },
      {
        type: "sync_states",
        remoteState: createState([
          createElement("my-elem", deviceId, T + 5000, { tipo: "nota", datos: { texto: "Echo from server" } }),
        ]),
      },
    ],
    assertions: [
      CommonAssertions.elementExists("my-elem"),
      CommonAssertions.clockIsMax(),
    ],
  }),

  differentRoomsNotMerged: (deviceId: string): BotPlaybook => ({
    name: "Different Rooms Not Merged",
    actions: [
      {
        type: "add_element",
        elementId: "elem-room-a",
        elementData: { tipo: "nota", datos: { texto: "Room A" } },
      },
      {
        type: "sync_states",
        remoteState: createState(
          [createElement("elem-room-b", "other-device", T, { tipo: "nota", datos: { texto: "Room B" } })],
          1,
          "sala-diferente"
        ),
      },
    ],
    assertions: [
      CommonAssertions.elementExists("elem-room-a"),
    ],
  }),
};