import { describe, it, expect } from "vitest";
import {
  zonaDeConfianza,
  catalogoDeAccionesOS,
  decidirConNeedle,
  UMBRAL_EJECUTAR,
  UMBRAL_CONFIRMAR,
  type DecisionNeedle,
} from "../needle3-client";

describe("needle3-client", () => {
  describe("zonaDeConfianza", () => {
    it("devuelve 'ejecutar' con confianza >= 0.6 y hay llamadas", () => {
      const d: DecisionNeedle = {
        ok: true,
        confianza: 0.75,
        llamadas: [{ nombre: "apariencia", argumentos: {} }],
      };
      expect(zonaDeConfianza(d)).toBe("ejecutar");
    });

    it("devuelve 'escalar' con confianza >= 0.6 pero sin llamadas", () => {
      const d1: DecisionNeedle = { ok: true, confianza: 0.8, llamadas: [] };
      const d2: DecisionNeedle = { ok: true, confianza: 0.8 };
      expect(zonaDeConfianza(d1)).toBe("escalar");
      expect(zonaDeConfianza(d2)).toBe("escalar");
    });

    it("devuelve 'confirmar' cuando la confianza esta entre 0.4 y 0.6", () => {
      const d: DecisionNeedle = { ok: true, confianza: 0.5 };
      expect(zonaDeConfianza(d)).toBe("confirmar");
    });

    it("devuelve 'escalar' cuando la confianza es < 0.4, ok es false o confianza es null", () => {
      expect(zonaDeConfianza({ ok: true, confianza: 0.2 })).toBe("escalar");
      expect(zonaDeConfianza({ ok: false, confianza: 0.9, error: "error" })).toBe("escalar");
      expect(zonaDeConfianza({ ok: true, confianza: null })).toBe("escalar");
    });

    it("exporta las constantes de umbral requeridas", () => {
      expect(UMBRAL_EJECUTAR).toBe(0.6);
      expect(UMBRAL_CONFIRMAR).toBe(0.4);
    });
  });

  describe("catalogoDeAccionesOS", () => {
    it("cada esquema tiene name, description y parameters.type === 'object'", () => {
      const cat = catalogoDeAccionesOS();
      expect(cat.length).toBe(7);
      const nombres = cat.map((h) => h.name);
      expect(nombres).toEqual([
        "apariencia",
        "fondo",
        "tipografia",
        "distribucion",
        "preset",
        "movimiento",
        "restaurar",
      ]);

      for (const h of cat) {
        expect(typeof h.name).toBe("string");
        expect(typeof h.description).toBe("string");
        expect(h.description.length).toBeGreaterThan(0);
        expect(h.parameters.type).toBe("object");
      }
    });
  });

  describe("decidirConNeedle", () => {
    it("devuelve decision exitosa usando transporte inyectado", async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            ok: true,
            motor: "needle3",
            confianza: 0.85,
            llamadas: [{ nombre: "fondo", argumentos: { modo: "oscuro" } }],
          }),
          { status: 200 }
        );

      const res = await decidirConNeedle("nube", "cambiar a modo oscuro", [], {
        transporte: mockFetch,
      });

      expect(res.ok).toBe(true);
      expect(res.confianza).toBe(0.85);
      expect(res.llamadas?.[0].nombre).toBe("fondo");
    });

    it("maneja errores HTTP devolviendo ok: false", async () => {
      const mockFetch: typeof fetch = async () =>
        new Response("Error del servidor", { status: 500 });

      const res = await decidirConNeedle("local", "consulta", [], {
        transporte: mockFetch,
      });

      expect(res.ok).toBe(false);
      expect(res.confianza).toBeNull();
      expect(res.error).toContain("HTTP 500");
    });

    it("no enmascara errores HTTP del servidor local: devuelve HTTP 500 sin caer al dispositivo", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response("Fallo interno", { status: 500 })) as typeof fetch;
      try {
        const res = await decidirConNeedle("local", "consulta", []);
        expect(res.ok).toBe(false);
        expect(res.confianza).toBeNull();
        expect(res.error).toContain("HTTP 500");
        expect(res.motor).not.toBe("needle3-wasm");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("devuelve ok: false si falla la red del servidor local y no recae en dispositivo", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new Error("Local endpoint no disponible");
      }) as typeof fetch;
      try {
        const res = await decidirConNeedle("local", "consulta", []);
        expect(res.ok).toBe(false);
        expect(res.error).toContain("Local endpoint no disponible");
        expect(res.origen).toBe("servidor");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
