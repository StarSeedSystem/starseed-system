import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sondearServicio,
  SaludServicio,
  llamarServicio,
  pedirLanzamiento,
} from "../servicio-local";
import { decidir } from "../permisos";

// Mock del módulo de permisos
vi.mock("../permisos", () => ({
  decidir: vi.fn(),
}));

describe("servicio-local", () => {
  it("expect works", () => {
    expect(1 + 1).toBe(2);
  });

  const def = {
    herramientaId: "test-tool",
    nombre: "Servicio de Prueba",
    baseUrl: "http://127.0.0.1:3000",
    variableToken: "TEST_TOKEN",
    maxResponseSize: 1024,
    timeoutMs: 5000,
  };

  const fetchSuccess = vi.fn();
  const fetchTimeout = vi.fn();
  const fetchError = vi.fn();
  const fetchLargeResponse = vi.fn();
  const fetchNonJson = vi.fn();
  const fetchErrorStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (decidir as any).mockReturnValue({ permitido: true, confirmar: false, motivo: "" });
  });

  describe("sondearServicio", () => {
    it("debería retornar ok cuando el servicio responde con 2xx", async () => {
      fetchSuccess.mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
      }));

      const result = await sondearServicio(def, fetchSuccess);
      expect(result.ok).toBe(true);
      expect(result.mensaje).toContain("operativo");
    });

    it("debería retornar ok cuando el servicio responde con 2xx sin JSON", async () => {
      fetchSuccess.mockResolvedValue(new Response(null, {
        status: 204,
      }));

      const result = await sondearServicio(def, fetchSuccess);
      expect(result.ok).toBe(true);
    });

    it("debería retornar error cuando el servicio responde con error", async () => {
      fetchSuccess.mockResolvedValue(new Response("Error interno", {
        status: 500,
        statusText: "Internal Server Error",
      }));

      const result = await sondearServicio(def, fetchSuccess);
      expect(result.ok).toBe(false);
      expect(result.mensaje).toContain("no disponible");
    });

    it("debería retornar error cuando hay timeout", async () => {
      const timeoutError = new Error("Timeout");
      timeoutError.name = "AbortError";
      fetchTimeout.mockRejectedValue(timeoutError);

      const result = await sondearServicio(def, fetchTimeout);
      expect(result.ok).toBe(false);
      expect(result.mensaje).toContain("Timeout");
    });

    it("debería retornar error cuando hay error de red", async () => {
      fetchError.mockRejectedValue(new Error("Failed to fetch"));

      const result = await sondearServicio(def, fetchError);
      expect(result.ok).toBe(false);
      expect(result.mensaje).toContain("Error al contactar");
    });
  });

  describe("llamarServicio", () => {
    it("debería retornar datos JSON cuando la llamada es exitosa", async () => {
      const responseData = { resultado: "éxito" };
      fetchSuccess.mockResolvedValue(new Response(JSON.stringify(responseData), {
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "content-length": String(JSON.stringify(responseData).length),
        }),
      }));

      const result = await llamarServicio(def, "/test", { dato: "valor" }, fetchSuccess);
      expect(result).toEqual(responseData);
      expect(fetchSuccess).toHaveBeenCalledWith(
        "http://127.0.0.1:3000/test",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ dato: "valor" }),
        })
      );
    });

    it("debería lanzar error cuando la respuesta supera el límite de tamaño", async () => {
      const largeData = "x".repeat(2048); // mayor que maxResponseSize (1024)
      fetchLargeResponse.mockResolvedValue(new Response(JSON.stringify({ data: largeData }), {
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "content-length": String(2048),
        }),
      }));

      await expect(
        llamarServicio(def, "/test", {}, fetchLargeResponse)
      ).rejects.toThrowError(/supera el límite de tamaño/);
    });

    it("debería lanzar error cuando el servicio devuelve estado de error", async () => {
      fetchErrorStatus.mockResolvedValue(new Response("Error del servicio", {
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({
          "content-type": "text/plain",
        }),
      }));

      await expect(
        llamarServicio(def, "/test", {}, fetchErrorStatus)
      ).rejects.toThrowError(/Error 500 del servicio/);
    });

    it("debería lanzar error cuando la respuesta no es JSON válido", async () => {
      fetchNonJson.mockResolvedValue(new Response("texto plano", {
        status: 200,
        headers: new Headers({
          "content-type": "text/plain",
          "content-length": "11",
        }),
      }));

      await expect(
        llamarServicio(def, "/test", {}, fetchNonJson)
      ).rejects.toThrowError(/no devolvió JSON válido/);
    });

    it("debería lanzar error cuando hay timeout en la llamada", async () => {
      const timeoutError = new Error("Timeout");
      timeoutError.name = "AbortError";
      fetchTimeout.mockRejectedValue(timeoutError);

      await expect(
        llamarServicio(def, "/test", {}, fetchTimeout)
      ).rejects.toThrowError(/Timeout al llamar/);
    });
  });

  describe("pedirLanzamiento", () => {
    const ctx = {
      rol: "dueno" as const,
      origen: "mano" as const,
      ambito: "personal" as const,
      nativo: true,
    };

    it("debería retornar solicitud de lanzamiento cuando está permitido", async () => {
      (decidir as any).mockReturnValue({
        permitido: true,
        confirmar: false,
        motivo: "Permitido",
      });

      const result = await pedirLanzamiento("binario-test", ctx);
      expect(result).toEqual({
        tipo: "lanzar-externo",
        binarioId: "binario-test",
      });
    });

    it("debería lanzar error cuando no está permitido", async () => {
      (decidir as any).mockReturnValue({
        permitido: false,
        confirmar: false,
        motivo: "No autorizado",
      });

      await expect(
        pedirLanzamiento("binario-test", ctx)
      ).rejects.toThrowError(/No se permite lanzar/);
    });

    it("debería retornar solicitud de lanzamiento incluso cuando se requiere confirmación", async () => {
      // En este caso, la decisión indica que se requiere confirmación
      (decidir as any).mockReturnValue({
        permitido: true,
        confirmar: true, // Indica que se necesita confirmación
        motivo: "Requiere confirmación",
      });

      // El módulo servicio-local no maneja la confirmación directamente,
      // pero retorna la solicitud igual. La confirmación debe ser manejada
      // por el llamador (la app nativa o el servicio de lanzador).
      const result = await pedirLanzamiento("binario-test", ctx);
      expect(result).toEqual({
        tipo: "lanzar-externo",
        binarioId: "binario-test",
      });
    });
  });
});