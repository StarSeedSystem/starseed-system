// @vitest-environment jsdom
// Almacén de directivas de automejora Meta^n (MTN1027C · contrato §3–§4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRECTIVAS_EVENT,
  DIRECTIVAS_KEY,
  directivaActiva,
  guardarDirectivas,
  leerDirectivas,
  normalizarArchivoDirectivas,
  normalizarRegistroDirectivas,
  debeGuardarDirectivas,
} from "../directivas-almacen";
import type { ArchivoDirectivas, DirectivaCapa } from "../directivas";

const crearDirectiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio",
  version: 2,
  sha256: "a".repeat(64),
  acierto: 0.6,
  base: 0.5,
  n: 80,
  fecha: "2026-10-27",
  origen: "meta-n",
  estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.",
  ...extra,
});

const crearArchivo = (historial: DirectivaCapa[], activa: number | null): ArchivoDirectivas =>
  ({ v: 1, capa: "juicio", activa, historial });

const crudo = (valor: unknown): void =>
  localStorage.setItem(DIRECTIVAS_KEY, JSON.stringify(valor));

let eventos = 0;
const contar = (): void => { eventos += 1; };

beforeEach(() => {
  eventos = 0;
  localStorage.clear();
  window.addEventListener(DIRECTIVAS_EVENT, contar);
});

afterEach(() => window.removeEventListener(DIRECTIVAS_EVENT, contar));

describe("constantes del almacén de directivas", () => {
  it("usa la clave y el evento acordados", () => {
    expect(DIRECTIVAS_KEY).toBe("starseed.capas.directivas.v1");
    expect(DIRECTIVAS_EVENT).toBe("starseed:capas-directivas");
  });
});

describe("normalizarArchivoDirectivas", () => {
  it("basura → null; versión ajena → null; capa vacía → null", () => {
    expect(normalizarArchivoDirectivas("reversible")).toBe(null);
    expect(normalizarArchivoDirectivas({ v: 2 })).toBe(null);
    expect(normalizarArchivoDirectivas({ v: 1, capa: "", activa: 1, historial: [] })).toBe(null);
  });

  it("sanea directivas inválidas del historial y conserva las válidas", () => {
    const valido = crearDirectiva({ version: 1 });
    const entrada = {
      v: 1,
      capa: "juicio",
      activa: 1,
      historial: [
        valido,
        { version: "no-numero" },
        { version: 2, texto: 123 },
        { version: 3, estado: "desconocido" },
      ],
    };
    const saneado = normalizarArchivoDirectivas(entrada);
    expect(saneado).not.toBeNull();
    expect(saneado?.historial).toHaveLength(1);
    expect(saneado?.historial[0].version).toBe(1);
  });

  it("aplica valores por defecto a campos numéricos faltantes", () => {
    const entrada = {
      v: 1,
      capa: "juicio",
      activa: 1,
      historial: [{ version: 1, texto: "x", fecha: "2026-01-01", origen: "meta-n", estado: "activa" }],
    };
    const saneado = normalizarArchivoDirectivas(entrada);
    expect(saneado).not.toBeNull();
    const d = saneado!.historial[0];
    expect(d.acierto).toBe(0);
    expect(d.base).toBe(0);
    expect(d.n).toBe(0);
    expect(d.sha256).toBe("");
  });

  it("conserva motivo si es string", () => {
    const entrada = {
      v: 1,
      capa: "juicio",
      activa: 1,
      historial: [{ version: 1, texto: "x", fecha: "2026-01-01", origen: "meta-n", estado: "activa", motivo: "razón" }],
    };
    const saneado = normalizarArchivoDirectivas(entrada);
    expect(saneado?.historial[0].motivo).toBe("razón");
  });
});

