/**
 * Pruebas del manifiesto de memorias (INF1025H): la huella no cambia con
 * `\r\n`, la agrupación y «última copia», la divergencia con su desempate, la
 * limpieza que nunca toca una última copia ni la única de «local», y orden
 * determinista sin reloj (nada usa `Date.now()`).
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
  return { cerebroId: "c1", memoriaId: "m1", destino: "local", huella: "h-igual", bytes: 128, actualizadoMs: 1000, ...over };
}

describe("huellaContenido", () => {
  it("no cambia con `\\r\\n` y es SHA-256 en hex que distingue contenido", async () => {
    expect(await huellaContenido("línea 1\r\nlínea 2\n\r\n")).toBe(await huellaContenido("línea 1\nlínea 2\n\n"));
    const a = await huellaContenido("memoria");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(await huellaContenido("memoria distinta"));
  });
});

describe("construirManifiesto — agrupación y última copia", () => {
  it("agrupa por huella y marca «última copia» solo al grupo de una sola copia", () => {
    const unica = copia({ memoriaId: "m2", destino: "gdrive", huella: "h-a" });
    const gemela = copia({ destino: "local", huella: "h-igual" });
    const otraGemela = copia({ destino: "starseed", huella: "h-igual", actualizadoMs: 2000 });
    const m = construirManifiesto([otraGemela, unica, gemela]);
    const grupoUnica = m.grupos.find((g) => g.huella === "h-a");
    const gemelas = m.grupos.find((g) => g.huella === "h-igual");
    expect(grupoUnica?.copias).toEqual([unica]);
    expect(grupoUnica?.destinos).toEqual(["gdrive"]);
    expect(grupoUnica?.ultimaCopia).toBe(unica);
    expect(gemelas?.ultimaCopia).toBe(null);
    expect(gemelas?.destinos).toEqual(["local", "starseed"]);
    expect(gemelas?.divergente).toBe(false);
    expect(m.memorias).toEqual([
      { cerebroId: "c1", memoriaId: "m1" },
      { cerebroId: "c1", memoriaId: "m2" },
    ]);
    expect(m.copias.map((c) => c.destino)).toEqual(["local", "starseed", "gdrive"]);
  });
});

describe("divergencias y desempate", () => {
  it("el mismo (cerebro, memoria) con huellas distintas en destinos distintos diverge; gana la más nueva", () => {
    const vieja = copia({ huella: "h-vieja", actualizadoMs: 100 });
    const nueva = copia({ destino: "gdrive", huella: "h-nueva", actualizadoMs: 200 });
    const div = divergencias(construirManifiesto([vieja, nueva]));
    expect(div).toHaveLength(1);
    expect(div[0]).toMatchObject({ cerebroId: "c1", memoriaId: "m1" });
    expect(div[0].copias.map((c) => c.destino)).toEqual(["local", "gdrive"]);
    expect(div[0].masNueva).toBe(nueva);
  });

  it("empate exacto de fechas → masNueva es null (el empate no escribe nada)", () => {
    const div = divergencias(construirManifiesto([copia({ huella: "h-1" }), copia({ destino: "gdrive", huella: "h-2" })]));
    expect(div).toHaveLength(1);
    expect(div[0].masNueva).toBe(null);
  });

  it("huellas distintas en el MISMO destino no cuentan como divergencia", () => {
    const m = construirManifiesto([copia({ huella: "h-1" }), copia({ destino: "local", huella: "h-2", actualizadoMs: 200 })]);
    expect(divergencias(m)).toEqual([]);
  });
});

describe("proponerLimpieza", () => {
  it("nunca toca una «última copia» ni la única de «local»; propone solo lo redundante, con confirmación", () => {
    const nueva = copia({ destino: "starseed", huella: "h-dup", actualizadoMs: 3000 });
    const unica = copia(); // última copia de la memoria h-igual: intocable
    const enGdrive = copia({ destino: "gdrive", huella: "h-dup", actualizadoMs: 1000 });
    const enLocal = copia({ destino: "local", huella: "h-dup", actualizadoMs: 1000 });
    const propuestas = proponerLimpieza(construirManifiesto([nueva, unica, enGdrive, enLocal]));
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]).toMatchObject({
      cerebroId: "c1", memoriaId: "m1", destino: "gdrive", huella: "h-dup", requiereConfirmacion: true,
      motivo: expect.stringContaining("no deja la memoria sin copia"),
    });
  });

  it("cada memoria con una sola copia por huella no genera propuestas (ningún borrado se propaga solo)", () => {
    const sola = copia({ destino: "gdrive", huella: "h-sola" });
    const otraMemoria = copia({ memoriaId: "m2", destino: "externo", huella: "h-otra", actualizadoMs: 50 });
    expect(proponerLimpieza(construirManifiesto([sola, otraMemoria]))).toEqual([]);
  });

  it("entre gemelas conserva la más nueva y propone quitar la vieja", () => {
    const nueva = copia({ destino: "starseed", huella: "h-g", actualizadoMs: 3000 });
    const vieja = copia({ destino: "gdrive", huella: "h-g", actualizadoMs: 500 });
    const propuestas = proponerLimpieza(construirManifiesto([nueva, vieja]));
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0].destino).toBe("gdrive");
  });
});

describe("determinismo y resumen", () => {
  it("el mismo conjunto en otro orden da exactamente el mismo manifiesto (sin reloj ni Date.now)", () => {
    const copias = [
      copia({ huella: "h-2", destino: "p2p", actualizadoMs: 200 }),
      copia({ cerebroId: "c0", memoriaId: "a", destino: "gdrive", huella: "h-1", actualizadoMs: 150 }),
      copia({ memoriaId: "m2", destino: "starseed", huella: "h-2", actualizadoMs: 100 }),
    ];
    expect(JSON.stringify(construirManifiesto([...copias].reverse()))).toBe(JSON.stringify(construirManifiesto(copias)));
  });

  it("resume en español, con acentos y cuentas exactas", () => {
    const m = construirManifiesto([
      copia(), // m1: la única copia de su memoria
      copia({ memoriaId: "m2", destino: "gdrive", huella: "h-2" }),
      copia({ memoriaId: "m2", destino: "externo", huella: "h-3", actualizadoMs: 200 }),
    ]);    expect(resumenManifiesto(m)).toBe("2 memorias, 1 con copia única, 1 divergente");
    expect(resumenManifiesto(construirManifiesto([copia()]))).toBe("1 memoria, 1 con copia única, 0 divergentes");
  });
});
