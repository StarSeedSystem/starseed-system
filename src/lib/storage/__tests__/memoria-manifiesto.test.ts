/** Manifiesto de memorias (INF1025H): huella, última copia, divergencias y limpieza segura. */
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
  return { cerebroId: "c1", memoriaId: "m1", destino: "local",
    huella: "h1", bytes: 10, actualizadoMs: 1000, ...over };
}
describe("huellaContenido", () => {
  it("no cambia al pasar de CRLF a LF", async () => {
    const crlf = await huellaContenido("hola\r\nmundo");
    expect(crlf).toBe(await huellaContenido("hola\nmundo"));
    expect(crlf).toMatch(/^[0-9a-f]{64}$/);
  });
});
describe("construirManifiesto", () => {
  it("agrupa por huella y marca la última copia", () => {
    const m = construirManifiesto([
      copia({ destino: "gdrive" }),
      copia({ destino: "local" }),
      copia({ memoriaId: "m2", huella: "h2" }),
    ]);
    expect(m.grupos.map((g) => g.huella)).toEqual(["h1", "h2"]);
    expect(m.grupos[0].destinos).toEqual(["local", "gdrive"]);
    expect(m.grupos[0].ultimaCopia).toBe(false);
    expect(m.grupos[1].ultimaCopia).toBe(true);
    expect(m.grupos[1].destinos).toEqual(["local"]);
  });
  it("marca divergente cuando una memoria tiene huellas distintas", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: "a" }),
      copia({ destino: "gdrive", huella: "b" }),
    ]);
    expect(m.grupos.every((g) => g.divergente)).toBe(true);
  });
  it("da orden determinista aunque cambie el orden de entrada", () => {
    const a = copia({ destino: "p2p", huella: "z" });
    const b = copia({ destino: "local", huella: "a" });
    const c = copia({ memoriaId: "m2", huella: "a" });
    expect(construirManifiesto([a, b, c])).toEqual(construirManifiesto([c, a, b]));
  });
});
describe("divergencias", () => {
  it("indica la copia más nueva y sus huellas ordenadas", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: "vieja", actualizadoMs: 1000 }),
      copia({ destino: "gdrive", huella: "nueva", actualizadoMs: 2000 }),
    ]);
    const d = divergencias(m);
    expect(d).toHaveLength(1);
    expect(d[0].huellas).toEqual(["nueva", "vieja"]);
    expect(d[0].masNueva?.huella).toBe("nueva");
    expect(d[0].empate).toBe(false);
  });
  it("un empate no elige ganadora", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: "a", actualizadoMs: 500 }),
      copia({ destino: "gdrive", huella: "b", actualizadoMs: 500 }),
    ]);
    const [d] = divergencias(m);
    expect(d.empate).toBe(true);
    expect(d.masNueva).toBeNull();
  });
  it("sin fechas tampoco escribe: empate", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: "a", actualizadoMs: null }),
      copia({ destino: "gdrive", huella: "b", actualizadoMs: null }),
    ]);
    const [d] = divergencias(m);
    expect(d.empate).toBe(true);
    expect(d.masNueva).toBeNull();
  });
});
describe("proponerLimpieza", () => {
  it("no propone nada para una última copia ni por faltar en otro destino", () => {
    expect(proponerLimpieza(construirManifiesto([copia()]))).toEqual([]);
    const cruzado = construirManifiesto([copia({ destino: "local" }), copia({ destino: "gdrive" })]);
    expect(proponerLimpieza(cruzado)).toEqual([]);
  });
  it("propone quitar la copia repetida más antigua del mismo destino", () => {
    const m = construirManifiesto([
      copia({ destino: "local", actualizadoMs: 100 }),
      copia({ destino: "local", actualizadoMs: 200 }),
    ]);
    const p = proponerLimpieza(m);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ destino: "local", huella: "h1", requiereConfirmacion: true });
    expect(p[0].motivo).toContain("más reciente");
  });
  it("conserva la única copia local aunque haya duplicados en otro destino", () => {
    const m = construirManifiesto([
      copia({ destino: "local", actualizadoMs: 100 }),
      copia({ destino: "gdrive", actualizadoMs: 100 }),
      copia({ destino: "gdrive", actualizadoMs: 200 }),
    ]);
    const p = proponerLimpieza(m);
    expect(p).toHaveLength(1);
    expect(p[0].destino).toBe("gdrive");
  });
});
describe("resumenManifiesto", () => {
  it("cuenta memorias, copias únicas y divergentes sin depender del reloj", () => {
    const m = construirManifiesto([
      copia({ memoriaId: "m1", huella: "h1" }),
      copia({ memoriaId: "m2", huella: "h2" }),
      copia({ memoriaId: "m3", huella: "h3", destino: "gdrive" }),
      copia({ memoriaId: "m3", huella: "h4", destino: "local", actualizadoMs: 2000 }),
    ]);
    expect(resumenManifiesto(m)).toBe("3 memorias, 2 con copia única, 1 divergente");
    expect(resumenManifiesto(construirManifiesto([]))).toBe("0 memorias, 0 con copia única, 0 divergentes");
  });
});
