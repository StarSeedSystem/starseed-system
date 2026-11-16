import { describe, it, expect } from "vitest";
import { PALETAS, type IdForma, FIBONACCI } from "@/lib/protomolecula/orbe4d/coreografia";

type FibonacciNumber = typeof FIBONACCI[number];
import {
  type EstadoAsistente,
  formaDeEstado,
  paletaDeEstado,
  ritmoDeEstado,
  derivarEstado,
  textoDeEstado,
  frasePantallaLectora,
} from "../estado-forma";

const ESTADOS: EstadoAsistente[] = ["calma", "escuchando", "pensando", "hablando", "error"];

describe("estado-forma: mapeo de estado del asistente → forma, paleta, ritmo y textos", () => {
  describe("formaDeEstado", () => {
    it("devuelve un IdForma válido para cada estado", () => {
      for (const e of ESTADOS) {
        const f = formaDeEstado(e);
        expect(["semilla", "merkaba", "jitterbug", "teseracto", "dodecaedro", "matriz", "icosaedro", "modelo"]).toContain(f);
      }
    });

    it("las cinco formas son distintas entre sí", () => {
      const formas = ESTADOS.map(formaDeEstado);
      const unicas = new Set(formas);
      expect(unicas.size).toBe(5);
    });

    it("mapea cada estado a la forma especificada", () => {
      expect(formaDeEstado("calma")).toBe("icosaedro");
      expect(formaDeEstado("escuchando")).toBe("merkaba");
      expect(formaDeEstado("pensando")).toBe("teseracto");
      expect(formaDeEstado("hablando")).toBe("jitterbug");
      expect(formaDeEstado("error")).toBe("semilla");
    });
  });

  describe("paletaDeEstado", () => {
    it("devuelve una clave que existe en PALETAS", () => {
      for (const e of ESTADOS) {
        const p = paletaDeEstado(e);
        expect(Object.keys(PALETAS)).toContain(p);
      }
    });

    it("usa astraura para todos los estados salvo error, que usa trinity", () => {
      expect(paletaDeEstado("calma")).toBe("astraura");
      expect(paletaDeEstado("escuchando")).toBe("astraura");
      expect(paletaDeEstado("pensando")).toBe("astraura");
      expect(paletaDeEstado("hablando")).toBe("astraura");
      expect(paletaDeEstado("error")).toBe("trinity");
    });
  });

  describe("ritmoDeEstado", () => {
    it("devuelve objeto con giroS y respiraS numéricos", () => {
      for (const e of ESTADOS) {
        const r = ritmoDeEstado(e);
        expect(typeof r.giroS).toBe("number");
        expect(typeof r.respiraS).toBe("number");
        expect(r.giroS).toBeGreaterThanOrEqual(0);
        expect(r.respiraS).toBeGreaterThan(0);
      }
    });

    it("usa tiempos de Fibonacci según la especificación", () => {
      expect(ritmoDeEstado("calma")).toEqual({ giroS: 55, respiraS: 13 });
      expect(ritmoDeEstado("escuchando")).toEqual({ giroS: 21, respiraS: 8 });
      expect(ritmoDeEstado("pensando")).toEqual({ giroS: 13, respiraS: 5 });
      expect(ritmoDeEstado("hablando")).toEqual({ giroS: 21, respiraS: 3 });
      expect(ritmoDeEstado("error")).toEqual({ giroS: 0, respiraS: 21 });
    });

    it("todos los valores de giroS y respiraS son números de Fibonacci (o 0)", () => {
      const fibSet = new Set<FibonacciNumber>(FIBONACCI);
      for (const e of ESTADOS) {
        const r = ritmoDeEstado(e);
        if (r.giroS > 0) expect(fibSet.has(r.giroS as FibonacciNumber)).toBe(true);
        expect(fibSet.has(r.respiraS as FibonacciNumber)).toBe(true);
      }
    });
  });

  describe("derivarEstado", () => {
    it("error gana a todo", () => {
      const base = { speaking: true, listening: true, actionStatus: "pensando", error: true };
      expect(derivarEstado(base, null, Date.now())).toBe("error");
    });

    it("hablando gana a escuchando", () => {
      const base = { speaking: true, listening: true, actionStatus: "", error: false };
      expect(derivarEstado(base, null, Date.now())).toBe("hablando");
    });

    it("escuchando cuando solo listening es true", () => {
      const base = { speaking: false, listening: true, actionStatus: "", error: false };
      expect(derivarEstado(base, null, Date.now())).toBe("escuchando");
    });

    it("pensando por actionStatus con palabras clave", () => {
      const base = { speaking: false, listening: false, actionStatus: "procesando", error: false };
      expect(derivarEstado(base, null, Date.now())).toBe("pensando");
      const base2 = { speaking: false, listening: false, actionStatus: "think", error: false };
      expect(derivarEstado(base2, null, Date.now())).toBe("pensando");
      const base3 = { speaking: false, listening: false, actionStatus: "pensando respuesta", error: false };
      expect(derivarEstado(base3, null, Date.now())).toBe("pensando");
    });

    it("sin puente y respuesta reciente (< 60s) → hablando", () => {
      const ahora = Date.now();
      const hace30s = ahora - 30_000;
      expect(derivarEstado(null, hace30s, ahora)).toBe("hablando");
    });

    it("sin puente y respuesta antigua (≥ 60s) → calma", () => {
      const ahora = Date.now();
      const hace70s = ahora - 70_000;
      expect(derivarEstado(null, hace70s, ahora)).toBe("calma");
    });

    it("sin puente y sin última respuesta → calma", () => {
      const ahora = Date.now();
      expect(derivarEstado(null, null, ahora)).toBe("calma");
    });

    it("puente null con speaking true → hablando", () => {
      const base = { speaking: true, listening: false, actionStatus: "", error: false };
      expect(derivarEstado(base, null, Date.now())).toBe("hablando");
    });

    it("puente null con listening true → escuchando", () => {
      const base = { speaking: false, listening: true, actionStatus: "", error: false };
      expect(derivarEstado(base, null, Date.now())).toBe("escuchando");
    });
  });

  describe("textoDeEstado", () => {
    it("devuelve texto no vacío para cada estado", () => {
      for (const e of ESTADOS) {
        const t = textoDeEstado(e);
        expect(typeof t).toBe("string");
        expect(t.length).toBeGreaterThan(0);
      }
    });

    it("ningún texto contiene 'Mando'", () => {
      for (const e of ESTADOS) {
        expect(textoDeEstado(e).toLowerCase()).not.toContain("mando");
      }
    });

    it("textos esperados", () => {
      expect(textoDeEstado("calma")).toBe("En calma");
      expect(textoDeEstado("escuchando")).toBe("Escuchando…");
      expect(textoDeEstado("pensando")).toBe("Pensando…");
      expect(textoDeEstado("hablando")).toBe("Hablando");
      expect(textoDeEstado("error")).toBe("Algo falló");
    });
  });

  describe("frasePantallaLectora", () => {
    it("devuelve frase completa no vacía para cada estado", () => {
      for (const e of ESTADOS) {
        const f = frasePantallaLectora(e);
        expect(typeof f).toBe("string");
        expect(f.length).toBeGreaterThan(0);
      }
    });

    it("ninguna frase contiene 'Mando'", () => {
      for (const e of ESTADOS) {
        expect(frasePantallaLectora(e).toLowerCase()).not.toContain("mando");
      }
    });

    it("frases esperadas", () => {
      expect(frasePantallaLectora("calma")).toBe("Astraura está en calma");
      expect(frasePantallaLectora("escuchando")).toBe("Astraura te está escuchando");
      expect(frasePantallaLectora("pensando")).toBe("Astraura está pensando");
      expect(frasePantallaLectora("hablando")).toBe("Astraura está hablando");
      expect(frasePantallaLectora("error")).toBe("Astraura tuvo un problema; puedes abrir el chat para verlo");
    });
  });
});