// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// CON1011B: una sincronización aplicada NO es un recuerdo. Antes, cada
// `starseed:sync:apply` acababa en un GET + PATCH a `brain_memory_files`, y esa
// escritura volvía a sincronizarse: ~2.900 peticiones/día con la pestaña quieta.

const llamadas = { list: 0, write: [] as string[] };

vi.mock("@/ai/astraura/router", () => ({
  astrauraChat: vi.fn(async () => ({ text: "- algo nuevo" })),
}));
vi.mock("@/lib/brains/brains", () => ({
  listBrains: vi.fn(async () => [{ id: "b1", name: "Cerebro", config: {} }]),
  saveBrain: vi.fn(),
}));
vi.mock("@/lib/brains/memory-offline", () => ({
  writeMemoryContentResilient: vi.fn(async (_f: unknown, content: string) => {
    llamadas.write.push(content);
    return { synced: true };
  }),
  startOfflineSync: vi.fn(),
}));
vi.mock("@/lib/cerebro/memory-files", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/cerebro/memory-files")>();
  return {
    ...real,
    listMemoryFiles: vi.fn(async (brainId: string) => {
      llamadas.list += 1;
      return [
        {
          id: "f-memory", brain_id: brainId, name: "memory.md", content: "# memory",
          source: "starseed", server_config: {}, meta: {}, sync: false,
        },
      ];
    }),
    saveMemoryFile: vi.fn(async () => null),
  };
});

import {
  autoUpdate,
  isMemorySyncKey,
  startMemoryIntelligenceAutoUpdate,
  stopMemoryIntelligenceAutoUpdate,
} from "../memory-intelligence";
import { _reiniciarEscriturasMemoria } from "@/lib/cerebro/memory-files";
import { AURORA_CONVERSATION_EVENT } from "@/lib/aurora/aurora-orb-bus";

async function esperarFlush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(9_000);
}

beforeEach(() => {
  vi.useFakeTimers();
  llamadas.list = 0;
  llamadas.write = [];
  _reiniciarEscriturasMemoria();
  startMemoryIntelligenceAutoUpdate();
});
afterEach(() => {
  stopMemoryIntelligenceAutoUpdate();
  vi.useRealTimers();
});

describe("memory-intelligence · sincronización", () => {
  it("20 eventos starseed:sync:apply seguidos → 0 lecturas y 0 escrituras", async () => {
    for (let i = 0; i < 20; i++) {
      window.dispatchEvent(
        new CustomEvent("starseed:sync:apply", {
          detail: { keys: ["starseed.brain.b1.memory", "starseed.dock.items.v2"], fromDevice: "otro" },
        }),
      );
      await vi.advanceTimersByTimeAsync(60_000);
    }
    await esperarFlush();
    expect(llamadas.write).toHaveLength(0);
    expect(llamadas.list).toBe(0);
  });

  it("un recuerdo nuevo de verdad sí se guarda", async () => {
    window.dispatchEvent(
      new CustomEvent(AURORA_CONVERSATION_EVENT, { detail: { role: "user", text: "Me encanta el jazz de los años cincuenta" } }),
    );
    await esperarFlush();
    expect(llamadas.write).toHaveLength(1);
    expect(llamadas.write[0]).toContain("- algo nuevo");
  });

  it("varios recuerdos seguidos: una lectura y como mucho una escritura cada 5 min", async () => {
    for (let i = 0; i < 6; i++) {
      autoUpdate({ source: "aurora", text: `Usuario: dato ${i}` });
      await esperarFlush();
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(llamadas.list).toBe(1);
    expect(llamadas.write).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(llamadas.write).toHaveLength(2);
    // La segunda lleva todo lo acumulado, sobre la primera.
    expect(llamadas.write[1].startsWith(llamadas.write[0])).toBe(true);
    expect(llamadas.write[1].match(/Actualización automática/g)).toHaveLength(6);
  });

  it("solo las claves de memoria/cerebros cuentan como cambio de memoria", () => {
    expect(isMemorySyncKey("starseed.brain.b1.integration.x")).toBe(true);
    expect(isMemorySyncKey("starseed.aurora.memory.v1")).toBe(true);
    expect(isMemorySyncKey("starseed.dock.items.v2")).toBe(false);
  });
});
