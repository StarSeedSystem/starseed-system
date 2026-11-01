import { describe, expect, it } from "vitest";
import {
  debeAplicar, guardarDirectivas, leerDirectivas, directivaActiva,
  normalizarArchivoDirectivas, normalizarDirectivas,
  type ArchivoDirectivas, type DirectivaCapa,
} from "../directivas-almacen";

const directiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio", version: 2, sha256: "a".repeat(64),
  acierto: 0.6, base: 0.5, n: 80, fecha: "2026-10-27",
  origen: "meta-n", estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.",
  ...extra,
});

const archivo = (historial: DirectivaCapa[], activa: number | null): ArchivoDirectivas => ({
  v: 1, capa: "juicio", activa, historial,
});

describe("normalizarArchivoDirectivas", () => {
  it("deja pasar un archivo correcto tal cual", () => {
    const a = archivo([directiva()], 2);
    expect(normalizarArchivoDirectivas(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });
  it("devuelve null ante basura raíz", () => {
    expect(normalizarArchivoDirectivas(null)).toBe(null);
    expect(normalizarArchivoDirectivas("hola")).toBe(null);
    expect(normalizarArchivoDirectivas({ v: 2 })).toBe(null);
    expect(normalizarArchivoDirectivas({ v: 1 })).toBe(null);
    expect(normalizarArchivoDirectivas({ v: 1, capa: "juicio" })).toBe(null);
  });
  it("caen las directivas inválidas del historial, no el archivo entero", () => {
    const sucio = archivo([directiva(), { version: 99 } as unknown as DirectivaCapa], 2);
    const limpio = normalizarArchivoDirectivas(sucio);
    expect(limpio?.historial).toHaveLength(1);
    expect(limpio?.activa).toBe(2);
  });
  it("un activa que no está activa en el historial cae a null", () => {
    const raro = archivo([directiva({ estado: "propuesta" })], 2);
    expect(normalizarArchivoDirectivas(raro)?.activa).toBe(null);
  });
});

describe("normalizarDirectivas", () => {
  it("sanea el registro por capa y suelta lo basura", () => {
    const registro = {
      juicio: archivo([directiva()], 2),
      palabra: { v: 2, capa: "palabra" },
      herramientas: null,
    };
    const r = normalizarDirectivas(registro);
    expect(Object.keys(r)).toEqual(["juicio"]);
  });
  it("una raíz que no es objeto da {}", () => {
    expect(normalizarDirectivas(null)).toEqual({});
    expect(normalizarDirectivas([archivo([], null)])).toEqual({});
  });
});

describe("debeAplicar", () => {
  const actual = archivo([directiva({ version: 1, estado: "anterior" }), directiva()], 2);
  it("sin nada guardado siempre aplica", () => {
    expect(debeAplicar(null, archivo([], null))).toBe(true);
  });
  it("aplica si la activa es más nueva", () => {
    expect(debeAplicar(actual, archivo([directiva({ version: 3 })], 3))).toBe(true);
  });
  it("no aplica un eco idéntico ni una activa vieja sin cambios", () => {
    expect(debeAplicar(actual, archivo(actual.historial, 2))).toBe(false);
    expect(
      debeAplicar(actual, archivo([directiva({ version: 1, estado: "anterior" })], 1)),
    ).toBe(false);
  });
  it("aplica a activa igual si cambia el historial (retirada, vuelta atrás)", () => {
    const tocado = archivo(
      actual.historial.map((d) =>
        d.version === 2 ? { ...d, estado: "retirada" as const, motivo: "vuelta a la anterior" } : d,
      ),
      null,
    );
    expect(debeAplicar(actual, tocado)).toBe(true);
  });
  it("aplica a activa más vieja si el historial cambió (volverALaAnterior)", () => {
    const vuelta = archivo(
      [directiva({ version: 1, estado: "anterior" }), directiva({ estado: "retirada", motivo: "vuelta" })],
      1,
    );
    expect(debeAplicar(actual, vuelta)).toBe(true);
  });
});

describe("capa cliente sin window", () => {
  it("leerDirectivas da {} y directivaActiva null sin almacenamiento", () => {
    expect(leerDirectivas()).toEqual({});
    expect(directivaActiva("juicio")).toBe(null);
  });
  it("guardarDirectivas no peta sin window", () => {
    expect(guardarDirectivas("juicio", archivo([directiva()], 2))).toBe(false);
  });
});
