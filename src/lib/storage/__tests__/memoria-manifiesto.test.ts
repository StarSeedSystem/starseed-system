// Pruebas de la lógica pura del manifiesto de copias de memorias (INF1025H).
import { describe, expect, it, vi } from "vitest";
import {
  construirManifiesto,
  divergencias,
  huellaContenido,
  proponerLimpieza,
  resumenManifiesto,
  type CopiaMemoria,
} from "../memoria-manifiesto";

const HEX_HOLA = "133ee989293f92736301280c6f14c89d521200c17dcdcecca30cd20705332d44";

function copia(over: Partial<CopiaMemoria> = {}): CopiaMemoria {
  return { cerebroId: "c1", memoriaId: "m1", destino: "local", huella: "h1", bytes: 10, actualizadoMs: 1000, ...over };
}

describe("huellaContenido", () => {
  it("calcula SHA-256 en hex y normaliza saltos Windows", async () => {
    expect(await huellaContenido("hola\n")).toBe(HEX_HOLA);
    expect(await huellaContenido("hola\r\n")).toBe(HEX_HOLA);
    expect(await huellaContenido("a\r\nb")).toBe(await huellaContenido("a\nb"));
  });
});

describe("construirManifiesto", () => {
  it("agrupa por huella y marca última copia solo si hay una", () => {
    const m = construirManifiesto([
      copia({ destino: "local" }),
      copia({ destino: "gdrive" }),
      copia({ cerebroId: "c2", memoriaId: "m2", huella: "h2" }),
    ]);
    expect(m.grupos).toHaveLength(2);
    const h1 = m.grupos.find((g) => g.huella === "h1");
    expect(h1?.copias).toHaveLength(2);
    expect(h1?.destinos).toEqual(["gdrive", "local"]);
    expect(h1?.ultimaCopia).toBe(false);
    expect(m.grupos.find((g) => g.huella === "h2")?.ultimaCopia).toBe(true);
  });

  it("es determinista aunque cambie el orden de entrada", () => {
    const a = copia({ destino: "local" });
    const b = copia({ destino: "gdrive", huella: "h2", actualizadoMs: 2000 });
    const c = copia({ cerebroId: "c0", memoriaId: "m0", huella: "h0" });
    expect(construirManifiesto([a, b, c])).toEqual(construirManifiesto([c, b, a]));
  });
});

describe("divergencias", () => {
  it("detecta huellas distintas y señala la más nueva", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: "vieja", actualizadoMs: 1000 }),
      copia({ destino: "gdrive", huella: "nueva", actualizadoMs: 2000 }),
    ]);
    expect(divergencias(m)).toEqual([{
      cerebroId: "c1", memoriaId: "m1", huellas: ["nueva", "vieja"], destinos: ["gdrive", "local"],
      masNueva: "nueva", empate: false,
    }]);
    expect(m.grupos.every((g) => g.divergente)).toBe(true);
  });

  it("un empate no elige ganadora", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: "a", actualizadoMs: 500 }),
      copia({ destino: "p2p", huella: "b", actualizadoMs: 500 }),
    ]);
    const [d] = divergencias(m);
    expect(d.empate).toBe(true);
    expect(d.masNueva).toBeNull();
  });

  it("no hay divergencia si las huellas están en un solo destino", () => {
    const m = construirManifiesto([copia({ destino: "local", huella: "a" }), copia({ destino: "local", huella: "b" })]);
    expect(divergencias(m)).toEqual([]);
  });
});

describe("proponerLimpieza", () => {
  it("nunca propone tocar una última copia", () => {
    expect(proponerLimpieza(construirManifiesto([copia()]))).toEqual([]);
  });

  it("propone solo duplicados exactos y siempre pide confirmación", () => {
    const m = construirManifiesto([
      copia({ destino: "local", actualizadoMs: 1000 }),
      copia({ destino: "local", actualizadoMs: 2000 }),
    ]);
    const propuestas = proponerLimpieza(m);
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0].requiereConfirmacion).toBe(true);
    expect(propuestas[0].copia.actualizadoMs).toBe(1000);
    expect(propuestas[0].destino).toBe("local");
  });

  it("no propone quitar por divergencia ni por faltar en otro destino", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: "a", actualizadoMs: 1000 }),
      copia({ destino: "gdrive", huella: "b", actualizadoMs: 2000 }),
    ]);
    expect(proponerLimpieza(m)).toEqual([]);
  });
});
describe("resumenManifiesto", () => {
  it("resume en español", () => {
    const m = construirManifiesto([
      copia(),
      copia({ cerebroId: "c2", memoriaId: "m2", huella: "h2", destino: "gdrive" }),
      copia({ cerebroId: "c2", memoriaId: "m2", huella: "h3", destino: "p2p", actualizadoMs: 3000 }),
    ]);
    expect(resumenManifiesto(m)).toBe("2 memorias, 1 con copia única, 1 divergente");
  });

  it("no lee el reloj", () => {
    const spy = vi.spyOn(Date, "now");
    const m = construirManifiesto([copia({ actualizadoMs: null })]);
    divergencias(m); proponerLimpieza(m); resumenManifiesto(m);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
