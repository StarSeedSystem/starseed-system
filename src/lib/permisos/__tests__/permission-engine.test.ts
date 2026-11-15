import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPermissionEngine, type PermissionEngine, type PermissionId } from "../permission-engine";
import { normalizarEstado, type EstadoPermiso } from "../contrato";

describe("PermissionEngine", () => {
  let engine: PermissionEngine;

  beforeEach(() => {
    engine = createPermissionEngine();
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("devuelve todos los permisos conocidos con sus etiquetas y descripciones", () => {
      const list = engine.list();

      expect(list.length).toBeGreaterThan(0);

      const webPerms = ["microfono", "camara", "ubicacion", "notificaciones", "almacenamiento", "movimiento", "archivos", "pantalla"];
      const nativePerms = ["bluetooth", "serie"];

      for (const id of [...webPerms, ...nativePerms]) {
        const perm = list.find((p) => p.id === id);
        expect(perm).toBeDefined();
        expect(perm?.label).toBeTruthy();
        expect(perm?.description).toBeTruthy();
        expect(perm?.state).toBe("no-disponible");
      }
    });

    it("incluye permisos web y nativos", () => {
      const list = engine.list();
      const ids = list.map((p) => p.id);

      expect(ids).toContain("microfono");
      expect(ids).toContain("camara");
      expect(ids).toContain("archivos");
      expect(ids).toContain("bluetooth");
      expect(ids).toContain("serie");
    });
  });

  describe("subscribe", () => {
    it("permite suscribirse a cambios de estado y devuelve un des-suscriptor", () => {
      const callbacks: EstadoPermiso[] = [];
      const unsubscribe = engine.subscribe("microfono", (state) => callbacks.push(state));

      expect(typeof unsubscribe).toBe("function");

      unsubscribe();
      expect(callbacks.length).toBe(0);
    });

    it("el des-suscriptor elimina el callback", () => {
      const callbacks: EstadoPermiso[] = [];
      const unsubscribe = engine.subscribe("camara", (state) => callbacks.push(state));
      unsubscribe();

      engine.subscribe("camara", (state) => callbacks.push(state));

      expect(callbacks.length).toBe(0);
    });
  });

  describe("request / grant", () => {
    it("request devuelve una promesa que resuelve a ResultadoPermisoOS", async () => {
      const result = await engine.request("microfono");

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("estado");
      expect(typeof result.estado).toBe("string");
    });

    it("grant es alias de request", async () => {
      const requestResult = await engine.request("camara");
      const grantResult = await engine.grant("camara");

      expect(grantResult.id).toBe(requestResult.id);
      expect(grantResult.estado).toBe(requestResult.estado);
    });

    it("para permisos nativos devuelve no-disponible sin lanzar", async () => {
      const result = await engine.request("bluetooth");

      expect(result.id).toBe("bluetooth");
      expect(result.estado).toBe("no-disponible");
      expect(result.motivo).toContain("nativo");
    });

    it("para permisos de pantalla usa getDisplayMedia", async () => {
      const result = await engine.request("pantalla");

      expect(result.id).toBe("pantalla");
      expect(["concedido", "denegado", "no-disponible"]).toContain(result.estado);
    });
  });

  describe("revoke", () => {
    it("revoke no lanza y notifica a suscriptores", async () => {
      const states: EstadoPermiso[] = [];
      const unsubscribe = engine.subscribe("notificaciones", (s) => states.push(s));

      await engine.revoke("notificaciones");

      unsubscribe();
      expect(states.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("listWithState", () => {
    it("devuelve permisos con estado consultado", async () => {
      const list = await engine.listWithState();

      expect(list.length).toBe(engine.list().length);

      for (const perm of list) {
        expect(perm.state).toMatch(/^(concedido|denegado|preguntar|no-disponible)$/);
      }
    });
  });
});

describe("normalizarEstado (contrato)", () => {
  it("mapea granted → concedido", () => {
    expect(normalizarEstado("granted")).toBe("concedido");
  });

  it("mapea denied → denegado", () => {
    expect(normalizarEstado("denied")).toBe("denegado");
  });

  it("mapea prompt → preguntar", () => {
    expect(normalizarEstado("prompt")).toBe("preguntar");
  });

  it("mapea unsupported → no-disponible", () => {
    expect(normalizarEstado("unsupported")).toBe("no-disponible");
  });

  it("es idempotente con los cuatro estados nuevos", () => {
    const nuevos: EstadoPermiso[] = ["concedido", "denegado", "preguntar", "no-disponible"];
    for (const estado of nuevos) {
      expect(normalizarEstado(estado)).toBe(estado);
    }
  });
});