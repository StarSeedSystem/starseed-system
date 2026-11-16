import { describe, it, expect } from "vitest";
import {
  puedeLeer,
  puedeSalir,
  soloPublicoParaAdaptador,
  type AlcanceEjemplo,
  type EjemploLibreta,
  type LectorLibreta,
} from "../ambito-libreta";

const ej = (alcance: AlcanceEjemplo, extra: Partial<EjemploLibreta> = {}): EjemploLibreta => ({ id: extra.id ?? "e1", alcance, ...extra });

const LECTORES: readonly LectorLibreta[] = ["persona", "agente-personal", "entidad", "agente-entidad", "alex", "cualquiera"];

describe("puedeLeer · cada celda de la tabla de §5", () => {
  it("personal: solo la persona y sus agentes personales", () => {
    for (const quien of LECTORES) {
      expect(puedeLeer("personal", quien)).toBe(["persona", "agente-personal"].includes(quien));
    }
  });

  it("pagina y grupo: solo la entidad y sus agentes (por defecto no decide nadie más)", () => {
    for (const ambito of ["pagina", "grupo"] as const) {
      for (const quien of LECTORES) {
        expect(puedeLeer(ambito, quien)).toBe(["entidad", "agente-entidad"].includes(quien));
      }
    }
  });

  it("colectivo: cualquiera con acceso al ámbito", () => {
    for (const quien of LECTORES) expect(puedeLeer("colectivo", quien)).toBe(true);
  });

  it("fabrica: solo el desarrollo del OS", () => {
    for (const quien of LECTORES) expect(puedeLeer("fabrica", quien)).toBe(quien === "alex");
  });
});

describe("puedeSalir · cada celda de la tabla de §5", () => {
  it("personal: solo con la elección explícita de la persona", () => {
    expect(puedeSalir("personal", ej("personal"), true)).toEqual({
      sale: true,
      motivo: "Sale porque la persona lo eligió.",
    });
    expect(puedeSalir("personal", ej("personal"), false).sale).toBe(false);
  });

  it("pagina y grupo: solo si la entidad lo aprobó", () => {
    for (const ambito of ["pagina", "grupo"] as const) {
      expect(puedeSalir(ambito, ej("de-entidad", { aprobadoPorEntidad: true })).sale).toBe(true);
      expect(puedeSalir(ambito, ej("de-entidad", { aprobadoPorEntidad: false })).sale).toBe(false);
      expect(puedeSalir(ambito, ej("publico")).sale).toBe(false);
      expect(puedeSalir(ambito, ej("personal", { aprobadoPorEntidad: true })).sale).toBe(false);
    }
  });

  it("colectivo: solo ejemplos públicos, sin texto privado", () => {
    expect(puedeSalir("colectivo", ej("publico")).sale).toBe(true);
    expect(puedeSalir("colectivo", ej("de-entidad")).sale).toBe(false);
    expect(puedeSalir("colectivo", ej("personal")).sale).toBe(false);
  });

  it("fabrica: nunca sale, ni al repo ni a informes", () => {
    for (const alcance of ["personal", "de-entidad", "publico"] as const) {
      const v = puedeSalir("fabrica", ej(alcance, { aprobadoPorEntidad: true }), true);
      expect(v.sale).toBe(false);
      expect(v.motivo).toContain("nunca");
    }
  });
});

describe("por defecto todo es «no sale»", () => {
  it("sin elección ni aprobación ni alcance público, nada sale de ningún ámbito", () => {
    for (const ambito of ["personal", "pagina", "grupo", "colectivo", "fabrica"] as const) {
      const v = puedeSalir(ambito, ej("de-entidad"), undefined);
      expect(v.sale).toBe(false);
      expect(v.motivo.length).toBeGreaterThan(0);
    }
  });

  it("elección de la persona no vale fuera de lo personal; la aprobación de la entidad tampoco", () => {
    for (const ambito of ["pagina", "grupo", "colectivo", "fabrica"] as const) {
      expect(puedeSalir(ambito, ej("personal"), true).sale).toBe(false);
    }
    for (const ambito of ["personal", "colectivo", "fabrica"] as const) {
      expect(puedeSalir(ambito, ej("de-entidad", { aprobadoPorEntidad: true })).sale).toBe(false);
    }
  });
});

describe("soloPublicoParaAdaptador", () => {
  it("página y colectivo: ningún ejemplo personal puede haberlo visto", () => {
    for (const ambito of ["pagina", "colectivo"] as const) {
      expect(soloPublicoParaAdaptador([ej("publico"), ej("de-entidad")], ambito)).toEqual({
        ok: true,
        rechazados: [],
      });
      const sucio = soloPublicoParaAdaptador([ej("publico"), ej("personal")], ambito);
      expect(sucio.ok).toBe(false);
      expect(sucio.rechazados).toEqual([{ id: "e1", motivo: expect.any(String) }]);
    }
  });

  it("los rechazados se explican, no se filtran en silencio", () => {
    const v = soloPublicoParaAdaptador(
      [ej("personal", { id: "a" }), ej("de-entidad"), ej("personal", { id: "c" })],
      "colectivo",
    );
    expect(v.rechazados.map((r) => r.id)).toEqual(["a", "c"]);
    expect(v.rechazados[0].motivo).toContain("personal");
  });

  it("en los demás ámbitos la regla no ata", () => {
    for (const ambito of ["personal", "grupo", "fabrica"] as const) {
      expect(soloPublicoParaAdaptador([ej("personal")], ambito)).toEqual({ ok: true, rechazados: [] });
    }
  });
});
