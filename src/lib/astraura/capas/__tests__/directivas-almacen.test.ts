import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAVE_DIRECTIVAS, EVENTO_DIRECTIVAS, activaDeRegistro, directivaActiva, ganaGuardado,
  guardarDirectivas, leerDirectivas, normalizarRegistroDirectivas,
  type ArchivoDirectivas, type DirectivaCapa,
} from "../directivas-almacen";

const directiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio", version: 2, sha256: "a".repeat(64), acierto: 0.6, base: 0.5, n: 80,
  fecha: "2026-10-27", origen: "meta-n", estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.", ...extra,
});
const archivo = (historial: DirectivaCapa[], activa: number | null = 2): ArchivoDirectivas =>
  ({ v: 1, capa: "juicio", activa, historial });
class AlmacenMemoria {
  private readonly datos = new Map<string, string>();
  getItem(clave: string): string | null { return this.datos.get(clave) ?? null; }
  setItem(clave: string, valor: string): void { this.datos.set(clave, valor); }
}

describe("almacén de directivas de las capas (Meta^n)", () => {
  let eventos: string[];
  beforeEach(() => {
    eventos = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: new AlmacenMemoria(),
        dispatchEvent: (evento: Event) => { eventos.push(evento.type); return true; },
      },
    });
  });

  it("declara la clave y el evento del contrato", () => {
    expect(CLAVE_DIRECTIVAS).toBe("starseed.capas.directivas.v1");
    expect(EVENTO_DIRECTIVAS).toBe("starseed:capas-directivas");
  });
  describe("normalizarRegistroDirectivas", () => {
    it("sanea capas y directivas: lo ilegible se descarta, nunca explota", () => {
      const registro = normalizarRegistroDirectivas({
        juicio: archivo([directiva()]),
        rota: { v: 9, activa: 3, historial: [] },
        conBasura: { v: 1, capa: "palabra", activa: null, historial: [{ no: "soy una directiva" }, directiva({ version: 1, estado: "anterior" })] },
      });
      expect(Object.keys(registro)).toEqual(["juicio", "conBasura"]);
      expect(registro.conBasura.historial.map((d) => d.version)).toEqual([1]);
      expect(normalizarRegistroDirectivas("no soy registro")).toEqual({});
    });
  });
  describe("ganaGuardado", () => {
    it("sin archivo previo, gana; con el mismo historial y la misma activa, no", () => {
      expect(ganaGuardado(undefined, archivo([directiva()]))).toBe(true);
      expect(ganaGuardado(archivo([directiva()]), archivo([directiva()]))).toBe(false);
    });
    it("gana si la activa que llega es más nueva (o la actual no tiene ninguna)", () => {
      expect(ganaGuardado(archivo([directiva()]), archivo([directiva({ version: 3 })], 3))).toBe(true);
      expect(ganaGuardado(archivo([directiva()], null), archivo([directiva()], 2))).toBe(true);
    });
    it("NO gana si la activa que llega es más vieja y el historial no cambió", () => {
      const v1 = directiva({ version: 1, estado: "anterior" });
      expect(ganaGuardado(archivo([v1, directiva()]), archivo([v1], 1))).toBe(false);
    });
    it("gana si cambió el historial (retirada, vuelta atrás o directiva distinta)", () => {
      const conRetirada = archivo([directiva({ estado: "retirada", motivo: "vuelta a la anterior" }), directiva({ version: 3, estado: "anterior" })], 3);
      expect(ganaGuardado(archivo([directiva()]), conRetirada)).toBe(true);
      expect(ganaGuardado(archivo([directiva()]), archivo([directiva({ texto: "Pauta distinta." })]))).toBe(true);
    });
    it("NO gana un archivo viejo: su historial es un subconjunto atrasado del actual", () => {
      const viejo = archivo([directiva({ version: 2, estado: "anterior" })], 2);
      expect(ganaGuardado(archivo([directiva({ version: 3 })], 3), viejo)).toBe(false);
    });
  });
  describe("activaDeRegistro / directivaActiva", () => {
    it("devuelve la directiva activa según versión y estado", () => {
      expect(activaDeRegistro({ juicio: archivo([directiva()]) }, "juicio")).toMatchObject({ version: 2 });
      expect(activaDeRegistro({ juicio: archivo([directiva({ estado: "retirada" })]) }, "juicio")).toBeUndefined();
      expect(activaDeRegistro({ juicio: archivo([directiva()], null) }, "juicio")).toBeUndefined();
      expect(activaDeRegistro({}, "juicio")).toBeUndefined();
    });
    it("directivaActiva lee el registro guardado en localStorage", () => {
      window.localStorage.setItem(CLAVE_DIRECTIVAS, JSON.stringify({ juicio: archivo([directiva()]) }));
      expect(directivaActiva("juicio")?.version).toBe(2);
      expect(directivaActiva("palabra")).toBeUndefined();
    });
  });
  describe("leerDirectivas / guardarDirectivas", () => {
    it("lee defensivo: JSON roto o vacío → registro vacío, sin lanzar", () => {
      expect(leerDirectivas()).toEqual({});
      window.localStorage.setItem(CLAVE_DIRECTIVAS, "{no soy json");
      expect(leerDirectivas()).toEqual({});
      expect(eventos).toEqual([]);
    });
    it("guarda la primera vez y emite el evento", () => {
      expect(guardarDirectivas("juicio", archivo([directiva()]))).toBe(true);
      expect(leerDirectivas().juicio?.activa).toBe(2);
      expect(eventos).toEqual([EVENTO_DIRECTIVAS]);
    });
    it("NO guarda si el archivo que llega no gana la posición del actual", () => {
      guardarDirectivas("juicio", archivo([directiva({ version: 3 })], 3));
      eventos = [];
      expect(guardarDirectivas("juicio", archivo([directiva({ version: 2, estado: "anterior" })], 2))).toBe(false);
      expect(leerDirectivas().juicio?.activa).toBe(3);
      expect(eventos).toEqual([]);
    });
    it("guarda si la activa es más nueva o cambió el historial (vuelta atrás)", () => {
      guardarDirectivas("juicio", archivo([directiva({ version: 1, estado: "anterior" }), directiva()]));
      eventos = [];
      expect(guardarDirectivas("juicio", archivo([directiva({ version: 3 })], 3))).toBe(true);
      expect(leerDirectivas().juicio?.activa).toBe(3);
      const vuelta = archivo([directiva(), directiva({ version: 3, estado: "retirada", motivo: "vuelta a la anterior" })], 2);
      expect(guardarDirectivas("juicio", vuelta)).toBe(true);
      expect(leerDirectivas().juicio?.activa).toBe(2);
    });
    it("descarta un archivo ilegible sin escribir", () => {
      expect(guardarDirectivas("juicio", { no: "soy archivo" } as unknown as ArchivoDirectivas)).toBe(false);
      expect(eventos).toEqual([]);
    });
  });
});
