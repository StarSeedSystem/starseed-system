import { beforeEach, describe, expect, it } from "vitest";
import {
  DIRECCIONES_KEY, DIRECTIVAS_EVENT, directivaActiva, guardarDirectivas, leerDirectivas,
  type ArchivoDirectivas,
} from "../directivas-almacen";
import type { DirectivaCapa } from "../directivas";

const crearDirectiva = (extra: Partial<DirectivaCapa> = {}): DirectivaCapa => ({
  capa: "juicio", version: 2, sha256: "a".repeat(64),
  acierto: 0.6, base: 0.5, n: 80, fecha: "2026-10-27",
  origen: "meta-n", estado: "activa",
  texto: "Resume el objetivo en una frase antes de responder.",
  ...extra,
});

const crearArchivo = (historial: DirectivaCapa[], activa: number | null): ArchivoDirectivas => ({
  v: 1, capa: "juicio", activa, historial,
});

class AlmacenMemoria {
  private readonly datos = new Map<string, string>();
  getItem(clave: string): string | null { return this.datos.get(clave) ?? null; }
  setItem(clave: string, valor: string): void { this.datos.set(clave, valor); }
  removeItem(clave: string): void { this.datos.delete(clave); }
}

describe("directivas-almacen", () => {
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

  it("declara la clave y el evento", () => {
    expect(DIRECCIONES_KEY).toBe("starseed.capas.directivas.v1");
    expect(DIRECTIVAS_EVENT).toBe("starseed:capas-directivas");
  });

  describe("leerDirectivas", () => {
    it("devuelve null si no hay datos", () => {
      expect(leerDirectivas("juicio")).toBeNull();
    });

    it("devuelve la directiva de la capa solicitada", () => {
      const archivo = crearArchivo([crearDirectiva()], 2);
      const raw = JSON.stringify({ juicio: archivo });
      (window.localStorage as AlmacenMemoria).setItem(DIRECCIONES_KEY, raw);
      
      const resultado = leerDirectivas("juicio");
      expect(resultado).toEqual(archivo);
    });

    it("devuelve null si la capa no existe", () => {
      const raw = JSON.stringify({ juicio: crearArchivo([crearDirectiva()], 2) });
      (window.localStorage as AlmacenMemoria).setItem(DIRECCIONES_KEY, raw);
      
      expect(leerDirectivas("otra-capa")).toBeNull();
    });

    it("devuelve null con JSON roto", () => {
      (window.localStorage as AlmacenMemoria).setItem(DIRECCIONES_KEY, "{no soy json");
      expect(leerDirectivas("juicio")).toBeNull();
    });

    it("devuelve null sin window (SSR)", () => {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: undefined,
      });
      expect(leerDirectivas("juicio")).toBeNull();
    });
  });

  describe("guardarDirectivas", () => {
    it("guarda una directiva nueva y dispara evento", async () => {
      const archivo = crearArchivo([crearDirectiva()], 2);
      
      const guardado = await guardarDirectivas("juicio", archivo);
      expect(guardado).toBe(true);
      expect(eventos).toEqual([DIRECTIVAS_EVENT]);

      const leido = leerDirectivas("juicio");
      expect(leido).toEqual(archivo);
    });

    it("no guarda si no hay cambios", async () => {
      const archivo = crearArchivo([crearDirectiva()], 2);
      const raw = JSON.stringify({ juicio: archivo });
      (window.localStorage as AlmacenMemoria).setItem(DIRECCIONES_KEY, raw);
      
      // Guardar el mismo archivo
      const guardado = await guardarDirectivas("juicio", archivo);
      expect(guardado).toBe(false);
      expect(eventos.length).toBe(0); // No se dispara evento
    });

    it("actualiza si la versión activa cambia", async () => {
      const archivo1 = crearArchivo([crearDirectiva()], 2);
      await guardarDirectivas("juicio", archivo1);

      const archivo2 = crearArchivo([crearDirectiva()], 3);
      const guardado = await guardarDirectivas("juicio", archivo2);
      expect(guardado).toBe(true);
      expect(eventos.length).toBe(1);

      const leido = leerDirectivas("juicio");
      expect(leido?.activa).toBe(3);
    });

    it("actualiza si el historial cambia", async () => {
      const directiva1 = crearDirectiva({ version: 1, texto: "Pauta 1" });
      const directiva2 = crearDirectiva({ version: 2, texto: "Pauta 2" });
      
      const archivo1 = crearArchivo([directiva1], 1);
      await guardarDirectivas("juicio", archivo1);

      const archivo2 = crearArchivo([directiva1, directiva2], 2);
      const guardado = await guardarDirectivas("juicio", archivo2);
      expect(guardado).toBe(true);

      const leido = leerDirectivas("juicio");
      expect(leido?.historial.length).toBe(2);
    });

    it("guarda múltiples capas", async () => {
      const archivoJuicio = crearArchivo([crearDirectiva()], 2);
      const archivoCreacion = crearArchivo([crearDirectiva({ texto: "Genera ideas" })], 1);

      await guardarDirectivas("juicio", archivoJuicio);
      await guardarDirectivas("creacion", archivoCreacion);

      const juicio = leerDirectivas("juicio");
      const creacion = leerDirectivas("creacion");
      
      expect(juicio?.activa).toBe(2);
      expect(creacion?.activa).toBe(1);
    });

    it("devuelve false sin window (SSR)", async () => {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: undefined,
      });
      expect(await guardarDirectivas("juicio", crearArchivo([crearDirectiva()], 2))).toBe(false);
    });

    it("devuelve false con error en localStorage", async () => {
      const archivo = crearArchivo([crearDirectiva()], 2);
      const setItem = (window.localStorage as any).setItem;
      (window.localStorage as any).setItem = () => { throw new Error("Quota exceeded"); };
      
      expect(await guardarDirectivas("juicio", archivo)).toBe(false);
      (window.localStorage as any).setItem = setItem;
    });
  });

  describe("directivaActiva", () => {
    it("devuelve la directiva activa de la capa", () => {
      const directiva2 = crearDirectiva({ version: 2, texto: "Resume el objetivo" });
      const archivo = crearArchivo([directiva2], 2);
      
      const raw = JSON.stringify({ juicio: archivo });
      (window.localStorage as AlmacenMemoria).setItem(DIRECCIONES_KEY, raw);

      const resultado = directivaActiva("juicio");
      expect(resultado).toEqual(directiva2);
    });

    it("devuelve undefined si no hay directiva activa", () => {
      const archivo = crearArchivo([crearDirectiva()], null);
      const raw = JSON.stringify({ juicio: archivo });
      (window.localStorage as AlmacenMemoria).setItem(DIRECCIONES_KEY, raw);

      expect(directivaActiva("juicio")).toBeUndefined();
    });

    it("devuelve undefined si la versión activa no está en el historial", () => {
      const archivo = crearArchivo([crearDirectiva()], 99);
      const raw = JSON.stringify({ juicio: archivo });
      (window.localStorage as AlmacenMemoria).setItem(DIRECCIONES_KEY, raw);

      expect(directivaActiva("juicio")).toBeUndefined();
    });

    it("devuelve undefined si no hay datos", () => {
      expect(directivaActiva("juicio")).toBeUndefined();
    });

    it("devuelve undefined sin window", () => {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: undefined,
      });
      expect(directivaActiva("juicio")).toBeUndefined();
    });
  });
});