describe("normalizarRegistroDirectivas", () => {
  it("entrada nula o no objeto → {}", () => {
    expect(normalizarRegistroDirectivas(null)).toEqual({});
    expect(normalizarRegistroDirectivas("nada")).toEqual({});
    expect(normalizarRegistroDirectivas({ capa_: "rara sin camino" })).toEqual({});
  });

  it("filtra capas inválidas (v≠1, sin capa) y sana las válidas", () => {
    const bueno = crearArchivo([crearDirectiva({ version: 1 })], 1);
    const entrada = {
      juicio: bueno,
      v2: { v: 2, capa: "v2", activa: 1, historial: [] },
      texto: "no soy objeto",
      sinActiva: { v: 1, capa: "x", historial: [] },
      historialMalo: { v: 1, capa: "x", activa: 1, historial: [{ version: "1" }] },
    };
    const saneado = normalizarRegistroDirectivas(entrada);
    // sinActiva e historialMalo tienen v=1, capa string, activa number, historial array → pasan
    expect(Object.keys(saneado)).toEqual(["juicio", "sinActiva", "historialMalo"]);
    expect(saneado.juicio).toEqual(bueno);
    expect(saneado.sinActiva.historial).toEqual([]);
    expect(saneado.historialMalo.historial).toEqual([]);
  });

  it("rechaza capas sin v=1 o sin capa string", () => {
    const bueno = crearArchivo([crearDirectiva({ version: 1 })], 1);
    const entrada = {
      juicio: bueno,
      sinV: { capa: "x", activa: 1, historial: [] },
      capaNoString: { v: 1, capa: 123, activa: 1, historial: [] },
    };
    const saneado = normalizarRegistroDirectivas(entrada);
    expect(Object.keys(saneado)).toEqual(["juicio"]);
  });
});

describe("clave, evento y lectura defensiva", () => {
  it("lee por capa o el mapa completo", () => {
    const juicio = crearArchivo([crearDirectiva()], 2);
    const palabra = crearArchivo([crearDirectiva({ capa: "palabra" })], 2);
    crudo({ juicio, palabra });
    expect(leerDirectivas()).toEqual({ juicio, palabra });
    expect(leerDirectivas("juicio")).toEqual(juicio);
    expect(leerDirectivas("otra")).toBeNull();
  });

  it("con JSON roto o entradas mal formadas devuelve solo las válidas, sin lanzar", () => {
    localStorage.setItem(DIRECTIVAS_KEY, "{no soy json");
    expect(leerDirectivas()).toEqual({});
    const bueno = crearArchivo([crearDirectiva()], 2);
    crudo({
      juicio: bueno,
      v2: { v: 2, capa: "v2", activa: 1, historial: [] },
      texto: "no soy objeto",
      sinActiva: { v: 1, capa: "x", historial: [] },
      historialMalo: { v: 1, capa: "x", activa: 1, historial: [{ version: "1" }] },
    });
    // sinActiva e historialMalo tienen estructura válida y pasan la normalización
    const leido = leerDirectivas();
    expect(leido.juicio).toEqual(bueno);
    expect(leido.sinActiva).toBeDefined();
    expect(leido.historialMalo).toBeDefined();
    expect(leido.sinActiva.historial).toEqual([]);
    expect(leido.historialMalo.historial).toEqual([]);
  });
});

