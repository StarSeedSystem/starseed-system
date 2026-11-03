// @vitest-environment jsdom
// Almacén de directivas de automejora Meta^n (MTN1027Cb · contrato §3–§4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRECTIVAS_EVENT, DIRECTIVAS_KEY, directivaActiva, guardarDirectivas, leerDirectivas,
} from "../directivas-almacen";
import type { ArchivoDirectivas, DirectivaCapa } from "../directivas";
const crearDirectiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio", version: 2, sha256: "a".repeat(64), acierto: 0.6, base: 0.5, n: 80, fecha: "2026-10-27",
  origen: "meta-n", estado: "activa", texto: "Resume el objetivo en una frase antes de responder.", ...extra,
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
describe("clave, evento y lectura defensiva", () => {
  it("usa la clave y el evento acordados, y lee por capa o el mapa completo", () => {
    expect(DIRECTIVAS_KEY).toBe("starseed.capas.directivas.v1");
    expect(DIRECTIVAS_EVENT).toBe("starseed:capas-directivas");
    const juicio = crearArchivo([crearDirectiva()], 2);
    const palabra = crearArchivo([crearDirectiva({ capa: "palabra" })], 2);
    crudo({ juicio, palabra });
    expect(leerDirectivas()).toEqual({ juicio, palabra });
    expect(leerDirectivas("juicio")).toEqual(juicio);
    expect(leerDirectivas("otra")).toBeNull();
  });
  it("con JSON roto o entradas mal formadas devuelve vacío, sin lanzar", () => {
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
    expect(leerDirectivas()).toEqual({ juicio: bueno });
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
  it("guarda varias capas sin pisar las demás", async () => {
    const juicio = crearArchivo([crearDirectiva()], 2);
    const palabra = crearArchivo([crearDirectiva({ capa: "palabra", version: 1 })], 1);
    await guardarDirectivas("juicio", juicio);
    await guardarDirectivas("palabra", palabra);
    expect(leerDirectivas()).toEqual({ juicio, palabra });
    expect(eventos).toBe(2);
  });
  it("rechaza un archivo inválido sin tocar lo guardado", async () => {
    const bueno = crearArchivo([crearDirectiva()], 2);
    crudo({ juicio: bueno });
    const malo = { v: 1, capa: "juicio", activa: "dos", historial: [] } as unknown as ArchivoDirectivas;
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
