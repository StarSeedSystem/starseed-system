// Pruebas del manifiesto de memorias (INF1025H): huella estable ante \r\n,
// agrupación por huella, última copia («el más nuevo gana»), divergencias y
// propuestas de limpieza que jamás tocan una última copia. Todo con funciones
// puras: sin red, sin disco y sin reloj (las fechas entran por parámetro).
import { describe, expect, it } from "vitest";
import {
  construirManifiesto,
  divergencias,
  huellaContenido,
  proponerLimpieza,
  resumenManifiesto,
  type CopiaMemoria,
  type DestinoMemoria,
} from "../memoria-manifiesto";

/** Copia de prueba; la huella SIEMPRE se calcula del texto real. */
async function copia(opts: {
  texto?: string;
  cerebroId?: string;
  memoriaId?: string;
  destino?: DestinoMemoria;
  actualizadoMs?: number | null;
}): Promise<CopiaMemoria> {
  const texto = opts.texto ?? "contenido base";
  return {
    cerebroId: opts.cerebroId ?? "c1",
    memoriaId: opts.memoriaId ?? "m1",
    destino: opts.destino ?? "starseed",
    huella: await huellaContenido(texto),
    bytes: texto.length,
    actualizadoMs: opts.actualizadoMs === undefined ? 1000 : opts.actualizadoMs,
  };
}

