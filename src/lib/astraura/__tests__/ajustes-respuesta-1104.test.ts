/**
 * TAREA RPO1104F · Ajustes de respuesta: revisionPeces e interfaz (Olá 1104)
 *
 * Pruebas de decisiones PURAS para:
 * - `debeRevisarConPeces(ajustes, tipoDeTarea)`
 * - `debeUsarInterfazViva(ajustes, { tieneDatos, tienePasos, tieneComparacion })`
 *
 * Reglas de pruebas (CLAUDE.md): funciones puras exportadas.
 * NO se puede usar `vi.mock` ni importar `route.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  ajustesAutomaticosPorDefecto,
  type AjustesManualRespuesta,
  type TipoDeTarea,
  debeRevisarConPeces,
  debeUsarInterfazViva,
  type ContextoInterfaz,
  REVISION_PECES_POR_DEFECTO,
  INTERFAZ_POR_DEFECTO,
} from "@/lib/astraura/ajustes-respuesta";

describe("debeRevisarConPeces", () => {
  describe("valores por defecto", () => {
    it("por defecto (undefined) devuelve 'creaciones'", () => {
      expect(REVISION_PECES_POR_DEFECTO).toBe("creaciones");
    });

    it("sin revisionPeces explícita, usa el valor por defecto 'creaciones'", () => {
      const m: AjustesManualRespuesta = ajustesAutomaticosPorDefecto();
      const r = debeRevisarConPeces(m, "app");
      expect(r).toBe(true);
    });
  });

  describe('"nunca" - nunca revisar con peces', () => {
    it("siempre devuelve false con revisionPeces='nunca'", () => {
      const casos: TipoDeTarea[] = ["charla", "app", "pagina", "publicacion", "plan", "otro"];
      for (const tipo of casos) {
        const m: AjustesManualRespuesta = { ...ajustesAutomaticosPorDefecto(), revisionPeces: "nunca" };
        expect(debeRevisarConPeces(m, tipo), `falló para ${tipo}`).toBe(false);
      }
    });
  });

  describe('"siempre" - revisar todo tipo de tarea', () => {
    it("siempre devuelve true con revisionPeces='siempre'", () => {
      const casos: TipoDeTarea[] = ["charla", "app", "pagina", "publicacion", "plan", "otro"];
      for (const tipo of casos) {
        const m: AjustesManualRespuesta = { ...ajustesAutomaticosPorDefecto(), revisionPeces: "siempre" };
        expect(debeRevisarConPeces(m, tipo), `falló para ${tipo}`).toBe(true);
      }
    });
  });

  describe('"creaciones" (por defecto) - solo apps, páginas, publicaciones, planes', () => {
    it("devuelve true para creaciones: app, pagina, publicacion, plan", () => {
      const creaciones: TipoDeTarea[] = ["app", "pagina", "publicacion", "plan"];
      for (const tipo of creaciones) {
        const m: AjustesManualRespuesta = { ...ajustesAutomaticosPorDefecto(), revisionPeces: "creaciones" };
        expect(debeRevisarConPeces(m, tipo), `falló para ${tipo}`).toBe(true);
      }
    });

    it("devuelve false para charla y otro", () => {
      const noCreaciones: TipoDeTarea[] = ["charla", "otro"];
      for (const tipo of noCreaciones) {
        const m: AjustesManualRespuesta = { ...ajustesAutomaticosPorDefecto(), revisionPeces: "creaciones" };
        expect(debeRevisarConPeces(m, tipo), `falló para ${tipo}`).toBe(false);
      }
    });
  });
});

describe("debeUsarInterfazViva", () => {
  describe("valores por defecto", () => {
    it("por defecto (undefined) devuelve 'auto'", () => {
      expect(INTERFAZ_POR_DEFECTO).toBe("auto");
    });

    it("con auto: devuelve true si tiene datos", () => {
      const contexto: ContextoInterfaz = { tieneDatos: true, tienePasos: false, tieneComparacion: false };
      const m: AjustesManualRespuesta = ajustesAutomaticosPorDefecto();
      expect(debeUsarInterfazViva(m, contexto)).toBe(true);
    });

    it("con auto: devuelve true si tiene pasos", () => {
      const contexto: ContextoInterfaz = { tieneDatos: false, tienePasos: true, tieneComparacion: false };
      const m: AjustesManualRespuesta = ajustesAutomaticosPorDefecto();
      expect(debeUsarInterfazViva(m, contexto)).toBe(true);
    });

    it("con auto: devuelve true si tiene comparacion", () => {
      const contexto: ContextoInterfaz = { tieneDatos: false, tienePasos: false, tieneComparacion: true };
      const m: AjustesManualRespuesta = ajustesAutomaticosPorDefecto();
      expect(debeUsarInterfazViva(m, contexto)).toBe(true);
    });

    it("con auto: devuelve false si no tiene datos, pasos ni comparacion", () => {
      const contexto: ContextoInterfaz = { tieneDatos: false, tienePasos: false, tieneComparacion: false };
      const m: AjustesManualRespuesta = ajustesAutomaticosPorDefecto();
      expect(debeUsarInterfazViva(m, contexto)).toBe(false);
    });
  });

  describe('"viva" - siempre interfaz viva', () => {
    it("siempre devuelve true con interfaz='viva'", () => {
      const contextos: ContextoInterfaz[] = [
        { tieneDatos: false, tienePasos: false, tieneComparacion: false },
        { tieneDatos: true, tienePasos: true, tieneComparacion: true },
      ];
      for (const contexto of contextos) {
        const m: AjustesManualRespuesta = { ...ajustesAutomaticosPorDefecto(), interfaz: "viva" };
        expect(debeUsarInterfazViva(m, contexto)).toBe(true);
      }
    });
  });

  describe('"texto" - siempre texto plano', () => {
    it("siempre devuelve false con interfaz='texto'", () => {
      const contextos: ContextoInterfaz[] = [
        { tieneDatos: true, tienePasos: false, tieneComparacion: false },
        { tieneDatos: false, tienePasos: true, tieneComparacion: false },
        { tieneDatos: true, tienePasos: true, tieneComparacion: true },
      ];
      for (const contexto of contextos) {
        const m: AjustesManualRespuesta = { ...ajustesAutomaticosPorDefecto(), interfaz: "texto" };
        expect(debeUsarInterfazViva(m, contexto)).toBe(false);
      }
    });
  });

  describe("combinaciones con otros controles", () => {
    it("interfaz='viva' es independiente de esfuerzo y tipo", () => {
      const m: AjustesManualRespuesta = {
        ...ajustesAutomaticosPorDefecto(),
        esfuerzo: { auto: false, valor: "rapido" },
        tipo: { auto: false, valor: "breve" },
        interfaz: "viva",
      };
      const contexto: ContextoInterfaz = { tieneDatos: false, tienePasos: false, tieneComparacion: false };
      expect(debeUsarInterfazViva(m, contexto)).toBe(true);
    });

    it("interfaz='texto' prioriza texto sobre datos disponibles", () => {
      const m: AjustesManualRespuesta = {
        ...ajustesAutomaticosPorDefecto(),
        interfaz: "texto",
      };
      const contexto: ContextoInterfaz = { tieneDatos: true, tienePasos: true, tieneComparacion: true };
      expect(debeUsarInterfazViva(m, contexto)).toBe(false);
    });
  });
});