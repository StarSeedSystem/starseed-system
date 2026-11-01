import { describe, expect, it } from "vitest";
import {
  debeEscribirArchivo, directivaActivaDe, normalizarArchivoDirectivas,
} from "../directivas-almacen";
import type { ArchivoDirectivas, DirectivaCapa } from "../directivas";

const directiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio", version: 2, sha256: "a".repeat(64),
  acierto: 0.6, base: 0.5, n: 80, fecha: "2026-10-27",
  origen: "meta-n", estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.",
  ...extra,
});

const archivo = (over: Partial<ArchivoDirectivas> = {}): ArchivoDirectivas => ({
  v: 1, capa: "juicio", activa: 2, historial: [directiva()], ...over,
});

describe("normalizarArchivoDirectivas", () => {
  it("acepta un archivo válido y devuelve sus campos enteros", () => {
    expect(normalizarArchivoDirectivas(archivo())).toEqual(archivo());
  });
  it("devuelve null ante basura, versión desconocida o archivo sin capa", () => {
    expect(normalizarArchivoDirectivas(null)).toBeNull();
    expect(normalizarArchivoDirectivas("texto")).toBeNull();
    expect(normalizarArchivoDirectivas({ ...archivo(), v: 2 })).toBeNull();
    expect(normalizarArchivoDirectivas({ v: 1, activa: null, historial: [] })).toBeNull();
  });
  it("filtra las directivas rotas del historial y sanea la versión activa", () => {
    const sucio = archivo({ historial: [directiva(), { capa: "x" } as DirectivaCapa] });
    expect(normalizarArchivoDirectivas(sucio)?.historial).toHaveLength(1);
    const activaRara = archivo({ activa: "2" as unknown as number });
    expect(normalizarArchivoDirectivas(activaRara)?.activa).toBeNull();
  });
});

describe("debeEscribirArchivo", () => {
  it("escribe si no había archivo o si la versión activa es más nueva", () => {
    expect(debeEscribirArchivo(undefined, archivo())).toBe(true);
    expect(debeEscribirArchivo(archivo(), archivo({ activa: 3 }))).toBe(true);
  });
  it("no escribe una versión activa vieja ni un eco igual", () => {
    expect(debeEscribirArchivo(archivo(), archivo({ activa: 1 }))).toBe(false);
    expect(debeEscribirArchivo(archivo(), archivo())).toBe(false);
  });
  it("con versión activa igual pero historia cambiada, escribe", () => {
    const cambiado = archivo({ historial: [...archivo().historial, directiva({ version: 1, estado: "anterior" })] });
    expect(debeEscribirArchivo(archivo(), cambiado)).toBe(true);
  });
  it("una capa sin activa vale menos que otra con ella", () => {
    expect(debeEscribirArchivo(archivo(), archivo({ activa: null }))).toBe(false);
    expect(debeEscribirArchivo(archivo({ activa: null }), archivo())).toBe(true);
  });
});

describe("directivaActivaDe", () => {
  it("devuelve la activa solo si su versión y estado cuadran", () => {
    const d = directiva();
    expect(directivaActivaDe(archivo({ historial: [d] }))).toEqual(d);
    expect(directivaActivaDe(archivo({ activa: 9, historial: [d] }))).toBeUndefined();
    expect(directivaActivaDe(archivo({ historial: [directiva({ estado: "anterior" })] }))).toBeUndefined();
    expect(directivaActivaDe(undefined)).toBeUndefined();
  });
});
