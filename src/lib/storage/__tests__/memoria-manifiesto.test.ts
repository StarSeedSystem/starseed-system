/**
 * Pruebas puras del manifiesto de copias de memorias (Ola 1025R · INF1025H).
 * Sin red, sin disco y sin reloj: las fechas entran como datos en cada copia.
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
  return { cerebroId: "c1", memoriaId: "m1", destino: "local", huella: "hash-a", bytes: 10, actualizadoMs: 1000, ...over };
}

describe("huellaContenido", () => {
  it("normaliza CRLF: el mismo texto con \\r\\n da la misma huella", async () => {
    expect(await huellaContenido("línea 1\r\nlínea 2\r\n")).toBe(await huellaContenido("línea 1\nlínea 2\n"));
  });

  it("devuelve SHA-256 en hex de 64 caracteres y cambia con el contenido", async () => {
    const a = await huellaContenido("uno");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(await huellaContenido("dos"));
  });
});

describe("construirManifiesto", () => {
  it("agrupa por huella, ordena destinos y marca la última copia", () => {
    const m = construirManifiesto([copia({ huella: "b", destino: "gdrive", actualizadoMs: 2 }), copia({ huella: "a", destino: "starseed" }), copia({ huella: "a", destino: "local" })]);
    expect(m.grupos.map((g) => g.huella)).toEqual(["a", "b"]);
    expect(m.grupos[0].destinos).toEqual(["local", "starseed"]);
    expect(m.grupos[0].ultimaCopia).toBe(false);
    expect(m.grupos[1].ultimaCopia).toBe(true);
  });

  it("marca divergente cuando la misma memoria tiene huellas distintas", () => {
    const m = construirManifiesto([copia({ huella: "vieja", actualizadoMs: 1 }), copia({ huella: "nueva", destino: "gdrive", actualizadoMs: 2 })]);
    expect(m.grupos.every((g) => g.divergente)).toBe(true);
  });

  it("no confunde memorias distintas con el mismo contenido", () => {
    const m = construirManifiesto([copia({ memoriaId: "m1" }), copia({ memoriaId: "m2", destino: "gdrive" })]);
    expect(m.grupos[0].divergente).toBe(false);
    expect(m.grupos[0].destinos).toEqual(["local", "gdrive"]);
  });
});

describe("divergencias", () => {
  it("indica la copia más nueva como ganadora", () => {
    const m = construirManifiesto([copia({ huella: "vieja", actualizadoMs: 1000 }), copia({ huella: "nueva", destino: "gdrive", actualizadoMs: 2000 })]);
    const [d] = divergencias(m);
    expect(d.cerebroId).toBe("c1");
    expect(d.memoriaId).toBe("m1");
    expect(d.ganadora?.huella).toBe("nueva");
    expect(d.empate).toBe(false);
  });

  it("en empate (o sin fechas) no hay ganadora: no se escribe nada", () => {
    const empate = construirManifiesto([copia({ huella: "a", actualizadoMs: 5000 }), copia({ huella: "b", destino: "gdrive", actualizadoMs: 5000 })]);
    expect(divergencias(empate)[0].ganadora).toBeNull();
    expect(divergencias(empate)[0].empate).toBe(true);
    const sinFechas = construirManifiesto([copia({ huella: "a", actualizadoMs: null }), copia({ huella: "b", destino: "gdrive", actualizadoMs: null })]);
    expect(divergencias(sinFechas)[0].ganadora).toBeNull();
  });

  it("sin huellas distintas no hay divergencia", () => {
    expect(divergencias(construirManifiesto([copia(), copia({ destino: "gdrive" })]))).toEqual([]);
  });
});

describe("proponerLimpieza", () => {
  it("nunca propone quitar una última copia ni una copia única local", () => {
    const m = construirManifiesto([copia({ huella: "a", destino: "local", actualizadoMs: 1 }), copia({ huella: "b", destino: "gdrive", actualizadoMs: 2 })]);
    expect(proponerLimpieza(m)).toEqual([]);
  });

  it("propone con confirmación quitar duplicados del mismo destino, nunca copias en destinos distintos", () => {
    const m = construirManifiesto([copia({ huella: "a", destino: "gdrive", actualizadoMs: 1 }), copia({ huella: "a", destino: "gdrive", actualizadoMs: 2 }), copia({ huella: "a", destino: "starseed", actualizadoMs: 3 })]);
    const p = proponerLimpieza(m);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ destino: "gdrive", huella: "a", requiereConfirmacion: true });
  });

  it("propone quitar la versión vieja de una divergencia si queda copia, nunca la local única", () => {
    const m = construirManifiesto([copia({ huella: "vieja", destino: "local", actualizadoMs: 1 }), copia({ huella: "nueva", destino: "gdrive", actualizadoMs: 2 }), copia({ huella: "vieja", destino: "starseed", actualizadoMs: 1 })]);
    expect(proponerLimpieza(m)).toEqual([
      expect.objectContaining({ destino: "starseed", huella: "vieja", requiereConfirmacion: true }),
    ]);
  });

  it("da el mismo resultado sin importar el orden de entrada", () => {
    const base = [copia({ huella: "b", destino: "gdrive" }), copia({ huella: "a" }), copia({ huella: "a", destino: "gdrive" })];
    expect(proponerLimpieza(construirManifiesto(base))).toEqual(proponerLimpieza(construirManifiesto([...base].reverse())));
  });
});

describe("resumenManifiesto", () => {
  it("cuenta memorias, copias únicas y divergentes en español", () => {
    const m = construirManifiesto([copia({ memoriaId: "m1", huella: "a" }), copia({ memoriaId: "m2", huella: "b", destino: "gdrive" }), copia({ memoriaId: "m2", huella: "c", destino: "starseed", actualizadoMs: 2 }), copia({ memoriaId: "m3", huella: "a", destino: "gdrive" })]);
    expect(resumenManifiesto(m)).toBe("3 memorias, 2 con copia única, 1 divergente");
  });

  it("usa singular para una sola memoria", () => {
    expect(resumenManifiesto(construirManifiesto([copia()]))).toBe("1 memoria, 1 con copia única, 0 divergentes");
  });
});
