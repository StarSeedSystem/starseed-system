import { describe, expect, it, vi } from "vitest";
import { construirManifiesto, divergencias, huellaContenido, proponerLimpieza, resumenManifiesto, type CopiaMemoria } from "../memoria-manifiesto";

const copia = (over: Partial<CopiaMemoria> = {}): CopiaMemoria => ({ cerebroId: "c1", memoriaId: "m1", destino: "local", huella: "h1", bytes: 10, actualizadoMs: 1000, ...over });
const VACIO = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("huellaContenido", () => {
  it("calcula SHA-256 en hex (vectores conocidos)", async () => {
    await expect(huellaContenido("")).resolves.toBe(VACIO);
    await expect(huellaContenido("abc")).resolves.toBe(ABC);
  });
  it("normaliza CRLF a LF antes de medir", async () => {
    expect(await huellaContenido("a\r\nb")).toBe(await huellaContenido("a\nb"));
    expect(await huellaContenido("a\r\nb")).not.toBe(await huellaContenido("a\n\nb"));
  });
});

describe("construirManifiesto", () => {
  it("agrupa por huella, destinos únicos en orden canónico y cuenta memorias", () => {
    const m = construirManifiesto([copia({ destino: "gdrive" }), copia({ destino: "local" }), copia({ huella: "h2", memoriaId: "m2" })]);
    expect(m.grupos.map((g) => g.huella)).toEqual(["h1", "h2"]);
    expect(m.grupos[0].destinos).toEqual(["local", "gdrive"]);
    expect([m.memorias, m.copias]).toEqual([2, 3]);
  });
  it("marca ultimaCopia solo con una única copia en un solo destino", () => {
    const m = construirManifiesto([copia(), copia({ huella: "h2", memoriaId: "m2", destino: "gdrive" }), copia({ huella: "h2", memoriaId: "m2", destino: "p2p" })]);
    expect(m.grupos.find((g) => g.huella === "h1")?.ultimaCopia).toMatchObject({ huella: "h1", destino: "local" });
    expect(m.grupos.find((g) => g.huella === "h2")?.ultimaCopia).toBeNull();
  });
  it("marca divergente al mismo cerebro+memoria con huellas distintas y no muta la entrada", () => {
    const original = [copia({ huella: "h1", destino: "p2p" }), copia({ huella: "h2", destino: "gdrive", actualizadoMs: 2000 })];
    const m = construirManifiesto(original);
    expect(m.grupos.every((g) => g.divergente)).toBe(true);
    expect(original.map((c) => c.destino)).toEqual(["p2p", "gdrive"]);
  });
});

describe("divergencias", () => {
  it("detecta huellas distintas en destinos distintos e indica la más nueva", () => {
    const m = construirManifiesto([copia({ huella: "vieja", destino: "local", actualizadoMs: 1000 }), copia({ huella: "nueva", destino: "gdrive", actualizadoMs: 2000 })]);
    const d = divergencias(m);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ huellas: ["nueva", "vieja"], destinos: ["local", "gdrive"], empate: false });
    expect(d[0].ganadora).toMatchObject({ huella: "nueva", destino: "gdrive" });
  });
  it("un empate de la más nueva no elige ganadora (no escribe nada)", () => {
    const m = construirManifiesto([copia({ huella: "a", destino: "local", actualizadoMs: 2000 }), copia({ huella: "b", destino: "gdrive", actualizadoMs: 2000 })]);
    const [d] = divergencias(m);
    expect([d.empate, d.ganadora]).toEqual([true, null]);
  });
  it("no hay divergencia si las huellas coinciden o todo vive en un solo destino", () => {
    expect(divergencias(construirManifiesto([copia({ destino: "local" }), copia({ destino: "gdrive" })]))).toEqual([]);
    expect(divergencias(construirManifiesto([copia({ huella: "a", destino: "local" }), copia({ huella: "b", destino: "local" })]))).toEqual([]);
  });
});

describe("proponerLimpieza", () => {
  it("solo propone duplicados redundantes del mismo destino y siempre pide confirmación", () => {
    const m = construirManifiesto([copia({ destino: "local", actualizadoMs: 1000 }), copia({ destino: "local", actualizadoMs: 3000 }), copia({ destino: "gdrive", actualizadoMs: 2000 })]);
    const p = proponerLimpieza(m);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ destino: "local", requiereConfirmacion: true, copia: { actualizadoMs: 1000 }, conservar: { actualizadoMs: 3000 } });
  });
  it("nunca incluye una última copia ni la única copia local", () => {
    expect(proponerLimpieza(construirManifiesto([copia()]))).toEqual([]);
    const soloLocal = construirManifiesto([copia({ destino: "local" }), copia({ destino: "gdrive", memoriaId: "m2" })]);
    expect(proponerLimpieza(soloLocal)).toEqual([]);
  });
  it("no propone quitar de un destino porque la memoria falte en otro", () => {
    const m = construirManifiesto([copia({ destino: "local" }), copia({ destino: "gdrive" }), copia({ destino: "p2p" })]);
    expect(proponerLimpieza(m)).toEqual([]);
  });
});

describe("resumenManifiesto y determinismo", () => {
  it("resume en español: memorias, copia única y divergentes", () => {
    const m = construirManifiesto([
      copia({ memoriaId: "m1", huella: "a" }),
      copia({ memoriaId: "m2", huella: "b", destino: "gdrive" }),
      copia({ memoriaId: "m3", huella: "c" }),
      copia({ memoriaId: "m3", huella: "d", destino: "p2p", actualizadoMs: 2000 }),
    ]);
    expect(resumenManifiesto(m)).toBe("3 memorias, 2 con copia única, 1 divergente");
  });
  it("es determinista con distinto orden de entrada", () => {
    const a = copia({ memoriaId: "m1", huella: "h1" });
    const b = copia({ memoriaId: "m2", huella: "h2", destino: "gdrive" });
    const c = copia({ memoriaId: "m2", huella: "h2", destino: "gdrive", actualizadoMs: 500 });
    const uno = construirManifiesto([a, b, c]);
    const otro = construirManifiesto([c, a, b]);
    expect(JSON.stringify(uno)).toBe(JSON.stringify(otro));
    expect(JSON.stringify(proponerLimpieza(uno))).toBe(JSON.stringify(proponerLimpieza(otro)));
  });
  it("no consulta el reloj: Date.now nunca se llama", () => {
    const spy = vi.spyOn(Date, "now");
    const m = construirManifiesto([copia()]);
    divergencias(m);
    proponerLimpieza(m);
    resumenManifiesto(m);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
