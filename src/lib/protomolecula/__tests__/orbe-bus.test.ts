import { describe, it, expect } from "vitest";
import {
  TAMANO_ORBE,
  PROTO_ORB_POS_KEY,
  PROTO_ORB_FAB_KEY,
  PROTO_ORB_FAB_EVENT,
  PROTO_ORB_ABRIR_EVENT,
  limitarPosicion,
  posicionPorDefecto,
  leerPosAurora,
  leerPosicion,
  guardarPosicion,
  leerActivada,
  guardarActivada,
  type AlmacenLocal,
} from "../orbe-bus";

function almacenFalso(inicial: Record<string, string> = {}, falla = false): AlmacenLocal {
  return {
    getItem: (k) => {
      if (falla) throw new Error("denegado");
      return inicial[k] ?? null;
    },
    setItem: (k, v) => {
      if (falla) throw new Error("denegado");
      inicial[k] = v;
    },
  };
}

const VIEW = { ancho: 1280, alto: 800 };

describe("constantes del bus", () => {
  it("exporta claves, eventos y tamaño", () => {
    expect(PROTO_ORB_POS_KEY).toBe("starseed.protomolecula.orbe.pos.v1");
    expect(PROTO_ORB_FAB_KEY).toBe("starseed.protomolecula.orbe.enabled.v1");
    expect(PROTO_ORB_FAB_EVENT).toBe("starseed:protomolecula-orb-fab");
    expect(PROTO_ORB_ABRIR_EVENT).toBe("starseed:protomolecula-abrir");
    expect(TAMANO_ORBE).toBe(56);
  });
});

describe("limitarPosicion", () => {
  it("recorta al borde inferior-derecho", () => {
    expect(limitarPosicion({ x: 5000, y: 4000 }, VIEW)).toEqual({ x: 1224, y: 744 });
  });
  it("recorta valores negativos", () => {
    expect(limitarPosicion({ x: -10, y: -5 }, VIEW)).toEqual({ x: 0, y: 0 });
  });
  it("no explota con un viewport más pequeño que la orbe", () => {
    expect(limitarPosicion({ x: 10, y: 10 }, { ancho: 30, alto: 20 })).toEqual({ x: 0, y: 0 });
  });
});

describe("posicionPorDefecto", () => {
  it("se pone 64 px a la izquierda de Aurora", () => {
    const pos = posicionPorDefecto({ x: 1200, y: 700 }, VIEW);
    expect(pos).toEqual({ x: 1200 - TAMANO_ORBE - 64, y: 700 });
  });
  it("se queda dentro si Aurora está pegada al borde izquierdo", () => {
    const pos = posicionPorDefecto({ x: 0, y: 100 }, VIEW);
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBe(100);
  });
  it("sin Aurora cae abajo a la derecha", () => {
    const pos = posicionPorDefecto(null, VIEW);
    expect(pos).toEqual({ x: 1280 - TAMANO_ORBE - 16, y: 800 - TAMANO_ORBE - 16 });
  });
});

describe("leerPosicion / guardarPosicion", () => {
  it("lee una posición válida guardada y la limita al viewport", () => {
    const almacen = almacenFalso({ [PROTO_ORB_POS_KEY]: JSON.stringify({ x: 200, y: 300 }) });
    expect(leerPosicion(almacen, VIEW)).toEqual({ x: 200, y: 300 });
  });
  it("guarda y recupera la posición", () => {
    const datos: Record<string, string> = {};
    const almacen = almacenFalso(datos);
    guardarPosicion(almacen, { x: 50, y: 60 });
    expect(leerPosicion(almacen, VIEW)).toEqual({ x: 50, y: 60 });
  });
  it("con JSON corrupto usa el default y no lanza", () => {
    const almacen = almacenFalso({ [PROTO_ORB_POS_KEY]: "{roto" });
    expect(leerPosicion(almacen, VIEW)).toEqual(posicionPorDefecto(null, VIEW));
  });
  it("con campos no numéricos usa el default", () => {
    const almacen = almacenFalso({ [PROTO_ORB_POS_KEY]: JSON.stringify({ x: "a" }) });
    expect(leerPosicion(almacen, VIEW)).toEqual(posicionPorDefecto(null, VIEW));
  });
  it("un almacén que lanza devuelve el default sin romperse", () => {
    const roto = almacenFalso({}, true);
    expect(leerPosicion(roto, VIEW)).toEqual(posicionPorDefecto(null, VIEW));
    expect(() => guardarPosicion(roto, { x: 1, y: 1 })).not.toThrow();
  });
  it("usa la posición de Aurora (ratios) cuando no hay guardada", () => {
    const almacen = almacenFalso({ "starseed.aurora.orb.pos.v1": JSON.stringify({ xRatio: 0.5, yRatio: 0.5 }) });
    const esperada = posicionPorDefecto({ x: 640, y: 400 }, VIEW);
    expect(leerPosicion(almacen, VIEW)).toEqual(esperada);
  });
  it("si la clave de Aurora está corrupta cae al default sin Aurora", () => {
    const almacen = almacenFalso({ "starseed.aurora.orb.pos.v1": "[1," });
    expect(leerPosAurora(almacen, VIEW)).toBeNull();
    expect(leerPosicion(almacen, VIEW)).toEqual(posicionPorDefecto(null, VIEW));
  });
});

describe("leerActivada / guardarActivada", () => {
  it("por defecto está ACTIVADA (true)", () => {
    expect(leerActivada(almacenFalso())).toBe(true);
  });
  it('solo "false" la apaga', () => {
    expect(leerActivada(almacenFalso({ [PROTO_ORB_FAB_KEY]: "false" }))).toBe(false);
    expect(leerActivada(almacenFalso({ [PROTO_ORB_FAB_KEY]: "true" }))).toBe(true);
    expect(leerActivada(almacenFalso({ [PROTO_ORB_FAB_KEY]: "basura" }))).toBe(true);
  });
  it("guarda y lee la preferencia", () => {
    const datos: Record<string, string> = {};
    const almacen = almacenFalso(datos);
    guardarActivada(almacen, false);
    expect(leerActivada(almacen)).toBe(false);
    guardarActivada(almacen, true);
    expect(leerActivada(almacen)).toBe(true);
  });
  it("un almacén que lanza devuelve true y no rompe al guardar", () => {
    const roto = almacenFalso({}, true);
    expect(leerActivada(roto)).toBe(true);
    expect(() => guardarActivada(roto, false)).not.toThrow();
  });
});