describe("debeGuardarDirectivas (regla pura)", () => {
  it("true si no hay previo", () => {
    expect(debeGuardarDirectivas(undefined, crearArchivo([crearDirectiva()], 1))).toBe(true);
  });

  it("false si gemelo idéntico", () => {
    const archivo = crearArchivo([crearDirectiva({ version: 1 })], 1);
    expect(debeGuardarDirectivas(archivo, archivo)).toBe(false);
  });

  it("true si versión activa es más nueva", () => {
    const actual = crearArchivo([crearDirectiva({ version: 1 })], 1);
    const nuevo = crearArchivo([crearDirectiva({ version: 2 })], 2);
    expect(debeGuardarDirectivas(actual, nuevo)).toBe(true);
  });

  it("true si historial cambió (estado, texto, motivo) aunque activa sea igual", () => {
    const actual = crearArchivo([crearDirectiva({ version: 1, estado: "activa" })], 1);
    const nuevo = crearArchivo([crearDirectiva({ version: 1, estado: "retirada" })], 1);
    expect(debeGuardarDirectivas(actual, nuevo)).toBe(true);
  });

  it("true si historial cambió (añadir motivo) aunque activa sea igual", () => {
    const actual = crearArchivo([crearDirectiva({ version: 1, motivo: undefined })], 1);
    const nuevo = crearArchivo([crearDirectiva({ version: 1, motivo: "razón" })], 1);
    expect(debeGuardarDirectivas(actual, nuevo)).toBe(true);
  });

  it("true si historial cambió (cambio de texto) aunque activa sea igual", () => {
    const actual = crearArchivo([crearDirectiva({ version: 1, texto: "original" })], 1);
    const nuevo = crearArchivo([crearDirectiva({ version: 1, texto: "editado" })], 1);
    expect(debeGuardarDirectivas(actual, nuevo)).toBe(true);
  });

  it("false si versión activa es menor o igual y historial idéntico", () => {
    // Mismo historial (directiva version 1), pero actual.activa=2 > nuevo.activa=1
    const historial = [crearDirectiva({ version: 1 })];
    const actual = crearArchivo(historial, 2);
    const nuevo = crearArchivo(historial, 1);
    expect(debeGuardarDirectivas(actual, nuevo)).toBe(false);
  });

  it("false si nuevo es null", () => {
    const actual = crearArchivo([crearDirectiva()], 1);
    expect(debeGuardarDirectivas(actual, null)).toBe(false);
  });
});