describe("huellaContenido", () => {
  it("es SHA-256 en hexadecimal (64 caracteres)", async () => {
    expect(await huellaContenido("hola")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no cambia con \\r\\n: Windows y Unix dan la MISMA huella", async () => {
    const windows = "línea 1\r\nlínea 2\r\núltima";
    const unix = "línea 1\nlínea 2\núltima";
    expect(await huellaContenido(windows)).toBe(await huellaContenido(unix));
  });

  it("cambia si el contenido cambia", async () => {
    expect(await huellaContenido("versión A")).not.toBe(await huellaContenido("versión B"));
  });
});

describe("construirManifiesto — agrupación por huella", () => {
  it("junta las copias idénticas y lista destinos sin repetir", async () => {
    const local = await copia({ destino: "local", texto: "mis notas" });
    const gdrive = await copia({ destino: "gdrive", texto: "mis notas" });
    const otra = await copia({ destino: "local", texto: "otra memoria", memoriaId: "m2" });
    const m = construirManifiesto([local, gdrive, otra]);
    expect(m.grupos).toHaveLength(2);
    const grupoNotas = m.grupos.find((g) => g.copias.includes(local));
    expect(grupoNotas?.copias).toHaveLength(2);
    expect(grupoNotas?.destinos).toEqual(["gdrive", "local"]);
    expect(grupoNotas?.divergente).toBe(false);
    expect(m.totalCopias).toBe(3);
    expect(m.memorias).toBe(2);
    expect(m.conCopiaUnica).toBe(1);
    expect(m.divergentes).toBe(0);
  });

  it("una memoria con dos contenidos vive en dos grupos y ambos quedan divergentes", async () => {
    const vieja = await copia({ destino: "local", texto: "versión vieja" });
    const nueva = await copia({ destino: "gdrive", texto: "versión nueva" });
    const m = construirManifiesto([vieja, nueva]);
    expect(m.grupos.every((g) => g.divergente)).toBe(true);
    expect(m.divergentes).toBe(1);
  });

  it("ultimaCopia: gana la MÁS NUEVA; en empate y sin fechas queda null", async () => {
    const vieja = await copia({ destino: "local", texto: "igual", actualizadoMs: 1000 });
    const nueva = await copia({ destino: "gdrive", texto: "igual", actualizadoMs: 2000 });
    expect(construirManifiesto([vieja, nueva]).grupos[0].ultimaCopia).toEqual(nueva);
    const empate = [
      await copia({ destino: "local", texto: "igual", actualizadoMs: 1500 }),
      await copia({ destino: "gdrive", texto: "igual", actualizadoMs: 1500 }),
    ];
    expect(construirManifiesto(empate).grupos[0].ultimaCopia).toBeNull();
    const sinFechas = [
      await copia({ destino: "local", texto: "igual", actualizadoMs: null }),
      await copia({ destino: "gdrive", texto: "igual", actualizadoMs: null }),
    ];
    expect(construirManifiesto(sinFechas).grupos[0].ultimaCopia).toBeNull();
  });
});

describe("divergencias", () => {
  it("lista la memoria con huellas distintas y señala la ganadora (la más nueva)", async () => {
    const local = await copia({ destino: "local", texto: "versión vieja", actualizadoMs: 1000 });
    const gdrive = await copia({ destino: "gdrive", texto: "versión nueva", actualizadoMs: 2000 });
    const ds = divergencias(construirManifiesto([local, gdrive]));
    expect(ds).toHaveLength(1);
    expect(ds[0].cerebroId).toBe("c1");
    expect(ds[0].memoriaId).toBe("m1");
    expect(ds[0].huellas).toHaveLength(2);
    expect(ds[0].ganadora).toEqual(gdrive);
  });

  it("empate exacto: no declara ganadora (el empate no escribe nada)", async () => {
    const local = await copia({ destino: "local", texto: "versión A", actualizadoMs: 1500 });
    const gdrive = await copia({ destino: "gdrive", texto: "versión B", actualizadoMs: 1500 });
    expect(divergencias(construirManifiesto([local, gdrive]))[0].ganadora).toBeNull();
  });

  it("una copia sin fecha no puede superar a la fechada: gana la fechada", async () => {
    const sinFecha = await copia({ destino: "p2p", texto: "versión B", actualizadoMs: null });
    const fechada = await copia({ destino: "gdrive", texto: "versión A", actualizadoMs: 1000 });
    expect(divergencias(construirManifiesto([sinFecha, fechada]))[0].ganadora).toEqual(fechada);
  });

  it("una memoria con una sola huella NO es divergencia", async () => {
    const a = await copia({ destino: "local", texto: "igual" });
    const b = await copia({ destino: "starseed", texto: "igual" });
    expect(divergencias(construirManifiesto([a, b]))).toEqual([]);
  });
});

describe("proponerLimpieza", () => {
  it("propone solo copias redundantes y JAMÁS la última copia", async () => {
    const local = await copia({ destino: "local", texto: "igual", actualizadoMs: 3000 });
    const gdrive = await copia({ destino: "gdrive", texto: "igual", actualizadoMs: 1000 });
    const p2p = await copia({ destino: "p2p", texto: "igual", actualizadoMs: 2000 });
    const props = proponerLimpieza(construirManifiesto([local, gdrive, p2p]));
    expect(props.map((p) => p.destino).sort()).toEqual(["gdrive", "p2p"]);
    expect(props.every((p) => p.requiereConfirmacion)).toBe(true);
    expect(props.every((p) => p.huella === local.huella)).toBe(true);
  });

  it("no se propone quitar la última copia NI la única copia de un destino local", async () => {
    const local = await copia({ destino: "local", texto: "igual", actualizadoMs: 1000 });
    const gdrive = await copia({ destino: "gdrive", texto: "igual", actualizadoMs: 2000 });
    expect(proponerLimpieza(construirManifiesto([local, gdrive]))).toEqual([]);
  });

  it("una memoria con UNA sola copia no se toca nunca", async () => {
    const solo = await copia({ destino: "local", texto: "única" });
    expect(proponerLimpieza(construirManifiesto([solo]))).toEqual([]);
  });

  it("no sugiere quitar de un destino porque falte en otro (divergencia ≠ limpieza)", async () => {
    const local = await copia({ destino: "local", texto: "versión local", actualizadoMs: 1000 });
    const gdrive = await copia({ destino: "gdrive", texto: "versión drive", actualizadoMs: 2000 });
    expect(proponerLimpieza(construirManifiesto([local, gdrive]))).toEqual([]);
  });

  it("una copia sin fecha nunca se propone (no se sabe si es la última)", async () => {
    const sinFecha = await copia({ destino: "p2p", texto: "igual", actualizadoMs: null });
    const fechada = await copia({ destino: "gdrive", texto: "igual", actualizadoMs: 500 });
    expect(proponerLimpieza(construirManifiesto([sinFecha, fechada]))).toEqual([]);
  });

  it("dos copias LOCALES idénticas: se puede proponer quitar cualquiera de ellas", async () => {
    const vieja = await copia({ destino: "local", texto: "igual", actualizadoMs: 1000 });
    const nueva = await copia({ destino: "local", texto: "igual", actualizadoMs: 2000 });
    const enNube = await copia({ destino: "starseed", texto: "igual", actualizadoMs: 3000 });
    const props = proponerLimpieza(construirManifiesto([vieja, nueva, enNube]));
    expect(props.map((p) => p.destino)).toEqual(["local", "local"]);
  });
});

describe("orden determinista", () => {
  it("el mismo manojo de copias en cualquier orden da el MISMO manifiesto y las mismas listas", async () => {
    const manojo = [
      await copia({ destino: "local", texto: "A", actualizadoMs: 1000 }),
      await copia({ destino: "gdrive", texto: "A", actualizadoMs: 2000 }),
      await copia({ destino: "p2p", texto: "B", actualizadoMs: 3000 }),
      await copia({ destino: "externo", texto: "C", actualizadoMs: 4000, memoriaId: "m2" }),
      await copia({ destino: "starseed", texto: "C cambiada", actualizadoMs: 5000, memoriaId: "m2" }),
    ];
    const invertido = [...manojo].reverse();
    expect(construirManifiesto(manojo)).toEqual(construirManifiesto(invertido));
    expect(divergencias(construirManifiesto(manojo))).toEqual(divergencias(construirManifiesto(invertido)));
    expect(proponerLimpieza(construirManifiesto(manojo))).toEqual(proponerLimpieza(construirManifiesto(invertido)));
  });
});

describe("resumenManifiesto", () => {
  it("habla en español: «3 memorias, 1 con copia única, 1 divergente»", async () => {
    const m = construirManifiesto([
      await copia({ destino: "local", texto: "igual", actualizadoMs: 1000 }),
      await copia({ destino: "gdrive", texto: "igual", actualizadoMs: 2000 }),
      await copia({ destino: "local", texto: "sola", memoriaId: "m2" }),
      await copia({ destino: "starseed", texto: "vieja", memoriaId: "m3", actualizadoMs: 1000 }),
      await copia({ destino: "p2p", texto: "nueva", memoriaId: "m3", actualizadoMs: 2000 }),
    ]);
    expect(resumenManifiesto(m)).toBe("3 memorias, 1 con copia única, 1 divergente");
  });

  it("una sola memoria con una sola copia: «1 memoria, 1 con copia única, 0 divergentes»", async () => {
    const m = construirManifiesto([await copia({ destino: "local", texto: "solo" })]);
    expect(resumenManifiesto(m)).toBe("1 memoria, 1 con copia única, 0 divergentes");
  });
});
