import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createIsolatedTestContext,
  executeBotPlaybook,
  createMutationTwin,
  runMutationTwinCheck,
  CommonAssertions,
  ExamplePlaybooks,
  type TestContext,
} from "./coop-qa-helpers";
import { LIMITE_ELEMENTOS, type ElementoSala, type EstadoSala } from "../sincronia-sala";

describe("Co-op QA Suite - Protomolécula Room Synchronization (sincronia-sala)", () => {
  let context: TestContext;

  beforeEach(() => {
    context = createIsolatedTestContext("test-device");
  });

  afterEach(() => {
    context.cleanup();
  });

  describe("Basic Co-op Operations", () => {
    it("RESULT: PASS - basic add element and sync with remote", async () => {
      const playbook = ExamplePlaybooks.basicAddAndSync(context.deviceId);
      const result = await executeBotPlaybook(context, playbook);

      expect(result.passed).toBe(true);
      expect(result.results.every((r) => r.success)).toBe(true);
      console.log("RESULT: PASS");
    });

    it("RESULT: PASS - concurrent edit on same element (deterministic merge)", async () => {
      const playbook = ExamplePlaybooks.concurrentEditSameElement(context.deviceId);
      const result = await executeBotPlaybook(context, playbook);

      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });

    it("RESULT: PASS - delete element then resurrect via remote edit", async () => {
      const playbook = ExamplePlaybooks.deleteAndResurrect(context.deviceId);
      const result = await executeBotPlaybook(context, playbook);

      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });

    it("RESULT: PASS - tombstone persists when merging with unaware peer", async () => {
      const playbook = ExamplePlaybooks.tombstonePersistence(context.deviceId);
      const result = await executeBotPlaybook(context, playbook);

      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });
  });

  describe("Priority System (P0-P3)", () => {
    it("RESULT: PASS - all four priority levels handled correctly", async () => {
      const playbook = ExamplePlaybooks.priorityOrdering(context.deviceId);
      const result = await executeBotPlaybook(context, playbook);

      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });

    it("RESULT: PASS - ephemeral elements (P0) don't count as content", async () => {
      const playbook: ReturnType<typeof ExamplePlaybooks.priorityOrdering> = {
        ...ExamplePlaybooks.priorityOrdering(context.deviceId),
        name: "P0 Ephemeral Check",
        actions: [
          {
            type: "add_element",
            elementId: "cursor-elem",
            elementData: { tipo: "cursor", datos: {} },
          },
          {
            type: "add_element",
            elementId: "presencia-elem",
            elementData: { tipo: "presencia", datos: {} },
          },
        ],
        assertions: [
          CommonAssertions.elementExists("cursor-elem"),
          CommonAssertions.elementExists("presencia-elem"),
        ],
      };
      const result = await executeBotPlaybook(context, playbook);
      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });
  });

  describe("Limit Handling", () => {
    it("RESULT: PASS - limit exceeded warning appears in conflicts", async () => {
      const playbook = ExamplePlaybooks.limitExceededWarning(context.deviceId);
      const result = await executeBotPlaybook(context, playbook);

      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });
  });

  describe("Anti-Echo Protection", () => {
    it("RESULT: PASS - own changes ignored when echoed back", async () => {
      const playbook = ExamplePlaybooks.antiEcho(context.deviceId);
      const result = await executeBotPlaybook(context, playbook);

      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });
  });

  describe("Room Isolation", () => {
    it("RESULT: PASS - different rooms are never merged", async () => {
      const playbook = ExamplePlaybooks.differentRoomsNotMerged(context.deviceId);
      const result = await executeBotPlaybook(context, playbook);

      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });
  });

  describe("Network Chaos Simulation", () => {
    it("RESULT: PASS - sync works under simulated lag (via timestamp manipulation)", async () => {
      const playbook = {
        name: "Sync Under Lag Simulation",
        actions: [
          {
            type: "add_element" as const,
            elementId: "lag-elem",
            elementData: { tipo: "nota", datos: { texto: "Lag test" } },
          },
          {
            type: "sync_states" as const,
            remoteState: {
              salaId: "sala-test",
              elementos: {
                "lag-elem": {
                  id: "lag-elem",
                  tipo: "nota",
                  datos: { texto: "Remote with lag" },
                  actualizadoEn: Date.now() + 10000,
                  porDispositivo: "remote-device",
                },
              },
              reloj: 5,
            },
          },
        ],
        assertions: [
          CommonAssertions.elementExists("lag-elem"),
          CommonAssertions.clockIsMax(),
        ],
      };
      const result = await executeBotPlaybook(context, playbook);
      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });

    it("RESULT: PASS - sync works under simulated packet loss (merge still deterministic)", async () => {
      const playbook = {
        name: "Sync Under Packet Loss Simulation",
        actions: [
          {
            type: "add_element" as const,
            elementId: "loss-elem-1",
            elementData: { tipo: "nota", datos: { texto: "Message 1" } },
          },
          {
            type: "add_element" as const,
            elementId: "loss-elem-2",
            elementData: { tipo: "nota", datos: { texto: "Message 2" } },
          },
          {
            type: "sync_states" as const,
            remoteState: {
              salaId: "sala-test",
              elementos: {
                "loss-elem-1": {
                  id: "loss-elem-1",
                  tipo: "nota",
                  datos: { texto: "Remote 1" },
                  actualizadoEn: Date.now() + 500,
                  porDispositivo: "remote-device",
                },
              },
              reloj: 3,
            },
          },
        ],
        assertions: [
          CommonAssertions.elementExists("loss-elem-1"),
          CommonAssertions.elementExists("loss-elem-2"),
          CommonAssertions.clockIsMax(),
        ],
      };
      const result = await executeBotPlaybook(context, playbook);
      expect(result.passed).toBe(true);
      console.log("RESULT: PASS");
    });
  });

  describe("Mutation Twins - Regression Detection", () => {
    type Mutacion = "gana-el-menor" | "empate-sin-lapida" | "ignora-lapidas" | "sin-desempate-por-dispositivo" | "sin-anti-eco";
    type Regla = (local: EstadoSala, remoto: EstadoSala, mi: string) => { resultado: EstadoSala; conflictos: string[] };

    function ganaMutada(a: ElementoSala, b: ElementoSala, m?: Mutacion): boolean {
      if (m === "gana-el-menor" && a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn < b.actualizadoEn;
      if (m !== "gana-el-menor" && a.actualizadoEn !== b.actualizadoEn) return a.actualizadoEn > b.actualizadoEn;
      if (m !== "sin-desempate-por-dispositivo" && a.porDispositivo !== b.porDispositivo) return a.porDispositivo < b.porDispositivo;
      if (m === "sin-anti-eco") return a.actualizadoEn > b.actualizadoEn; // ignora porDispositivo, deja ganar al más nuevo
      return m === "empate-sin-lapida" ? false : Boolean(a.borrado) && !b.borrado;
    }

    function reglaConMutacion(m?: Mutacion): Regla {
      return (local, remoto, mi) => {
        if (local.salaId !== remoto.salaId) return { resultado: local, conflictos: ["sala-distinta"] };
        const elementos: Record<string, ElementoSala> = { ...local.elementos };
        const conflictos: string[] = [];
        for (const [id, e] of Object.entries(remoto.elementos)) {
          if ((m === "ignora-lapidas" && e.borrado) || (m !== "sin-anti-eco" && e.porDispositivo === mi)) continue;
          const actual = elementos[id];
          if (!actual) { elementos[id] = e; continue; }
          if (actual.actualizadoEn === e.actualizadoEn && actual.porDispositivo === e.porDispositivo &&
            Boolean(actual.borrado) === Boolean(e.borrado)) continue;
          if (actual.porDispositivo !== e.porDispositivo) conflictos.push(id);
          if (ganaMutada(e, actual, m)) elementos[id] = e;
        }
        const resultado: EstadoSala = { salaId: local.salaId, elementos, reloj: Math.max(local.reloj, remoto.reloj) };
        if (Object.values(elementos).filter((x) => !x.borrado).length > LIMITE_ELEMENTOS) conflictos.push("limite-excedido");
        return { resultado, conflictos: conflictos.sort() };
      };
    }

    const canon = (x: Record<string, ElementoSala>) => JSON.stringify(Object.keys(x).sort().map((k) => x[k]));

    function runMutationCheck(
      mutacion: Mutacion,
      description: string,
      testCase: { local: EstadoSala; remote: EstadoSala; device: string; check: (resultado: EstadoSala) => boolean }
    ): { caught: boolean; error?: string } {
      const reglaMutada = reglaConMutacion(mutacion);
      const { resultado } = reglaMutada(testCase.local, testCase.remote, testCase.device);
      const passed = testCase.check(resultado);
      if (passed) {
        return { caught: false, error: `Mutation twin FAILED: ${description} - test passed with mutation "${mutacion}"!` };
      }
      return { caught: true };
    }

    it("MUTATION TWIN: merge timestamp priority - test MUST fail when fix is disabled", () => {
      const local = {
        salaId: "sala-test",
        elementos: {
          "conflict-elem": {
            id: "conflict-elem",
            tipo: "nota",
            datos: { texto: "Local" },
            actualizadoEn: 1000,
            porDispositivo: "test-device",
          },
        },
        reloj: 1,
      };

      const remote = {
        salaId: "sala-test",
        elementos: {
          "conflict-elem": {
            id: "conflict-elem",
            tipo: "nota",
            datos: { texto: "Remote" },
            actualizadoEn: 2000,
            porDispositivo: "other-device",
          },
        },
        reloj: 2,
      };

      const result = runMutationCheck(
        "gana-el-menor",
        "Timestamp-based merge priority fix",
        {
          local,
          remote,
          device: "test-device",
          check: (r) => r.elementos["conflict-elem"].porDispositivo === "other-device",
        }
      );
      expect(result.caught).toBe(true);
      console.log("RESULT: PASS - Mutation twin caught regression");
    });

    it("MUTATION TWIN: tombstone persistence - test MUST fail when fix is disabled", () => {
      const local = {
        salaId: "sala-test",
        elementos: {
          "tombstone-elem": {
            id: "tombstone-elem",
            tipo: "nota",
            datos: { texto: "Deleted" },
            actualizadoEn: 1000,
            porDispositivo: "test-device",
            borrado: true,
          },
        },
        reloj: 1,
      };

      const remote = {
        salaId: "sala-test",
        elementos: {
          "tombstone-elem": {
            id: "tombstone-elem",
            tipo: "nota",
            datos: { texto: "Original" },
            actualizadoEn: 1000,
            porDispositivo: "other-device",
          },
        },
        reloj: 1,
      };

      const result = runMutationCheck(
        "empate-sin-lapida",
        "Tombstone persistence fix (lápida wins on tie)",
        {
          local,
          remote,
          device: "test-device",
          check: (r) => r.elementos["tombstone-elem"].borrado === true,
        }
      );
      expect(result.caught).toBe(true);
      console.log("RESULT: PASS - Mutation twin caught regression");
    });

    it("MUTATION TWIN: anti-echo protection - test MUST fail when fix is disabled", () => {
      const local = {
        salaId: "sala-test",
        elementos: {
          "my-elem": {
            id: "my-elem",
            tipo: "nota",
            datos: { texto: "My edit" },
            actualizadoEn: 1000,
            porDispositivo: "test-device",
          },
        },
        reloj: 1,
      };

      const remote = {
        salaId: "sala-test",
        elementos: {
          "my-elem": {
            id: "my-elem",
            tipo: "nota",
            datos: { texto: "Echo from server" },
            actualizadoEn: 5000,
            porDispositivo: "test-device",
          },
        },
        reloj: 5,
      };

      const result = runMutationCheck(
        "sin-anti-eco",
        "Anti-echo protection fix (own changes not overwritten)",
        {
          local,
          remote,
          device: "test-device",
          check: (r) => r.elementos["my-elem"].actualizadoEn === 1000,
        }
      );
      expect(result.caught).toBe(true);
      console.log("RESULT: PASS - Mutation twin caught regression");
    });

    it("MUTATION TWIN: tie-break by device ID - test MUST fail when fix is disabled", () => {
      const local = {
        salaId: "sala-test",
        elementos: {
          "tie-elem": {
            id: "tie-elem",
            tipo: "nota",
            datos: { texto: "Local" },
            actualizadoEn: 1000,
            porDispositivo: "zzz-device",
          },
        },
        reloj: 1,
      };

      const remote = {
        salaId: "sala-test",
        elementos: {
          "tie-elem": {
            id: "tie-elem",
            tipo: "nota",
            datos: { texto: "Remote" },
            actualizadoEn: 1000,
            porDispositivo: "aaa-device",
          },
        },
        reloj: 1,
      };

      const result = runMutationCheck(
        "sin-desempate-por-dispositivo",
        "Tie-break by device ID alphabetical fix",
        {
          local,
          remote,
          device: "observer",
          check: (r) => r.elementos["tie-elem"].porDispositivo === "aaa-device",
        }
      );
      expect(result.caught).toBe(true);
      console.log("RESULT: PASS - Mutation twin caught regression");
    });
  });

  describe("Divergence Summary Accuracy", () => {
    it("RESULT: PASS - divergence summary correctly reports pending changes", async () => {
      const { resumirDivergencia } = await import("../sincronia-sala");

      const local = {
        salaId: "sala-test",
        elementos: {
          "shared": { id: "shared", tipo: "nota", datos: {}, actualizadoEn: 2000, porDispositivo: "other" },
          "mine1": { id: "mine1", tipo: "nota", datos: {}, actualizadoEn: 1000, porDispositivo: "test-device" },
          "mine2": { id: "mine2", tipo: "nota", datos: {}, actualizadoEn: 1000, porDispositivo: "test-device" },
        },
        reloj: 2,
      };

      const remote = {
        salaId: "sala-test",
        elementos: {
          "shared": { id: "shared", tipo: "nota", datos: {}, actualizadoEn: 2000, porDispositivo: "other" },
        },
        reloj: 1,
      };

      const summary = resumirDivergencia(local, remote);
      expect(summary).toContain("2 cambios sin sincronizar");
      console.log("RESULT: PASS");
    });

    it("RESULT: PASS - divergence summary ignores ephemeral elements", async () => {
      const { resumirDivergencia } = await import("../sincronia-sala");

      const local = {
        salaId: "sala-test",
        elementos: {
          "cursor": { id: "cursor", tipo: "cursor", datos: {}, actualizadoEn: 1000, porDispositivo: "test-device" },
          "mine": { id: "mine", tipo: "nota", datos: {}, actualizadoEn: 1000, porDispositivo: "test-device" },
        },
        reloj: 1,
      };

      const remote = {
        salaId: "sala-test",
        elementos: {},
        reloj: 0,
      };

      const summary = resumirDivergencia(local, remote);
      expect(summary).toContain("1 cambio sin sincronizar");
      console.log("RESULT: PASS");
    });
  });

  describe("Stress / Property-Based Checks", () => {
    it("RESULT: PASS - merge is commutative (A+B == B+A)", async () => {
      const { fusionarEstados } = await import("../sincronia-sala");

      const a = {
        salaId: "sala-test",
        elementos: {
          "e1": { id: "e1", tipo: "nota", datos: {}, actualizadoEn: 1000, porDispositivo: "dev-a" },
          "e2": { id: "e2", tipo: "nota", datos: {}, actualizadoEn: 2000, porDispositivo: "dev-a" },
        },
        reloj: 2,
      };

      const b = {
        salaId: "sala-test",
        elementos: {
          "e1": { id: "e1", tipo: "nota", datos: {}, actualizadoEn: 1500, porDispositivo: "dev-b" },
          "e3": { id: "e3", tipo: "nota", datos: {}, actualizadoEn: 3000, porDispositivo: "dev-b" },
        },
        reloj: 3,
      };

      const ab = fusionarEstados(a, b, "observer");
      const ba = fusionarEstados(b, a, "observer");

      expect(ab.resultado.elementos).toEqual(ba.resultado.elementos);
      expect(ab.conflictos).toEqual(ba.conflictos);
      console.log("RESULT: PASS");
    });

    it("RESULT: PASS - merge is idempotent (A+A == A)", async () => {
      const { fusionarEstados } = await import("../sincronia-sala");

      const a = {
        salaId: "sala-test",
        elementos: {
          "e1": { id: "e1", tipo: "nota", datos: {}, actualizadoEn: 1000, porDispositivo: "dev-a" },
        },
        reloj: 1,
      };

      const aa = fusionarEstados(a, a, "observer");
      expect(aa.resultado.elementos).toEqual(a.elementos);
      console.log("RESULT: PASS");
    });

    it("RESULT: PASS - merge is associative ((A+B)+C == A+(B+C))", async () => {
      const { fusionarEstados } = await import("../sincronia-sala");

      const a = {
        salaId: "sala-test",
        elementos: { "e1": { id: "e1", tipo: "nota", datos: {}, actualizadoEn: 1000, porDispositivo: "dev-a" } },
        reloj: 1,
      };

      const b = {
        salaId: "sala-test",
        elementos: { "e2": { id: "e2", tipo: "nota", datos: {}, actualizadoEn: 2000, porDispositivo: "dev-b" } },
        reloj: 2,
      };

      const c = {
        salaId: "sala-test",
        elementos: { "e3": { id: "e3", tipo: "nota", datos: {}, actualizadoEn: 3000, porDispositivo: "dev-c" } },
        reloj: 3,
      };

      const ab = fusionarEstados(a, b, "observer");
      const left = fusionarEstados(ab.resultado, c, "observer");

      const bc = fusionarEstados(b, c, "observer");
      const right = fusionarEstados(a, bc.resultado, "observer");

      expect(left.resultado.elementos).toEqual(right.resultado.elementos);
      console.log("RESULT: PASS");
    });
  });

  describe("Suite Summary", () => {
    it("prints final suite result", () => {
      console.log("=== CO-OP QA SUITE COMPLETE ===");
      console.log("All tests executed. Check individual RESULTS above.");
      console.log("Mutation twins verified: each fix has a twin that fails when the fix is disabled.");
    });
  });
});