describe("guardarDirectivas", () => {
  it("guarda una capa nueva, avisa una vez y deja leerla", async () => {
    const archivo = crearArchivo([crearDirectiva()], 2);
    await expect(guardarDirectivas("juicio", archivo)).resolves.toBe(true);
    expect(eventos).toBe(1);
    expect(leerDirectivas("juicio")).toEqual(archivo);
  });

  it("no reescribe ni avisa si nada cambió o la versión activa es menor", async () => {
    const archivo = crearArchivo([crearDirectiva()], 2);
    crudo({ juicio: archivo });
    await expect(guardarDirectivas("juicio", archivo)).resolves.toBe(false);
    await expect(guardarDirectivas("juicio", crearArchivo(archivo.historial, 0))).resolves.toBe(false);
    expect(eventos).toBe(0);
  });

  it("guarda la vuelta atrás aunque baje la versión: cambió el historial", async () => {
    const previo = crearArchivo([crearDirectiva({ version: 1 })], 1);
    await guardarDirectivas("juicio", previo);
    const vuelta = crearArchivo([crearDirectiva({ version: 1, estado: "retirada" })], null);
    await expect(guardarDirectivas("juicio", vuelta)).resolves.toBe(true);
    expect(leerDirectivas("juicio")).toEqual(vuelta);
  });

  it("guarda al editar texto de directiva existente sin nueva entrada en historial", async () => {
    const original = crearArchivo([crearDirectiva({ version: 1, texto: "Original" })], 1);
    await guardarDirectivas("juicio", original);
    const editado = crearArchivo([crearDirectiva({ version: 1, texto: "Editado" })], 1);
    await expect(guardarDirectivas("juicio", editado)).resolves.toBe(true);
    expect(leerDirectivas("juicio")?.historial[0].texto).toBe("Editado");
    expect(eventos).toBe(2);
  });

  it("guarda al cambiar estado de activa a retirada sin cambio de versión", async () => {
    const original = crearArchivo([crearDirectiva({ version: 1, estado: "activa" })], 1);
    await guardarDirectivas("juicio", original);
    const retirada = crearArchivo([crearDirectiva({ version: 1, estado: "retirada" })], null);
    await expect(guardarDirectivas("juicio", retirada)).resolves.toBe(true);
    expect(leerDirectivas("juicio")?.historial[0].estado).toBe("retirada");
    expect(leerDirectivas("juicio")?.activa).toBeNull();
  });

  it("guarda al añadir motivo a directiva existente", async () => {
    const original = crearArchivo([crearDirectiva({ version: 1, motivo: undefined })], 1);
    await guardarDirectivas("juicio", original);
    const conMotivo = crearArchivo([crearDirectiva({ version: 1, motivo: "Razón del cambio" })], 1);
    await expect(guardarDirectivas("juicio", conMotivo)).resolves.toBe(true);
    expect(leerDirectivas("juicio")?.historial[0].motivo).toBe("Razón del cambio");
  });

  it("guarda varias capas sin pisar las demás", async () => {
    const juicio = crearArchivo([crearDirectiva()], 2);
    const palabra = crearArchivo([crearDirectiva({ capa: "palabra", version: 1 })], 1);
    await guardarDirectivas("juicio", juicio);
    await guardarDirectivas("palabra", palabra);
    expect(leerDirectivas()).toEqual({ juicio, palabra });
    expect(eventos).toBe(2);
  });

  it("rechaza un archivo inválido (sin v=1 o sin capa string) sin tocar lo guardado", async () => {
    const bueno = crearArchivo([crearDirectiva()], 2);
    crudo({ juicio: bueno });
    // v=2 → versión ajena → null
    const malo = { v: 2, capa: "juicio", activa: 1, historial: [] } as unknown as ArchivoDirectivas;
    await expect(guardarDirectivas("juicio", malo)).resolves.toBe(false);
    expect(leerDirectivas("juicio")).toEqual(bueno);
    expect(eventos).toBe(0);
  });

  it("devuelve false si localStorage falla al escribir", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("Quota exceeded"); };
    try {
      await expect(guardarDirectivas("juicio", crearArchivo([crearDirectiva()], 2))).resolves.toBe(false);
    } finally { Storage.prototype.setItem = original; }
  });

  it("sanea la entrada antes de guardar (campos numéricos por defecto, filtra directivas inválidas)", async () => {
    const entradaSucia = {
      v: 1,
      capa: "juicio",
      activa: 1,
      historial: [
        { version: 1, texto: "válida", fecha: "2026-01-01", origen: "meta-n", estado: "activa" },
        { version: "no-numero" },
      ],
    } as unknown as ArchivoDirectivas;
    await expect(guardarDirectivas("juicio", entradaSucia)).resolves.toBe(true);
    const guardado = leerDirectivas("juicio");
    expect(guardado).not.toBeNull();
    expect(guardado?.historial).toHaveLength(1);
    expect(guardado?.historial[0].acierto).toBe(0);
    expect(guardado?.historial[0].base).toBe(0);
    expect(guardado?.historial[0].n).toBe(0);
  });
});

describe("sin window (SSR)", () => {
  it("no lanza y todas las funciones responden sin dato", async () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(leerDirectivas()).toEqual({});
      expect(leerDirectivas("juicio")).toBeNull();
      expect(await guardarDirectivas("juicio", crearArchivo([crearDirectiva()], 2))).toBe(false);
      expect(directivaActiva("juicio")).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe("directivaActiva", () => {
  it("devuelve la del historial con esa versión y estado activa", () => {
    const activa = crearDirectiva({ version: 2 });
    crudo({ juicio: crearArchivo([crearDirectiva({ version: 1, estado: "anterior" }), activa], 2) });
    expect(directivaActiva("juicio")).toEqual(activa);
  });

  it("devuelve undefined sin archivo, sin activa o si no está esa versión", () => {
    expect(directivaActiva("juicio")).toBeUndefined();
    crudo({ juicio: crearArchivo([crearDirectiva()], null) });
    expect(directivaActiva("juicio")).toBeUndefined();
    crudo({ juicio: crearArchivo([crearDirectiva({ version: 1, estado: "anterior" })], 99) });
    expect(directivaActiva("juicio")).toBeUndefined();
    crudo({ juicio: crearArchivo([crearDirectiva({ estado: "propuesta" })], 2) });
    expect(directivaActiva("juicio")).toBeUndefined();
  });
});
