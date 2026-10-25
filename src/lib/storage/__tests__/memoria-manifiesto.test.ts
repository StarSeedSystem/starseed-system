/**
 * Pruebas de la lógica pura del manifiesto de memorias (INF1025H): huella de
 * contenido, agrupación, última copia, divergencias y propuestas de limpieza.
 */
import { describe, expect, it } from "vitest";
import {
  construirManifiesto, divergencias, huellaContenido, proponerLimpieza, resumenManifiesto,
  type CopiaMemoria,
} from "../memoria-manifiesto";
const copia = (over: Partial<CopiaMemoria> = {}): CopiaMemoria => ({
  cerebroId: "c1", memoriaId: "m1", destino: "local", huella: "h1", bytes: 10, actualizadoMs: 100, ...over,
});
describe("huellaContenido", () => {
  it("normaliza \\r\\n y es SHA-256 estable en hex", async () => {
    expect(await huellaContenido("a\r\nb")).toBe(await huellaContenido("a\nb"));
    const h = await huellaContenido("hola");
    expect(h).toBe(await huellaContenido("hola"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(await huellaContenido("adiós"));
  });
});
describe("construirManifiesto", () => {
  it("agrupa por huella, calcula destinos y última copia", () => {
    const m = construirManifiesto([
      copia({ destino: "local" }),
      copia({ destino: "starseed", actualizadoMs: 200 }),
      copia({ memoriaId: "m2", huella: "h2", destino: "gdrive", actualizadoMs: null }),
    ]);
    expect(m.map((e) => [e.memoriaId, e.huella])).toEqual([["m1", "h1"], ["m2", "h2"]]);
    expect([m[0].copias.length, m[0].destinos, m[0].ultimaCopia, m[0].divergente])
      .toEqual([2, ["local", "starseed"], false, false]);
    expect([m[1].ultimaCopia, m[1].destinos]).toEqual([true, ["gdrive"]]);
  });
  it("marca divergente cuando una memoria tiene huellas distintas", () => {
    const m = construirManifiesto([
      copia({ huella: "h1", destino: "local" }),
      copia({ huella: "h1", destino: "starseed" }),
      copia({ huella: "h2", destino: "gdrive", actualizadoMs: 200 }),
    ]);
    expect([m.length, m.every((e) => e.divergente), m.every((e) => !e.ultimaCopia)]).toEqual([2, true, true]);
  });
  it("orden determinista aunque cambie el orden de entrada", () => {
    const a = copia({ memoriaId: "b", destino: "p2p" });
    const b = copia({ memoriaId: "a", destino: "gdrive" });
    const c = copia({ memoriaId: "a", destino: "local", huella: "h2" });
    expect(construirManifiesto([a, b, c])).toEqual(construirManifiesto([c, a, b]));
  });
});

describe("divergencias", () => {
  it("indica la más nueva: gana la más reciente", () => {
    const m = construirManifiesto([
      copia({ huella: "vieja", destino: "gdrive", actualizadoMs: 100 }),
      copia({ huella: "nueva", destino: "local", actualizadoMs: 200 }),
    ]);
    expect(divergencias(m)).toEqual([{
      cerebroId: "c1", memoriaId: "m1", huellas: ["nueva", "vieja"], masNueva: "nueva", empate: false,
    }]);
  });
  it("empate exacto o fechas desconocidas: no elige (no escribe nada)", () => {
    const empate = construirManifiesto([
      copia({ huella: "a", actualizadoMs: 5 }), copia({ huella: "b", destino: "gdrive", actualizadoMs: 5 }),
    ]);
    expect(divergencias(empate)[0]).toMatchObject({ masNueva: null, empate: true });
    const nulas = construirManifiesto([
      copia({ huella: "a", actualizadoMs: null }), copia({ huella: "b", destino: "gdrive", actualizadoMs: null }),
    ]);
    expect(divergencias(nulas)[0]).toMatchObject({ masNueva: null, empate: true });
    const unaConFecha = construirManifiesto([
      copia({ huella: "a", actualizadoMs: null }), copia({ huella: "b", destino: "gdrive", actualizadoMs: 10 }),
    ]);
    expect(divergencias(unaConFecha)[0]).toMatchObject({ masNueva: "b", empate: false });
  });
});
describe("proponerLimpieza", () => {
  it("propone solo la copia vieja y siempre con confirmación", () => {
    const m = construirManifiesto([
      copia({ huella: "vieja", destino: "gdrive", actualizadoMs: 100 }),
      copia({ huella: "nueva", destino: "starseed", actualizadoMs: 200 }),
    ]);
    const p = proponerLimpieza(m);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      cerebroId: "c1", memoriaId: "m1", destino: "gdrive", huella: "vieja", requiereConfirmacion: true,
    });
  });
  it("nunca toca la última copia ni la única copia local", () => {
    expect(proponerLimpieza(construirManifiesto([copia({ destino: "gdrive" })]))).toEqual([]);
    const unicaLocal = construirManifiesto([
      copia({ huella: "vieja", destino: "local", actualizadoMs: 100 }),
      copia({ huella: "nueva", destino: "gdrive", actualizadoMs: 200 }),
    ]);
    expect(proponerLimpieza(unicaLocal)).toEqual([]);
  });

  it("con empate no propone nada", () => {
    const m = construirManifiesto([
      copia({ huella: "a", actualizadoMs: 5 }), copia({ huella: "b", destino: "gdrive", actualizadoMs: 5 }),
    ]);
    expect(proponerLimpieza(m)).toEqual([]);
  });
});

describe("resumenManifiesto", () => {
  it("cuenta memorias, copias únicas y divergentes", () => {
    const m = construirManifiesto([
      copia({ memoriaId: "m1", huella: "h1" }),
      copia({ memoriaId: "m2", huella: "h2" }),
      copia({ memoriaId: "m2", huella: "h2", destino: "gdrive" }),
      copia({ memoriaId: "m3", huella: "v1", actualizadoMs: 100 }),
      copia({ memoriaId: "m3", huella: "v2", destino: "gdrive", actualizadoMs: 200 }),
    ]);
    expect(resumenManifiesto(m)).toBe("3 memorias, 1 con copia única, 1 divergente");
  });

  it("usa singular y cubre el manifiesto vacío", () => {
    expect(resumenManifiesto(construirManifiesto([copia()]))).toBe("1 memoria, 1 con copia única, 0 divergentes");
    expect(resumenManifiesto([])).toBe("0 memorias, 0 con copia única, 0 divergentes");
  });
});
