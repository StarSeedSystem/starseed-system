import { describe, expect, it } from "vitest";
import {
  CLAVE_DIRECTIVAS,
  debeGuardarDirectiva,
  directivaActiva,
  guardarDirectivas,
  leerDirectivas,
  normalizarRegistroDirectivas,
  validarArchivoDirectivas,
  type AlmacenDirectivas,
} from "../directivas-almacen";
import type { ArchivoDirectivas, DirectivaCapa } from "../directivas";

const directiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio", version: 2, sha256: "a".repeat(64),
  acierto: 0.6, base: 0.5, n: 80, fecha: "2026-10-27",
  origen: "meta-n", estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.",
  ...extra,
});

const archivo = (
  historial: DirectivaCapa[],
  activa: number | null,
  capa = "juicio",
): ArchivoDirectivas => ({ v: 1, capa, activa, historial });

/** Doble de almacenamiento en memoria que cuenta las escrituras. */
const doble = (inicial: string | null = null): AlmacenDirectivas & { veces: () => number } => {
  let valor: string | null = inicial;
  let escrituras = 0;
  return {
    getItem: () => valor,
    setItem: (_clave: string, nuevo: string) => { valor = nuevo; escrituras += 1; },
    veces: () => escrituras,
  };
};

describe("validarArchivoDirectivas", () => {
  it("acepta un archivo válido tal cual", () => {
    const bueno = archivo([directiva()], 2);
    expect(validarArchivoDirectivas(bueno)).toEqual(bueno);
  });
  it("rechaza versión, activa o historial que no cuadran", () => {
    expect(validarArchivoDirectivas({ ...archivo([directiva()], 2), v: 2 })).toBeNull();
    expect(validarArchivoDirectivas({ ...archivo([directiva()], 2), activa: "dos" })).toBeNull();
    expect(validarArchivoDirectivas({ ...archivo([directiva()], 2), activa: 2.5 })).toBeNull();
    expect(validarArchivoDirectivas({ ...archivo([directiva()], 2), historial: "no" })).toBeNull();
    expect(validarArchivoDirectivas({ ...archivo([directiva()], 2), capa: "" })).toBeNull();
  });
  it("se queda solo con las directivas bien formadas del historial", () => {
    const rota = { ...directiva({ version: 1, estado: "anterior" }), texto: undefined } as unknown as DirectivaCapa;
    const rara = { ...directiva(), estado: "canaria" } as unknown as DirectivaCapa;
    const pasado = validarArchivoDirectivas(archivo([rota, rara], 2));
    expect(pasado?.historial).toEqual([]);
  });
});

describe("normalizarRegistroDirectivas", () => {
  it("apunta cada archivo por SU capa, aunque la clave no coincida", () => {
    const registro = normalizarRegistroDirectivas({
      "clave-tonta": archivo([directiva()], 2),
    });
    expect(registro["juicio"]).toEqual(archivo([directiva()], 2));
    expect(registro["clave-tonta"]).toBeUndefined();
  });
  it("se cae lo basura: archivos inválidos y valores que no son objetos", () => {
    expect(normalizarRegistroDirectivas({ juicio: { v: 2 } })).toEqual({});
    expect(normalizarRegistroDirectivas({ juicio: null, otras: 7 })).toEqual({});
    expect(normalizarRegistroDirectivas(null)).toEqual({});
  });
});

describe("debeGuardarDirectiva", () => {
  it("guarda si no había archivo para esa capa", () => {
    expect(debeGuardarDirectiva(undefined, archivo([directiva()], 2))).toBe(true);
  });
  it("no guarda lo igual: mismo historial y misma activa", () => {
    const mismo = archivo([directiva()], 2);
    expect(debeGuardarDirectiva(mismo, archivo([directiva()], 2))).toBe(false);
    const sinActiva = archivo([directiva({ estado: "propuesta" })], null);
    expect(debeGuardarDirectiva(sinActiva, archivo([directiva({ estado: "propuesta" })], null)))
      .toBe(false);
  });
  it("guarda la versión activa más nueva", () => {
    const actual = archivo([directiva()], 2);
    expect(debeGuardarDirectiva(actual, archivo([directiva({ version: 3, estado: "activa" })], 3)))
      .toBe(true);
  });
  it("la versión activa más vieja, con el MISMO historial, no vuelve a pisar", () => {
    const d1 = directiva({ version: 1, estado: "anterior" });
    const d2 = directiva();
    const actual = archivo([d1, d2], 2);
    const nuevo = archivo([{ ...d1 }, { ...d2 }], 1);
    expect(JSON.stringify(nuevo.historial)).toBe(JSON.stringify(actual.historial));
    expect(debeGuardarDirectiva(actual, nuevo)).toBe(false);
  });
  it("guarda si cambió el historial aunque la activa sea más vieja (vuelta atrás)", () => {
    const actual = archivo([directiva()], 3);
    const vuelta = archivo([directiva({ version: 1, estado: "anterior" })], 1);
    expect(debeGuardarDirectiva(actual, vuelta)).toBe(true);
  });
});

