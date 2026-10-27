// Pruebas de los filtros puros del pilar «Procesos activos» (CB1013N, §7).
// Solo funciones puras: entrada → salida, sin red ni disco.

import { describe, expect, it } from "vitest";
import { ETIQUETA_ESTADO, escritorioYVentana, tiposVisibles } from "../procesos-filtros";
import type { TipoProceso } from "../procesos";

describe("tiposVisibles", () => {
  it("lista vacía → todos los tipos del sistema, en orden", () => {
    const todos = tiposVisibles([]);
    expect(Object.keys(ETIQUETA_ESTADO)).toHaveLength(4);
    expect(todos).toEqual(["genesis", "poligenesis", "sueno", "imaginacion", "descarga", "instalacion", "actualizacion", "app-fondo", "servicio"] as TipoProceso[]);
  });

  it("elegidos válidos se conservan aunque llegen revueltos, en orden del sistema", () => {
    const r = tiposVisibles(["sueno" as TipoProceso, "genesis" as TipoProceso]);
    expect(r).toEqual(["genesis", "sueno"] as TipoProceso[]);
  });

  it("valores que no son del sistema se descartan", () => {
    const r = tiposVisibles(["genesis", "nada-de-esto" as TipoProceso, 123 as unknown as TipoProceso]);
    expect(r).toEqual(["genesis"] as TipoProceso[]);
  });

  it("devuelve vacío si después de descartar no queda nada válido", () => {
    expect(tiposVisibles(["banana" as TipoProceso])).toEqual([]);
  });
});

describe("escritorioYVentana", () => {
  it("convierte un id de ventana del snapshot en escritorio y ventana", () => {
    expect(escritorioYVentana("ventana:escritorio-2:abc-123")).toEqual({ escritorio: "escritorio-2", ventana: "abc-123" });
  });

  it("tolera escritorios con dos puntos en su identificador", () => {
    expect(escritorioYVentana("ventana:esc:1:9")).toEqual({ escritorio: "esc:1", ventana: "9" });
  });

  it("devuelve null para ids que no son de ventana", () => {
    expect(escritorioYVentana("agente:12")).toBeNull();
    expect(escritorioYVentana("ventana:")).toBeNull();
    expect(escritorioYVentana("ventana:solo-uno")).toBeNull();
    expect(escritorioYVentana("")).toBeNull();
  });
});

describe("ETIQUETA_ESTADO", () => {
  it("traduce los cuatro estados en palabras", () => {
    expect(ETIQUETA_ESTADO["en-marcha"]).toBe("en marcha");
    expect(ETIQUETA_ESTADO.esperando).toBe("esperando");
    expect(ETIQUETA_ESTADO.pausado).toBe("pausado");
    expect(ETIQUETA_ESTADO.fallando).toBe("fallando");
  });
});
