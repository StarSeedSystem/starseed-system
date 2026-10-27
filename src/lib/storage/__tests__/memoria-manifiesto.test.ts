/**
 * Pruebas del manifiesto de memorias por huella de contenido (INF1025H).
 * Funciones puras: huella estable, agrupación, última copia, divergencias
 * con desempate, limpieza SIEMPRE confirmable y orden determinista.
 */
import { describe, expect, it } from "vitest";
import {
  construirManifiesto,
  divergencias,
  huellaContenido,
  proponerLimpieza,
  resumenManifiesto,
  type CopiaMemoria,
} from "../memoria-manifiesto";

function copia(over: Partial<CopiaMemoria> = {}): CopiaMemoria {
  return { cerebroId: "cerebro-1", memoriaId: "m1", destino: "starseed", huella: "h1", bytes: 10, actualizadoMs: 1000, ...over };
}

describe("huellaContenido", () => {
  it("normaliza saltos de Windows: misma memoria, misma huella", async () => {
    expect(await huellaContenido("línea uno\r\nlínea dos\r\n")).toBe(await huellaContenido("línea uno\nlínea dos\n"));
  });

  it("contenido distinto → huella distinta, en hex de 64", async () => {
    const huella = await huellaContenido("contenido A");
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(huella).not.toBe(await huellaContenido("contenido B"));
  });
});

describe("construirManifiesto", () => {
  it("agrupa por huella y lista destinos sin repetir", () => {
    const m = construirManifiesto([copia(), copia({ destino: "gdrive" }), copia({ destino: "externo", huella: "h2", memoriaId: "m2" })]);
    expect(m.grupos).toHaveLength(2);
    expect(m.grupos[0].huella).toBe("h1");
    expect(m.grupos[0].destinos).toEqual(["starseed", "gdrive"]);
    expect(m.grupos[1].destinos).toEqual(["externo"]);
  });

  it("marca divergente cuando la memoria tiene otra huella distinta", () => {
    const m = construirManifiesto([copia(), copia({ destino: "gdrive", huella: "h2", actualizadoMs: 5000 })]);
    expect(m.grupos.map((g) => g.divergente)).toEqual([true, true]);
    expect(construirManifiesto([copia(), copia({ destino: "gdrive" })]).grupos[0].divergente).toBe(false);
  });

  it("la última copia es la más Nueva; copia sin fecha nunca gana", () => {
    const m = construirManifiesto([copia({ destino: "local", actualizadoMs: 1000 }), copia({ destino: "externo", actualizadoMs: 3000 })]);
    expect(m.grupos[0].ultimaCopia?.destino).toBe("externo");
    const sinFechas = construirManifiesto([copia({ destino: "local", actualizadoMs: null }), copia({ actualizadoMs: null })]);
    expect(sinFechas.grupos[0].ultimaCopia).toBeNull();
  });

  it("empate exacto de fechas → ninguna gana (no escribe nada)", () => {
    const m = construirManifiesto([copia({ destino: "local", actualizadoMs: 3000 }), copia({ destino: "externo", actualizadoMs: 3000 })]);
    expect(m.grupos[0].ultimaCopia).toBeNull();
  });
});

describe("divergencias", () => {
  it("misma memoria con huellas distintas en destinos distintos: gana la más nueva", () => {
    const m = construirManifiesto([copia(), copia({ destino: "gdrive", huella: "h2", actualizadoMs: 5000 })]);
    const d = divergencias(m);
    expect(d).toHaveLength(1);
    expect(d[0].huellas).toEqual(["h1", "h2"]);
    expect(d[0].ganadora?.destino).toBe("gdrive");
  });

  it("empate de fechas → ganadora null; una sola huella o un solo destino no divergen", () => {
    const empate = construirManifiesto([
      copia({ destino: "local", actualizadoMs: 9000 }),
      copia({ destino: "gdrive", huella: "h2", actualizadoMs: 9000 }),
    ]);
    expect(divergencias(empate)[0].ganadora).toBeNull();
    expect(divergencias(construirManifiesto([copia(), copia({ destino: "gdrive" })]))).toHaveLength(0);
  });
});

describe("proponerLimpieza", () => {
  it("propone quitar solo la copia repetida no última, siempre con confirmación", () => {
    const m = construirManifiesto([
      copia({ destino: "local", actualizadoMs: 9000 }),
      copia({ destino: "externo", actualizadoMs: 1000 }),
      copia({ destino: "gdrive", actualizadoMs: 5000 }),
    ]);
    const p = proponerLimpieza(m);
    expect(p.map((x) => x.destino)).toEqual(["externo", "gdrive"]);
    expect(p.every((x) => x.requiereConfirmacion === true)).toBe(true);
    expect(p[1].quedanEn).toContain("local");
    expect(p[0].motivo).toContain("no deja la memoria sin copia");
  });

  it("jamás la única copia del destino local; copia única en una huella → nada", () => {
    const protegeLocal = construirManifiesto([copia({ destino: "local", actualizadoMs: 1000 }), copia({ actualizadoMs: 2000 })]);
    expect(proponerLimpieza(protegeLocal).map((x) => x.destino)).toEqual(["starseed"]);
    const minoritaria = construirManifiesto([
      copia({ destino: "local", huella: "h2", actualizadoMs: 1000 }),
      copia({ destino: "gdrive", huella: "h2", memoriaId: "m2" }),
    ]);
    expect(proponerLimpieza(minoritaria)).toHaveLength(0);
  });
});

describe("orden determinista y resumen", () => {
  const entrada = [
    copia({ destino: "externo", actualizadoMs: 1000 }),
    copia({ destino: "local", actualizadoMs: 9000 }),
    copia({ destino: "gdrive", huella: "h2", memoriaId: "m2" }),
    copia({ destino: "starseed", huella: "h3", memoriaId: "m3" }),
    copia({ destino: "gdrive", huella: "h4", memoriaId: "m3", actualizadoMs: 6000 }),
  ];

  it("la misma entrada en otro orden da la misma salida", () => {
    expect(JSON.stringify(construirManifiesto(entrada.slice().reverse()))).toBe(JSON.stringify(construirManifiesto(entrada)));
  });

  it("resume las memorias en español con acentos", () => {
    expect(resumenManifiesto(construirManifiesto(entrada))).toBe("3 memorias, 1 con copia única, 1 divergente");
    expect(resumenManifiesto(construirManifiesto([copia()]))).toBe("1 memoria, 1 con copia única, 0 divergentes");
  });
});