describe("leerDirectivas", () => {
  it("lee el registro que hay en la clave", () => {
    const al = doble(JSON.stringify({ juicio: archivo([directiva()], 2) }));
    expect(leerDirectivas(al)).toEqual({ juicio: archivo([directiva()], 2) });
  });
  it("ante JSON roto, nada o basura devuelve {} sin lanzar", () => {
    expect(leerDirectivas(doble("{roto"))).toEqual({});
    expect(leerDirectivas(doble())).toEqual({});
    expect(leerDirectivas(doble(JSON.stringify({ juicio: { v: 2 } })))).toEqual({});
  });
  it("sin almacenamiento disponible devuelve {} sin lanzar", () => {
    expect(leerDirectivas()).toEqual({});
  });
});

describe("guardarDirectivas", () => {
  it("guarda un archivo nuevo, escribiendo la clave con TODAS las capas", () => {
    const al = doble();
    expect(guardarDirectivas("juicio", archivo([directiva()], 2), al)).toEqual({ ok: true, guardado: true });
    expect(leerDirectivas(al)).toEqual({ juicio: archivo([directiva()], 2) });
  });
  it("retiene el mínimo esfuerzo: repetir lo mismo ni toca localStorage", () => {
    const al = doble();
    guardarDirectivas("juicio", archivo([directiva()], 2), al);
    const vecesPrimera = al.veces();
    expect(guardarDirectivas("juicio", archivo([directiva()], 2), al)).toEqual({ ok: true, guardado: false });
    expect(al.veces()).toBe(vecesPrimera);
  });
  it("guarda una versión más nueva", () => {
    const al = doble();
    guardarDirectivas("juicio", archivo([directiva()], 2), al);
    expect(guardarDirectivas("juicio", archivo([directiva({ version: 3, estado: "activa" })], 3), al).ok)
      .toBe(true);
    expect(leerDirectivas(al).juicio?.activa).toBe(3);
  });
  it("no toca localStorage ante la versión activa más vieja con el MISMO historial", () => {
    const al = doble();
    const d1 = directiva({ version: 1, estado: "anterior" });
    const d2 = directiva();
    guardarDirectivas("juicio", archivo([d1, d2], 2), al);
    const vecesAntes = al.veces();
    guardarDirectivas("juicio", archivo([{ ...d1 }, { ...d2 }], 1), al);
    expect(al.veces()).toBe(vecesAntes);
    expect(leerDirectivas(al).juicio?.activa).toBe(2);
  });
  it("conserva las demás capas al guardar una", () => {
    const al = doble();
    guardarDirectivas("juicio", archivo([directiva()], 2, "juicio"), al);
    guardarDirectivas("palabra", archivo([directiva({ capa: "palabra" })], 1, "palabra"), al);
    expect(Object.keys(leerDirectivas(al))).toEqual(["juicio", "palabra"]);
  });
  it("rechaza archivo inválido, capa desemparejada o vacía", () => {
    const al = doble();
    expect(guardarDirectivas("juicio", archivo([directiva()], 2, "palabra"), al).ok).toBe(false);
    expect(guardarDirectivas("juicio", { v: 2 } as unknown as ArchivoDirectivas, al).ok).toBe(false);
    expect(guardarDirectivas("", archivo([directiva()], 2), al).ok).toBe(false);
  });
});

describe("directivaActiva", () => {
  it("da la directiva activa de la capa", () => {
    const al = doble(JSON.stringify({ juicio: archivo([directiva({ version: 1, estado: "anterior" }), directiva()], 2) }));
    expect(directivaActiva("juicio", al)).toEqual(directiva());
  });
  it("sin capa, sin activa o con activa que no cuadra da undefined", () => {
    const al = doble(JSON.stringify({
      juicio: archivo([directiva({ version: 1, estado: "anterior" })], 2),
      palabra: archivo([directiva({ capa: "palabra" })], null),
    }));
    expect(directivaActiva("juicio", al)).toBeUndefined();
    expect(directivaActiva("palabra", al)).toBeUndefined();
    expect(directivaActiva("otra", al)).toBeUndefined();
  });
});
