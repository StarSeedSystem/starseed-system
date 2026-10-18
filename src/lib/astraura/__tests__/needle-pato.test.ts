import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  decidirConNeedlePato,
  esConsultaDePato,
  filtrarHerramientasPato,
  HERRAMIENTAS_PATO,
} from "../needle-pato";
import type { HerramientaNeedle } from "../needle3-client";

describe("needle-pato", () => {
  describe("esConsultaDePato", () => {
    it("devuelve true para consultas relacionadas con caminar", () => {
      expect(esConsultaDePato(" hacer que el robot camine ")).toBe(true);
      expect(esConsultaDePato(" avanzar hacia adelante ")).toBe(true);
      expect(esConsultaDePato(" mover el pato ")).toBe(true);
    });

    it("devuelve true para consultas relacionadas con girar", () => {
      expect(esConsultaDePato(" girar el robot a la derecha ")).toBe(true);
      expect(esConsultaDePato(" rotar 90 grados ")).toBe(true);
      expect(esConsultaDePato(" cambiar dirección ")).toBe(true);
    });

    it("devuelve true para consultas relacionadas con emoción", () => {
      expect(esConsultaDePato(" cambiar el estado emocional ")).toBe(true);
      expect(esConsultaDePato(" hacer que el pato esté feliz ")).toBe(true);
      expect(esConsultaDePato(" sentir emoción ")).toBe(true);
    });

    it("devuelve true para consultas relacionadas con bailar", () => {
      expect(esConsultaDePato(" hacer que el pato baile ")).toBe(true);
      expect(esConsultaDePato(" realizar un baile completo ")).toBe(true);
      expect(esConsultaDePato(" bailar alrededor ")).toBe(true);
    });

    it("devuelve true para consultas relacionadas con negación", () => {
      expect(esConsultaDePato(" negar con la cabeza ")).toBe(true);
      expect(esConsultaDePato(" decir que no con la cabeza ")).toBe(true);
      expect(esConsultaDePato(" movimiento de cabeza negativo ")).toBe(true);
    });

    it("devuelve true para consultas que mencionan pato o duck", () => {
      expect(esConsultaDePato(" el robot pato ")).toBe(true);
      expect(esConsultaDePato(" controlar el duck ")).toBe(true);
    });

    it("devuelve false para consultas no relacionadas con el pato", () => {
      expect(esConsultaDePato(" cambiar el color de fondo ")).toBe(false);
      expect(esConsultaDePato(" abrir una aplicación ")).toBe(false);
      expect(esConsultaDePato(" navegar a otra página ")).toBe(false);
      expect(esConsultaDePato(" ")).toBe(false);
      expect(esConsultaDePato(" hacer algo completamente diferente ")).toBe(false);
    });
  });

  describe("filtrarHerramientasPato", () => {
    it("devuelve solo las herramientas del pato cuando se le dan herramientas mixtas", () => {
      const herramientasMixtas: HerramientaNeedle[] = [
        ...HERRAMIENTAS_PATO,
        {
          name: "apariencia",
          description: "Cambiar la apariencia del sistema",
          parameters: { type: "object", properties: {} },
        },
        {
          name: "fondo",
          description: "Cambiar el fondo visual",
          parameters: { type: "object", properties: {} },
        }
      ];

      const resultado = filtrarHerramientasPato(herramientasMixtas);
      expect(resultado).toHaveLength(HERRAMIENTAS_PATO.length);
      resultado.forEach((herramienta, index) => {
        expect(herramienta.name).toBe(HERRAMIENTAS_PATO[index].name);
      });
    });

    it("devuelve un array vacío cuando no hay herramientas del pato", () => {
      const herramientasNoPato: HerramientaNeedle[] = [
        {
          name: "apariencia",
          description: "Cambiar la apariencia del sistema",
          parameters: { type: "object", properties: {} },
        },
        {
          name: "fondo",
          description: "Cambiar el fondo visual",
          parameters: { type: "object", properties: {} },
        }
      ];

      const resultado = filtrarHerramientasPato(herramientasNoPato);
      expect(resultado).toHaveLength(0);
    });

    it("devuelve las mismas herramientas cuando todas son del pato", () => {
      const resultado = filtrarHerramientasPato(HERRAMIENTAS_PATO);
      expect(resultado).toHaveLength(HERRAMIENTAS_PATO.length);
      resultado.forEach((herramienta, index) => {
        expect(herramienta.name).toBe(HERRAMIENTAS_PATO[index].name);
      });
    });
  });

  describe("decidirConNeedlePato", () => {
    // We'll test this function with a simpler approach
    it("existe y es una función", () => {
      expect(typeof decidirConNeedlePato).toBe("function");
    });

    it("maneja correctamente las consultas no relacionadas con el pato", async () => {
      // Mock fetch para evitar llamadas de red reales
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            ok: true,
            motor: "needle3",
            confianza: 0.7,
            llamadas: [{ nombre: "apariencia", argumentos: { modo: "oscuro" } }],
          }),
          { status: 200 }
        );

      vi.stubGlobal("fetch", mockFetch);

      try {
        const resultado = await decidirConNeedlePato("cambiar el color de fondo a azul", {});
        
        // Para consultas no relacionadas con el pato, debería delegar al needle estándar
        expect(resultado.ok).toBe(true);
        expect(resultado.motor).toBe("needle3");
        expect(resultado.llamadas?.[0].nombre).toBe("apariencia");
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});