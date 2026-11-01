// @vitest-environment jsdom
/**
 * directivas-almacen (Ola MTN1027 · Meta^n): el almacén del navegador de las
 * directivas de la automejora de las capas (contrato architecture/automejora-meta-n.md
 * §3–§4). Se demuestra el saneado defensivo, que el sync nunca hace retroceder a una
 * capa (versión activa más vieja o incluso igual), y que la clave viaja con la cuenta.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_DIRECTIVAS,
  EVENTO_DIRECTIVAS,
  directivaActiva,
  guardarDirectivas,
  normalizarArchivoDirectivas,
  normalizarDirectivas,
  leerDirectivas,
} from "../directivas-almacen";
import type { ArchivoDirectivas, DirectivaCapa } from "../directivas";
import { SYNCED_KEYS } from "@/lib/settings-sync";

const dir = (capa: string, version: number, estado: DirectivaCapa["estado"] = "activa"): DirectivaCapa => ({
  capa, version, texto: `Pauta v${version}`, sha256: "a".repeat(64),
  acierto: 0.7, base: 0.65, n: 20, fecha: "2026-10-27", origen: "caja", estado,
});
const archivo = (capa: string, activa: number | null, ...historial: DirectivaCapa[]): ArchivoDirectivas =>
  ({ v: 1, capa, activa, historial });

beforeEach(() => localStorage.clear());

describe("normalizarArchivoDirectivas", () => {
  it("acepta un archivo válido y no toca el original", () => {
    const a = archivo("juicio", 2, dir("juicio", 1, "anterior"), dir("juicio", 2, "activa"));
    expect(normalizarArchivoDirectivas(a)).toEqual(a);
  });

  it("tumba el archivo entero con versión distinta, capa vacía o historial no lista", () => {
    expect(normalizarArchivoDirectivas(null)).toBeNull();
    expect(normalizarArchivoDirectivas({ v: 2, capa: "juicio", activa: null, historial: [] })).toBeNull();
    expect(normalizarArchivoDirectivas({ v: 1, capa: "", activa: null, historial: [] })).toBeNull();
    expect(normalizarArchivoDirectivas({ v: 1, capa: "juicio", activa: null, historial: "x" })).toBeNull();
    expect(normalizarArchivoDirectivas({ v: 1, capa: "juicio", activa: 3.5, historial: [] })).toBeNull();
  });

  it("filtra del historial las entradas rotas y cae si la activa quedó fuera", () => {
    const sano = normalizarArchivoDirectivas(archivo("juicio", null, dir("juicio", 1), { capa: "juicio" } as unknown as DirectivaCapa));
    expect(sano?.historial).toHaveLength(1);
    expect(normalizarArchivoDirectivas(archivo("juicio", 1, { capa: "juicio" } as unknown as DirectivaCapa))).toBeNull();
  });

  it("sanea el mapa completo: lo inválido se cae, lo válido queda", () => {
    const mapa = normalizarDirectivas({ juicio: archivo("juicio", null), mal: "x" });
    expect(Object.keys(mapa)).toEqual(["juicio"]);
    expect(normalizarDirectivas("basura")).toEqual({});
  });
});

describe("leerDirectivas · lectura defensiva", () => {
  it("sin dato o con JSON roto devuelve {} y no lanza", () => {
    expect(leerDirectivas()).toEqual({});
    localStorage.setItem(CLAVE_DIRECTIVAS, "{roto");
    expect(leerDirectivas()).toEqual({});
  });

  it("redondea el viaje: guardar → JSON → leer devuelve lo mismo", () => {
    const a = archivo("juicio", 2, dir("juicio", 2, "activa"));
    expect(guardarDirectivas("juicio", a)).toBe(true);
    expect(guardarDirectivas("palabra", archivo("palabra", null))).toBe(true);
    expect(leerDirectivas()).toEqual({ juicio: a, palabra: archivo("palabra", null) });
  });
});

describe("guardarDirectivas · solo si aporta algo nuevo", () => {
  const v2 = archivo("juicio", 2, dir("juicio", 2, "activa"));
  const v3 = archivo("juicio", 3, dir("juicio", 2, "anterior"), dir("juicio", 3, "activa"));

  it("escribe desde vacío y emite el evento propio de las pantallas", () => {
    const eventos: string[] = [];
    window.addEventListener(EVENTO_DIRECTIVAS, (e) => eventos.push(e.type));
    guardarDirectivas("juicio", v2);
    expect(eventos).toEqual([EVENTO_DIRECTIVAS]);
    expect(directivaActiva("juicio")?.version).toBe(2);
  });

  it("rechaza retroceder la versión activa si el historial no cambió", () => {
    guardarDirectivas("juicio", v3);
    // Lo que llegaría de un dispositivo Viejo: mismas entradas, activa desplazada atrás.
    const viejo = archivo("juicio", 2, dir("juicio", 2, "anterior"), dir("juicio", 3, "activa"));
    expect(guardarDirectivas("juicio", viejo)).toBe(false);
    expect(directivaActiva("juicio")?.version).toBe(3);
  });

  it("acepta una vuelta atrás real: historial distinto aunque la versión activa sea más vieja", () => {
    guardarDirectivas("juicio", v3);
    const retirada = { ...dir("juicio", 3, "retirada"), motivo: "vuelta a la anterior" };
    const vuelta = archivo("juicio", 2, dir("juicio", 2), retirada);
    expect(guardarDirectivas("juicio", vuelta)).toBe(true);
    expect(directivaActiva("juicio")?.version).toBe(2);
  });

  it("rechaza lo idéntico", () => {
    guardarDirectivas("juicio", v2);
    expect(guardarDirectivas("juicio", { ...v2 })).toBe(false);
  });

  it("acepta un historial distinto con la MISMA versión activa (retiro, medidas)", () => {
    guardarDirectivas("juicio", v2);
    const conRetiro = archivo("juicio", 2, dir("juicio", 2, "retirada"));
    expect(guardarDirectivas("juicio", conRetiro)).toBe(true);
    expect(directivaActiva("juicio")).toBeUndefined();
  });

  it("rechaza un archivo inválido aunque la capa esté vacía", () => {
    expect(guardarDirectivas("juicio", { v: 1, capa: "otra", activa: null, historial: [] })).toBe(false);
    expect(leerDirectivas()).toEqual({});
  });

  it("otra capa no aprovecha la puerta: cada archivo se juzga solo", () => {
    guardarDirectivas("juicio", v3);
    expect(guardarDirectivas("palabra", archivo("palabra", 1, dir("palabra", 1)))).toBe(true);
    expect(directivaActiva("juicio")?.version).toBe(3);
    expect(directivaActiva("palabra")?.version).toBe(1);
  });
});

describe("viaja con la cuenta", () => {
  it("la clave está en SYNCED_KEYS", () => {
    expect(SYNCED_KEYS).toContain(CLAVE_DIRECTIVAS);
    expect(CLAVE_DIRECTIVAS).toBe("starseed.capas.directivas.v1");
  });
});
