import { describe, it, expect } from "vitest";
import {
  TAMANO_ORBE,
  DIANA_MINIMA,
  factorTamanoOrbe,
  medidasOrbe,
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

describe("tamaño de la orbe según el ancho de la pantalla (PRO1025M)", () => {
  it("< 400 px → 0,7× · < 640 px → 0,8× · el resto 1×, con los bordes exactos", () => {
    expect(factorTamanoOrbe(320)).toBe(0.7);
    expect(factorTamanoOrbe(360)).toBe(0.7);
    expect(factorTamanoOrbe(399)).toBe(0.7);
    expect(factorTamanoOrbe(400)).toBe(0.8);
    expect(factorTamanoOrbe(414)).toBe(0.8);
    expect(factorTamanoOrbe(639)).toBe(0.8);
    expect(factorTamanoOrbe(640)).toBe(1);
    expect(factorTamanoOrbe(1280)).toBe(1);
  });
  it("un ancho que no es un número (SSR, medida rota) cuenta como pantalla ancha", () => {
    expect(factorTamanoOrbe(Number.NaN)).toBe(1);
    expect(factorTamanoOrbe(0)).toBe(1);
    expect(factorTamanoOrbe(-5)).toBe(1);
    expect(factorTamanoOrbe(Number.POSITIVE_INFINITY)).toBe(1);
  });
  it("medidas: el dibujo se encoge, la diana táctil NUNCA baja de 44 px y el lienzo es el doble del dibujo", () => {
    expect(medidasOrbe(1280)).toEqual({ factor: 1, dibujo: 56, diana: 56, lienzo: 112 });
    expect(medidasOrbe(500)).toEqual({ factor: 0.8, dibujo: 45, diana: 45, lienzo: 90 });
    expect(medidasOrbe(360)).toEqual({ factor: 0.7, dibujo: 39, diana: 44, lienzo: 78 });
    for (const ancho of [280, 320, 360, 390, 399, 400, 480, 639, 640, 768, 1024, 1920]) {
      const m = medidasOrbe(ancho);
      expect(m.diana).toBeGreaterThanOrEqual(DIANA_MINIMA);
      expect(m.diana).toBeGreaterThanOrEqual(m.dibujo);
      expect(m.lienzo).toBe(m.dibujo * 2);
      expect(m.dibujo).toBeLessThanOrEqual(TAMANO_ORBE);
    }
  });
  it("cada tramo es más grande que el anterior: crecer la pantalla nunca encoge la orbe", () => {
    let previo = 0;
    for (let ancho = 280; ancho <= 1400; ancho += 10) {
      const { dibujo } = medidasOrbe(ancho);
      expect(dibujo).toBeGreaterThanOrEqual(previo);
      previo = dibujo;
    }
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
  it("con la diana de un móvil (44 px) llega 12 px más lejos que con la de escritorio", () => {
    const movil = { ancho: 360, alto: 740 };
    const { diana } = medidasOrbe(movil.ancho);
    expect(limitarPosicion({ x: 9999, y: 9999 }, movil, diana)).toEqual({ x: 360 - 44, y: 740 - 44 });
    expect(limitarPosicion({ x: 9999, y: 9999 }, movil)).toEqual({ x: 360 - TAMANO_ORBE, y: 740 - TAMANO_ORBE });
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
  it("con una diana más pequeña la separación con Aurora se conserva (el borde derecho queda a 64 px de su centro)", () => {
    const pos = posicionPorDefecto({ x: 1200, y: 700 }, VIEW, 44);
    expect(pos).toEqual({ x: 1200 - 44 - 64, y: 700 });
    expect(pos.x + 44).toBe(1200 - 64);
  });
  it("si a su izquierda no cabe, se pone a su derecha en lugar de taparla", () => {
    const pos = posicionPorDefecto({ x: 20, y: 300 }, VIEW, 56);
    expect(pos).toEqual({ x: 20 + 64, y: 300 });
  });
  it("en pantallas < 640 px cuenta donde Aurora SE VE (pegada al borde más cercano), no lo guardado", () => {
    const movil = { ancho: 390, alto: 844 };
    const { diana } = medidasOrbe(movil.ancho);
    // Guardada cerca del centro (0,3), Aurora se pinta pegada al borde IZQUIERDO: la Protomolécula va a su derecha.
    const izq = posicionPorDefecto({ x: 0.3 * 390, y: 700 }, movil, diana);
    expect(izq.x).toBeGreaterThanOrEqual(0.04 * 390 + 24 + 8);
    // Guardada a la derecha (0,9), Aurora se pinta en el borde DERECHO: la Protomolécula queda a su izquierda.
    const der = posicionPorDefecto({ x: 0.9 * 390, y: 700 }, movil, diana);
    expect(der.x + diana).toBeLessThanOrEqual(0.96 * 390 - 24 - 8);
  });
  it("jamás se solapan en horizontal: ni en móvil estrecho, ni en móvil ancho, ni en escritorio", () => {
    const aurora = (ancho: number) => (ancho < 640 ? 48 : 60);
    for (const ancho of [320, 360, 390, 414, 500, 639, 640, 1024, 1920]) {
      const v = { ancho, alto: 800 };
      const { diana } = medidasOrbe(ancho);
      for (const ratio of [0.04, 0.2, 0.45, 0.5, 0.7, 0.9, 0.96]) {
        const pos = posicionPorDefecto({ x: ratio * ancho, y: 600 }, v, diana);
        const centro = ancho < 640 ? (ratio < 0.5 ? 0.04 : 0.96) * ancho : Math.min(ratio * ancho, ancho - diana);
        const cajaAurora = { desde: centro - aurora(ancho) / 2, hasta: centro + aurora(ancho) / 2 };
        const sePisan = pos.x < cajaAurora.hasta && pos.x + diana > cajaAurora.desde;
        expect(sePisan, `ancho ${ancho}, Aurora en ${ratio}`).toBe(false);
      }
    }
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
