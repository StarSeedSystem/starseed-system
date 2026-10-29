/**
 * Manifiesto de copias de memorias de cerebros (Ola 1025R · INF1025H).
 * Cubre huella de contenido, agrupación, última copia, divergencias con
 * desempate y propuestas de limpieza que nunca tocan la última copia.
 */
import { describe, expect, it, vi } from "vitest";
import {
  construirManifiesto,
  divergencias,
  huellaContenido,
  proponerLimpieza,
  resumenManifiesto,
  type CopiaMemoria,
} from "../memoria-manifiesto";

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);

function copia(over: Partial<CopiaMemoria> = {}): CopiaMemoria {
  return {
    cerebroId: "c1",
    memoriaId: "m1",
    destino: "local",
    huella: H1,
    bytes: 10,
    actualizadoMs: 1000,
    ...over,
  };
}

describe("huellaContenido", () => {
  it("normaliza \\r\\n a \\n: el mismo texto da la misma huella", async () => {
    const unix = await huellaContenido("hola\nmundo\n");
    const windows = await huellaContenido("hola\r\nmundo\r\n");
    expect(windows).toBe(unix);
  });

  it("devuelve el SHA-256 hex conocido de «hola\\n»", async () => {
    expect(await huellaContenido("hola\r\n")).toBe(
      "133ee989293f92736301280c6f14c89d521200c17dcdcecca30cd20705332d44",
    );
  });
});

describe("construirManifiesto", () => {
  it("agrupa por huella y ordena copias y destinos", () => {
    const m = construirManifiesto([
      copia({ memoriaId: "m2", destino: "gdrive", huella: H1 }),
      copia({ memoriaId: "m1", destino: "local", huella: H1 }),
    ]);
    expect(m.grupos).toHaveLength(1);
    expect(m.grupos[0].huella).toBe(H1);
    expect(m.grupos[0].destinos).toEqual(["local", "gdrive"]);
    expect(m.grupos[0].copias.map((c) => c.memoriaId)).toEqual(["m1", "m2"]);
  });

  it("marca última copia solo cuando la memoria tiene una sola copia", () => {
    expect(construirManifiesto([copia()]).grupos[0].ultimaCopia).toBe(true);
    expect(construirManifiesto([copia(), copia({ destino: "gdrive" })]).grupos[0].ultimaCopia).toBe(
      false,
    );
  });

  it("es determinista: el orden de entrada no cambia el resultado", () => {
    const a = copia({ memoriaId: "b", destino: "p2p", huella: H2, actualizadoMs: 5 });
    const b = copia({ memoriaId: "a", destino: "gdrive", huella: H1, actualizadoMs: null });
    const c = copia({ memoriaId: "a", destino: "local", huella: H1, actualizadoMs: 9 });
    expect(JSON.stringify(construirManifiesto([a, b, c]))).toBe(
      JSON.stringify(construirManifiesto([c, a, b])),
    );
  });
});

describe("divergencias", () => {
  it("detecta huellas distintas y señala la copia más nueva", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: H1, actualizadoMs: 1000 }),
      copia({ destino: "gdrive", huella: H2, actualizadoMs: 2000 }),
    ]);
    const d = divergencias(m);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ cerebroId: "c1", memoriaId: "m1", huellas: [H1, H2] });
    expect(d[0].masNueva?.destino).toBe("gdrive");
    expect(m.grupos.every((g) => g.divergente)).toBe(true);
  });

  it("empate en la fecha más nueva → masNueva null (no escribe)", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: H1, actualizadoMs: 2000 }),
      copia({ destino: "gdrive", huella: H2, actualizadoMs: 2000 }),
    ]);
    expect(divergencias(m)[0].masNueva).toBeNull();
  });

  it("sin fechas resolubles → masNueva null", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: H1, actualizadoMs: null }),
      copia({ destino: "gdrive", huella: H2, actualizadoMs: null }),
    ]);
    expect(divergencias(m)[0].masNueva).toBeNull();
  });

  it("misma huella en varios destinos no es divergencia", () => {
    const m = construirManifiesto([
      copia({ destino: "local" }),
      copia({ destino: "starseed", actualizadoMs: 2000 }),
    ]);
    expect(divergencias(m)).toEqual([]);
    expect(m.grupos[0].divergente).toBe(false);
  });
});

describe("proponerLimpieza", () => {
  it("nunca propone tocar una última copia", () => {
    expect(proponerLimpieza(construirManifiesto([copia()]))).toEqual([]);
  });

  it("conserva la copia local y propone quitar la duplicada remota", () => {
    const m = construirManifiesto([
      copia({ destino: "local", actualizadoMs: 1000 }),
      copia({ destino: "gdrive", actualizadoMs: 2000 }),
    ]);
    const propuestas = proponerLimpieza(m);
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]).toMatchObject({ destino: "gdrive", requiereConfirmacion: true });
    expect(propuestas.some((p) => p.destino === "local")).toBe(false);
  });

  it("no propone quitar de un destino porque falte en otro", () => {
    const m = construirManifiesto([
      copia({ memoriaId: "a", destino: "gdrive", huella: H1 }),
      copia({ memoriaId: "b", destino: "p2p", huella: H2 }),
    ]);
    expect(proponerLimpieza(m)).toEqual([]);
  });

  it("no propone quitar ninguna copia divergente (perdería una versión)", () => {
    const m = construirManifiesto([
      copia({ destino: "local", huella: H1, actualizadoMs: 1000 }),
      copia({ destino: "gdrive", huella: H2, actualizadoMs: 2000 }),
    ]);
    expect(proponerLimpieza(m)).toEqual([]);
  });

  it("ordena las propuestas de forma determinista", () => {
    const copias = [
      copia({ memoriaId: "b", destino: "p2p", actualizadoMs: 1 }),
      copia({ memoriaId: "b", destino: "externo", actualizadoMs: 2 }),
      copia({ memoriaId: "a", destino: "gdrive", actualizadoMs: 1 }),
      copia({ memoriaId: "a", destino: "starseed", actualizadoMs: 2 }),
    ];
    const uno = proponerLimpieza(construirManifiesto(copias));
    const otro = proponerLimpieza(construirManifiesto([...copias].reverse()));
    expect(JSON.stringify(uno)).toBe(JSON.stringify(otro));
    expect(uno.map((p) => `${p.memoriaId}:${p.destino}`)).toEqual([
      "a:gdrive",
      "b:p2p",
    ]);
  });
});

describe("resumenManifiesto", () => {
  it("resume en español memorias, copia única y divergentes", () => {
    const m = construirManifiesto([
      copia({ memoriaId: "sola", destino: "local" }),
      copia({ memoriaId: "d", destino: "local", huella: H1 }),
      copia({ memoriaId: "d", destino: "gdrive", huella: H2 }),
    ]);
    expect(resumenManifiesto(m)).toBe("2 memorias, 1 con copia única, 1 divergente");
  });

  it("usa singular con una sola memoria", () => {
    expect(resumenManifiesto(construirManifiesto([copia()]))).toBe(
      "1 memoria, 1 con copia única, 0 divergentes",
    );
  });

  it("no consulta el reloj: Date.now no se usa", () => {
    const spy = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now() prohibido en un módulo puro");
    });
    try {
      const m = construirManifiesto([copia(), copia({ destino: "gdrive" })]);
      divergencias(m);
      proponerLimpieza(m);
      resumenManifiesto(m);
    } finally {
      spy.mockRestore();
    }
  });
});
