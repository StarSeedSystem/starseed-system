/**
 * Funciones PURAS del manifiesto de memorias (Ola 1025R · INF1025H): huella sin
 * que CRLF vs LF divida, agrupación, última copia, divergencias («el más nuevo
 * gana», el empate no escribe nada) y limpieza que jamás toca una «última copia»
 * ni la única de un destino local.
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

function copia(over: Partial<CopiaMemoria>): CopiaMemoria {
  return { cerebroId: "c1", memoriaId: "m1", destino: "starseed", huella: "h1", bytes: 10, actualizadoMs: 1000, ...over };
}

describe("huellaContenido", () => {
  it("es SHA-256 en hex (valor de referencia conocido)", async () => {
    await expect(huellaContenido("hola\nmundo")).resolves.toBe("7cfdb7e1fb5bb6e2cec1589b8ae145b5babd563abbde1824d912b6dd84a3f5ee");
    await expect(huellaContenido("")).resolves.toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("no cambia con \\r\\n (CRLF y LF son la misma memoria)", async () => {
    await expect(huellaContenido("a\r\nb\r\n")).resolves.toBe(await huellaContenido("a\nb\n"));
  });
});

describe("construirManifiesto", () => {
  it("agrupa por huella: copias y destinos", () => {
    const local = copia({ destino: "local" });
    const drive = copia({ destino: "gdrive", actualizadoMs: 2000 });
    const m = construirManifiesto([drive, local]);
    expect(m.grupos).toHaveLength(1);
    expect(m.grupos[0].copias).toEqual([drive, local]);
    expect(m.grupos[0].destinos).toEqual(["gdrive", "local"]);
    expect(m.grupos[0].divergente).toBe(false);
  });

  it("la última copia es la más reciente, incluso con fecha nula en el grupo", () => {
    const vieja = copia({ destino: "local", actualizadoMs: null });
    const nueva = copia({ destino: "gdrive", actualizadoMs: 5000 });
    expect(construirManifiesto([vieja, nueva]).grupos[0].ultimaCopia).toEqual(nueva);
    const ambasSinFecha = construirManifiesto([copia({ destino: "starseed", actualizadoMs: null }), copia({ destino: "local", actualizadoMs: null })]);
    expect(ambasSinFecha.grupos[0].ultimaCopia?.destino).toBe("local");
  });

  it("marca divergente cuando el mismo cerebroId+memoriaId tiene otra huella", () => {
    const a = copia({ destino: "local", huella: "h1", actualizadoMs: 100 });
    const b = copia({ destino: "gdrive", huella: "h2", actualizadoMs: 500 });
    const m = construirManifiesto([a, b]);
    expect(m.grupos.map((g) => g.divergente)).toEqual([true, true]);
  });

  it("otra memoria con contenido distinto NO marca divergencia", () => {
    const m = construirManifiesto([copia({ huella: "h1" }), copia({ memoriaId: "m2", huella: "h2" })]);
    expect(m.grupos.map((g) => g.divergente)).toEqual([false, false]);
  });

  it("orden determinista aunque la entrada llegue permutada", () => {
    const a = copia({ destino: "gdrive", huella: "h2" });
    const b = copia({ destino: "local", huella: "h1", actualizadoMs: 300 });
    const c = copia({ cerebroId: "c2", destino: "starseed", huella: "h3" });
    expect(construirManifiesto([a, b, c])).toEqual(construirManifiesto([c, b, a]));
  });
});

describe("divergencias", () => {
  it("lista la memoria con huellas distintas y señala la más nueva", () => {
    const m = construirManifiesto([copia({ destino: "starseed", huella: "h1", actualizadoMs: 1000 }), copia({ destino: "gdrive", huella: "h2", actualizadoMs: 3000 })]);
    expect(divergencias(m)).toEqual([{ cerebroId: "c1", memoriaId: "m1", destinos: ["gdrive", "starseed"], masNueva: "h2" }]);
  });

  it("el empate no escribe nada: masNueva nula (misma regla del OS)", () => {
    const m = construirManifiesto([copia({ destino: "local", huella: "h1", actualizadoMs: 700 }), copia({ destino: "gdrive", huella: "h2", actualizadoMs: 700 })]);
    expect(divergencias(m)).toEqual([{ cerebroId: "c1", memoriaId: "m1", destinos: ["gdrive", "local"], masNueva: null }]);
  });

  it("sin ninguna fecha resoluble también hay masNueva nula", () => {
    const m = construirManifiesto([copia({ destino: "local", huella: "h1", actualizadoMs: null }), copia({ destino: "p2p", huella: "h2", actualizadoMs: null })]);
    expect(divergencias(m)[0].masNueva).toBe(null);
  });
});

describe("proponerLimpieza", () => {
  it("SOLO propone la sobra: ni la última copia ni la única de local, siempre con confirmación", () => {
    const m = construirManifiesto([copia({ destino: "local", actualizadoMs: 100 }), copia({ destino: "starseed", actualizadoMs: 200 }), copia({ destino: "gdrive", actualizadoMs: 300 })]);
    expect(proponerLimpieza(m)).toEqual([
      { cerebroId: "c1", memoriaId: "m1", destino: "starseed", huella: "h1", motivo: expect.any(String), requiereConfirmacion: true },
    ]);
  });

  it("una memoria con una sola copia no se toca nunca", () => {
    expect(proponerLimpieza(construirManifiesto([copia({ destino: "externo" })]))).toEqual([]);
  });

  it("la divergencia no sugiere quitar por faltar en otro destino (local única + gdrive más nueva)", () => {
    const m = construirManifiesto([copia({ destino: "local", huella: "h1", actualizadoMs: 100 }), copia({ destino: "gdrive", huella: "h2", actualizadoMs: 500 })]);
    expect(proponerLimpieza(m)).toEqual([]);
  });
});

describe("resumenManifiesto", () => {
  it("en español: «3 memorias, 1 con copia única, 1 divergente»", () => {
    const m = construirManifiesto([copia({ memoriaId: "m1", destino: "local", actualizadoMs: 100 }), copia({ memoriaId: "m1", destino: "gdrive", actualizadoMs: 300 }), copia({ memoriaId: "m2", destino: "externo", huella: "h2" }), copia({ memoriaId: "m3", destino: "starseed", huella: "h3" }), copia({ memoriaId: "m3", destino: "p2p", huella: "h9", actualizadoMs: 100 })]);
    expect(resumenManifiesto(m)).toBe("3 memorias, 1 con copia única, 1 divergente");
  });

  it("singular y manifiesto vacío", () => {
    expect(resumenManifiesto(construirManifiesto([]))).toBe("0 memorias");
    expect(resumenManifiesto(construirManifiesto([copia({ destino: "local" })]))).toBe("1 memoria, 1 con copia única");
  });
});
