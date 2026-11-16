import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  crearAlmacenPaquetes,
  CLAVE_ALMACEN,
  EVENTO_CAMBIO,
  MAX_PAQUETES,
  MAX_BYTES_TOTAL,
  type AlmacenPaquetes,
  type AlmacenInterno,
} from "../almacen";
import type { PaqueteIdioma } from "../formato";

const windowMock = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
};

function crearAlmacenFalso(): AlmacenInterno {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => { datos.set(clave, valor); },
    removeItem: (clave: string) => { datos.delete(clave); },
  };
}

beforeEach(() => {
  vi.stubGlobal("window", windowMock);
  vi.clearAllMocks();
});

function paqueteValido(codigo: string, entradas: Record<string, string> = { hola: "hola" }): PaqueteIdioma {
  return {
    formato: "starseed-idioma",
    version: 1,
    codigo,
    nombre: codigo.toUpperCase(),
    dir: "ltr",
    autor: { nombre: "Test" },
    creado: "2026-01-01T00:00:00.000Z",
    revisado: { estado: "automatico" },
    licencia: "MIT",
    base: "es",
    entradas,
    hash: "abc123",
  };
}

describe("almacen de paquetes de idioma", () => {
  let almacen: AlmacenPaquetes;
  let almacenFalso: AlmacenInterno;

  beforeEach(() => {
    almacenFalso = crearAlmacenFalso();
    almacen = crearAlmacenPaquetes(almacenFalso);
  });

  describe("listarPaquetes", () => {
    it("devuelve array vacio al inicio", () => {
      expect(almacen.listarPaquetes()).toEqual([]);
    });

    it("devuelve paquetes guardados", () => {
      const p = paqueteValido("es-ES");
      almacen.guardarPaquete(p);
      expect(almacen.listarPaquetes()).toHaveLength(1);
    });
  });

  describe("guardarPaquete", () => {
    it("guarda un paquete nuevo", () => {
      const p = paqueteValido("es-ES");
      const resultado = almacen.guardarPaquete(p);
      expect(resultado.ok).toBe(true);
      expect(almacen.leerPaquete("es-ES")).toEqual(p);
    });

    it("reemplaza paquete existente por mismo codigo", () => {
      const p1 = paqueteValido("es-ES", { hola: "hola" });
      const p2 = paqueteValido("es-ES", { hola: "HOLA", adios: "adiós" });
      almacen.guardarPaquete(p1);
      almacen.guardarPaquete(p2);
      const leido = almacen.leerPaquete("es-ES");
      expect(leido?.entradas.hola).toBe("HOLA");
      expect(leido?.entradas.adios).toBe("adiós");
    });

    it("respeta limite de 12 paquetes", () => {
      for (let i = 0; i < MAX_PAQUETES; i++) {
        const r = almacen.guardarPaquete(paqueteValido(`lang-${i}`));
        expect(r.ok).toBe(true);
      }
      const r = almacen.guardarPaquete(paqueteValido("extra"));
      expect(r.ok).toBe(false);
      expect(r.motivo).toContain("12");
    });

    it("respeta limite de 6 MB totales", () => {
      const grande = paqueteValido("grande", { clave: "x".repeat(7 * 1024 * 1024) });
      const r = almacen.guardarPaquete(grande);
      expect(r.ok).toBe(false);
      expect(r.motivo).toContain("6 MB");
    });
  });

  describe("quitarPaquete", () => {
    it("elimina paquete existente", () => {
      const p = paqueteValido("es-ES");
      almacen.guardarPaquete(p);
      almacen.quitarPaquete("es-ES");
      expect(almacen.leerPaquete("es-ES")).toBeNull();
      expect(almacen.listarPaquetes()).toHaveLength(0);
    });

    it("no falla al eliminar inexistente", () => {
      expect(() => almacen.quitarPaquete("no-existe")).not.toThrow();
    });
  });

  describe("leerPaquete", () => {
    it("devuelve paquete por codigo", () => {
      const p = paqueteValido("fr-FR");
      almacen.guardarPaquete(p);
      expect(almacen.leerPaquete("fr-FR")).toEqual(p);
    });

    it("devuelve null si no existe", () => {
      expect(almacen.leerPaquete("no-existe")).toBeNull();
    });
  });

  describe("evento de cambio", () => {
    it("dispara evento al guardar", () => {
      almacen.guardarPaquete(paqueteValido("es-ES"));
      expect(windowMock.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(windowMock.dispatchEvent.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
      expect((windowMock.dispatchEvent.mock.calls[0][0] as CustomEvent).type).toBe(EVENTO_CAMBIO);
    });

    it("dispara evento al quitar", () => {
      const p = paqueteValido("es-ES");
      almacen.guardarPaquete(p);
      vi.clearAllMocks();
      almacen.quitarPaquete("es-ES");
      expect(windowMock.dispatchEvent).toHaveBeenCalledTimes(1);
      expect((windowMock.dispatchEvent.mock.calls[0][0] as CustomEvent).type).toBe(EVENTO_CAMBIO);
    });

    it("no dispara evento si quitar no cambia nada", () => {
      almacen.quitarPaquete("no-existe");
      expect(windowMock.dispatchEvent).not.toHaveBeenCalled();
    });
  });

  describe("valores corruptos y errores de almacen", () => {
    it("ignora JSON invalido en localStorage", () => {
      const almacenConError = crearAlmacenFalso();
      almacenConError.setItem(CLAVE_ALMACEN, "no-es-json");
      const a = crearAlmacenPaquetes(almacenConError);
      expect(a.listarPaquetes()).toEqual([]);
    });

    it("ignora valor que no es array", () => {
      const almacenConError = crearAlmacenFalso();
      almacenConError.setItem(CLAVE_ALMACEN, '{"codigo": "es"}');
      const a = crearAlmacenPaquetes(almacenConError);
      expect(a.listarPaquetes()).toEqual([]);
    });

    it("ignora elementos invalidos dentro del array", () => {
      const almacenConError = crearAlmacenFalso();
      almacenConError.setItem(CLAVE_ALMACEN, '[{"codigo": "es"}, null, "texto", 123]');
      const a = crearAlmacenPaquetes(almacenConError);
      expect(a.listarPaquetes()).toHaveLength(1);
    });

    it("no rompe si almacen lanza al leer", () => {
      const almacenQueFalla: AlmacenInterno = {
        getItem: () => { throw new Error("Fallo lectura"); },
        setItem: () => {},
        removeItem: () => {},
      };
      const a = crearAlmacenPaquetes(almacenQueFalla);
      expect(a.listarPaquetes()).toEqual([]);
      expect(a.leerPaquete("es")).toBeNull();
    });

    it("no rompe si almacen lanza al escribir", () => {
      const almacenQueFalla: AlmacenInterno = {
        getItem: () => "[]",
        setItem: () => { throw new Error("Fallo escritura"); },
        removeItem: () => {},
      };
      const a = crearAlmacenPaquetes(almacenQueFalla);
      expect(a.guardarPaquete(paqueteValido("es"))).toEqual({ ok: true });
    });
  });

  describe("constantes exportadas", () => {
    it("CLAVE_ALMACEN es correcta", () => {
      expect(CLAVE_ALMACEN).toBe("starseed.idiomas.paquetes.v1");
    });

    it("EVENTO_CAMBIO es correcto", () => {
      expect(EVENTO_CAMBIO).toBe("starseed:idiomas-paquetes");
    });

    it("MAX_PAQUETES es 12", () => {
      expect(MAX_PAQUETES).toBe(12);
    });

    it("MAX_BYTES_TOTAL es 6 MB", () => {
      expect(MAX_BYTES_TOTAL).toBe(6 * 1024 * 1024);
    });
  });
});