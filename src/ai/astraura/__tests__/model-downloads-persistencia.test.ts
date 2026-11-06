import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  _ingest,
  downloadTasksSnapshot,
  taskFor,
  subscribeDownloadTasks,
  uninstall,
  STORAGE_KEY,
} from "../model-downloads";

const createMockLocalStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
  };
};

describe("model-downloads persistencia", () => {
  let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;
  let originalWindow: typeof window;

  beforeEach(() => {
    mockLocalStorage = createMockLocalStorage();
    originalWindow = global.window as unknown as typeof window;
    global.window = {
      ...originalWindow,
      localStorage: mockLocalStorage as unknown as Storage,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis;
    vi.resetModules();
  });

  it("guarda la cola en localStorage cuando cambia", async () => {
    const { _ingest: ingest, downloadTasksSnapshot: snapshot } = await import("../model-downloads");

    ingest({ sourceId: "smollm3-webgpu", pct: 50, label: "Descargando…" });
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining("smollm3-webgpu"),
    );

    ingest({ sourceId: "smollm3-webgpu", done: true });
    expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(2);
  });

  it("recupera la cola desde localStorage al cargar", async () => {
    const persisted = [
      {
        sourceId: "smollm3-webgpu",
        label: "SmolLM3 (navegador)",
        sizeLabel: "~1,9 GB",
        state: "done",
        pct: 100,
        startedAt: 1000,
        finishedAt: 2000,
      },
      {
        sourceId: "webllm",
        label: "WebLLM · Llama 3.2 3B (navegador)",
        sizeLabel: "~1–4 GB",
        state: "done",
        pct: 100,
        startedAt: 3000,
        finishedAt: 4000,
      },
    ];
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(persisted));

    const { downloadTasksSnapshot: snapshot } = await import("../model-downloads");
    const tasks = snapshot();

    expect(tasks).toHaveLength(2);
    expect(tasks[0].sourceId).toBe("webllm");
    expect(tasks[1].sourceId).toBe("smollm3-webgpu");
    expect(tasks.every((t) => t.state === "done")).toBe(true);
  });

  it("aplica tope de 20 tareas completadas más recientes", async () => {
    const manyDone = Array.from({ length: 25 }, (_, i) => ({
      sourceId: `model-${i}`,
      label: `Model ${i}`,
      state: "done" as const,
      pct: 100,
      startedAt: 1000 + i * 100,
      finishedAt: 2000 + i * 100,
    }));
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(manyDone));

    const { downloadTasksSnapshot: snapshot } = await import("../model-downloads");
    const tasks = snapshot();

    expect(tasks).toHaveLength(20);
    expect(tasks[0].sourceId).toBe("model-24");
    expect(tasks[19].sourceId).toBe("model-5");
  });

  it("convierte tareas downloading en error con motivo de interrupción", async () => {
    const withDownloading = [
      {
        sourceId: "smollm3-webgpu",
        label: "SmolLM3 (navegador)",
        state: "done" as const,
        pct: 100,
        startedAt: 1000,
        finishedAt: 2000,
      },
      {
        sourceId: "webllm",
        label: "WebLLM · Llama 3.2 3B (navegador)",
        state: "downloading" as const,
        pct: 45,
        startedAt: 3000,
      },
    ];
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(withDownloading));

    const { downloadTasksSnapshot: snapshot, taskFor } = await import("../model-downloads");
    const tasks = snapshot();

    expect(tasks).toHaveLength(2);
    const webllmTask = taskFor("webllm");
    expect(webllmTask).toBeDefined();
    expect(webllmTask!.state).toBe("error");
    expect(webllmTask!.error).toBe("interrumpida al recargar · vuelve a pulsar Descargar");
    expect(webllmTask!.pct).toBe(0);
    expect(webllmTask!.finishedAt).toBeGreaterThan(0);
  });

  it("funciona en memoria sin localStorage (SSR / modo privado)", async () => {
    global.window = undefined as unknown as Window & typeof globalThis;

    const { downloadTasksSnapshot: snapshot, _ingest: ingest, taskFor } = await import("../model-downloads");

    expect(() => snapshot()).not.toThrow();
    expect(snapshot()).toEqual([]);

    ingest({ sourceId: "smollm3-webgpu", pct: 10 });
    const task = taskFor("smollm3-webgpu");
    expect(task).toBeDefined();
    expect(task!.state).toBe("downloading");
    expect(task!.pct).toBe(10);

    global.window = originalWindow;
  });

  it("no lanza cuando localStorage lanza (modo privado)", async () => {
    mockLocalStorage.getItem.mockImplementation(() => {
      throw new Error("SecurityError");
    });
    mockLocalStorage.setItem.mockImplementation(() => {
      throw new Error("SecurityError");
    });

    const { downloadTasksSnapshot: snapshot, _ingest: ingest } = await import("../model-downloads");

    expect(() => snapshot()).not.toThrow();
    expect(snapshot()).toEqual([]);

    expect(() => ingest({ sourceId: "smollm3-webgpu", done: true })).not.toThrow();
  });

  it("ignora datos corruptos en localStorage", async () => {
    mockLocalStorage.getItem.mockReturnValue("no-es-json-valido");

    const { downloadTasksSnapshot: snapshot } = await import("../model-downloads");
    const tasks = snapshot();

    expect(tasks).toEqual([]);
  });

  it("ignora array con elementos inválidos", async () => {
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify([{ sourceId: 123 }, "string", null, { sourceId: "valid", label: "V", state: "done", pct: 100, startedAt: 1 }]));

    const { downloadTasksSnapshot: snapshot } = await import("../model-downloads");
    const tasks = snapshot();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].sourceId).toBe("valid");
  });

  it("persiste al desinstalar", async () => {
    const { _ingest: ingest, uninstall: uninst, downloadTasksSnapshot: snapshot } = await import("../model-downloads");

    ingest({ sourceId: "smollm3-webgpu", done: true });
    expect(snapshot()).toHaveLength(1);

    uninst("smollm3-webgpu");
    expect(snapshot()).toHaveLength(0);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, "[]");
  });

  it("orden: más recientes primero", async () => {
    const persisted = [
      {
        sourceId: "old",
        label: "Old",
        state: "done" as const,
        pct: 100,
        startedAt: 1000,
        finishedAt: 2000,
      },
      {
        sourceId: "new",
        label: "New",
        state: "done" as const,
        pct: 100,
        startedAt: 3000,
        finishedAt: 4000,
      },
    ];
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(persisted));

    const { downloadTasksSnapshot: snapshot } = await import("../model-downloads");
    const tasks = snapshot();

    expect(tasks[0].sourceId).toBe("new");
    expect(tasks[1].sourceId).toBe("old");
  });
});