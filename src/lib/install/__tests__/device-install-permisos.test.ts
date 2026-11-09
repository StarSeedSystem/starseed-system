// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { grantDeEstado, requestMaxPermissions, type GrantState } from "@/lib/install/device-install";
import type { EstadoPermiso } from "@/lib/permisos/contrato";

describe("grantDeEstado", () => {
  const casos: Array<[EstadoPermiso, GrantState]> = [
    ["concedido", "granted"],
    ["denegado", "denied"],
    ["preguntar", "prompt"],
    ["no-disponible", "unsupported"],
  ];
  for (const [entrada, esperado] of casos) {
    it(`${entrada} → ${esperado}`, () => {
      expect(grantDeEstado(entrada)).toBe(esperado);
    });
  }
});

describe("requestMaxPermissions", () => {
  let originalNotification: typeof Notification | undefined;
  let originalStorage: Navigator["storage"];

  beforeEach(() => {
    originalNotification = global.Notification;
    originalStorage = navigator.storage;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalNotification !== undefined) {
      global.Notification = originalNotification;
    } else {
      delete (global as Record<string, unknown>).Notification;
    }
    Object.defineProperty(navigator, "storage", {
      value: originalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("requestPermission que resuelve 'default' → notifications = 'prompt'", async () => {
    const eventos: CustomEvent[] = [];
    const originalDispatch = window.dispatchEvent;
    window.dispatchEvent = vi.fn((e: Event) => {
      if (e instanceof CustomEvent && e.type === "starseed:permiso") {
        eventos.push(e);
      }
      return originalDispatch.call(window, e);
    });

    const mockRequestPermission = vi.fn().mockResolvedValue("default");
    class MockNotification {
      static permission = "default";
      static requestPermission = mockRequestPermission;
    }
    vi.stubGlobal("Notification", MockNotification);

    Object.defineProperty(navigator, "storage", {
      value: { persist: vi.fn().mockResolvedValue(false), persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
      writable: true,
    });

    const report = await requestMaxPermissions();
    expect(report.notifications).toBe("prompt");

    window.dispatchEvent = originalDispatch;
    const permisosRecibidos = eventos.map((e) => (e.detail as { permiso: string }).permiso);
    expect(permisosRecibidos).toContain("notificaciones");
    expect(permisosRecibidos).toContain("almacenamiento");
  });

  it("notificaciones 'granted' → 'granted'", async () => {
    class MockNotification {
      static permission = "granted";
      static requestPermission = vi.fn().mockResolvedValue("granted");
    }
    vi.stubGlobal("Notification", MockNotification);

    Object.defineProperty(navigator, "storage", {
      value: { persist: vi.fn().mockResolvedValue(false), persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
      writable: true,
    });

    const report = await requestMaxPermissions();
    expect(report.notifications).toBe("granted");
  });

  it("notificaciones 'denied' → 'denied'", async () => {
    class MockNotification {
      static permission = "denied";
      static requestPermission = vi.fn().mockResolvedValue("denied");
    }
    vi.stubGlobal("Notification", MockNotification);

    Object.defineProperty(navigator, "storage", {
      value: { persist: vi.fn().mockResolvedValue(false), persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
      writable: true,
    });

    const report = await requestMaxPermissions();
    expect(report.notifications).toBe("denied");
  });

  it("persist resuelve true → persistentStorage = 'granted'", async () => {
    class MockNotification {
      static permission = "default";
      static requestPermission = vi.fn().mockResolvedValue("default");
    }
    vi.stubGlobal("Notification", MockNotification);

    Object.defineProperty(navigator, "storage", {
      value: { persist: vi.fn().mockResolvedValue(true), persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
      writable: true,
    });

    const report = await requestMaxPermissions();
    expect(report.persistentStorage).toBe("granted");
  });

  it("persist resuelve false → persistentStorage = 'prompt'", async () => {
    class MockNotification {
      static permission = "default";
      static requestPermission = vi.fn().mockResolvedValue("default");
    }
    vi.stubGlobal("Notification", MockNotification);

    Object.defineProperty(navigator, "storage", {
      value: { persist: vi.fn().mockResolvedValue(false), persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
      writable: true,
    });

    const report = await requestMaxPermissions();
    expect(report.persistentStorage).toBe("prompt");
  });

  it("sin Notification y sin storage.persist → 'unsupported'", async () => {
    delete (global as Record<string, unknown>).Notification;
    Object.defineProperty(navigator, "storage", {
      value: {},
      configurable: true,
      writable: true,
    });

    const report = await requestMaxPermissions();
    expect(report.notifications).toBe("unsupported");
    expect(report.persistentStorage).toBe("unsupported");
  });

  it("llega el evento starseed:permiso a window para los dos permisos", async () => {
    const eventos: CustomEvent[] = [];
    const originalDispatch = window.dispatchEvent;
    window.dispatchEvent = vi.fn((e: Event) => {
      if (e instanceof CustomEvent && e.type === "starseed:permiso") {
        eventos.push(e);
      }
      return originalDispatch.call(window, e);
    });

    class MockNotification {
      static permission = "default";
      static requestPermission = vi.fn().mockResolvedValue("granted");
    }
    vi.stubGlobal("Notification", MockNotification);

    Object.defineProperty(navigator, "storage", {
      value: { persist: vi.fn().mockResolvedValue(true), persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
      writable: true,
    });

    await requestMaxPermissions();

    window.dispatchEvent = originalDispatch;

    const permisosRecibidos = eventos.map((e) => (e.detail as { permiso: string }).permiso);
    expect(permisosRecibidos).toContain("notificaciones");
    expect(permisosRecibidos).toContain("almacenamiento");
  });

  it("persist no se llama hasta que se resuelve requestPermission (orden secuencial)", async () => {
    const orden: string[] = [];
    const mockRequestPermission = vi.fn().mockImplementation(async () => {
      orden.push("requestPermission-inicio");
      await Promise.resolve();
      orden.push("requestPermission-fin");
      return "granted";
    });

    class MockNotification {
      static permission = "default";
      static requestPermission = mockRequestPermission;
    }
    vi.stubGlobal("Notification", MockNotification);

    const mockPersist = vi.fn().mockImplementation(async () => {
      orden.push("persist");
      return true;
    });
    Object.defineProperty(navigator, "storage", {
      value: { persist: mockPersist, persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
      writable: true,
    });

    await requestMaxPermissions();

    expect(orden).toEqual([
      "requestPermission-inicio",
      "requestPermission-fin",
      "persist",
    ]);
  });

  it("con todo concedido y wakeLock en navigator, summary correcto", async () => {
    class MockNotification {
      static permission = "default";
      static requestPermission = vi.fn().mockResolvedValue("granted");
    }
    vi.stubGlobal("Notification", MockNotification);

    Object.defineProperty(navigator, "storage", {
      value: { persist: vi.fn().mockResolvedValue(true), persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(navigator, "wakeLock", {
      value: {},
      configurable: true,
      writable: true,
    });

    const report = await requestMaxPermissions();
    expect(report.summary).toBe("Concedido: notificaciones, almacenamiento persistente, wake lock.");
  });
});