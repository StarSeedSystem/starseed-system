import { describe, it, expect } from "vitest";
import {
  CURVAS,
  DURACION_ESCENA,
  DURACION_UI,
  PROPIEDADES_PERMITIDAS,
  alquimia,
  barridoHorizonte,
  cristalizacion,
  elementoCompartido,
  entradaCardinal,
  fundidoDesenfoque,
  opcionesReducidas,
  propiedadesDe,
  respiracion,
  siembra,
  type MovimientoStarseed,
} from "../movimiento-starseed";

const movimientos = (): MovimientoStarseed[] => [
  siembra(),
  ...(["zenith", "horizon", "logic", "anchor"] as const).map((punto) => entradaCardinal(punto)),
  fundidoDesenfoque(),
  elementoCompartido(),
  ...barridoHorizonte(),
  respiracion(),
  cristalizacion(),
  alquimia(),
];

describe("propiedades animadas", () => {
  it("solo usa transform, opacity, filter y clipPath", () => {
    for (const movimiento of movimientos()) {
      for (const propiedad of movimiento.propiedades) {
        expect(PROPIEDADES_PERMITIDAS).toContain(propiedad);
      }
    }
  });

  it("anota exactamente las propiedades de sus keyframes", () => {
    for (const movimiento of movimientos()) {
      expect([...movimiento.propiedades].sort()).toEqual([...propiedadesDe(movimiento.keyframes)].sort());
    }
  });

  it("no anima dimensiones, márgenes ni posiciones", () => {
    const prohibidas = ["width", "height", "margin", "padding", "top", "left"];
    for (const movimiento of movimientos()) {
      for (const propiedad of movimiento.propiedades) {
        expect(prohibidas).not.toContain(propiedad);
      }
    }
  });
});

describe("curvas y duraciones", () => {
  it("usa las tres curvas reales del OS", () => {
    expect(CURVAS.organica).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(CURVAS.desliz).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(CURVAS.genesis).toBe("cubic-bezier(0.22, 0.9, 0.3, 1)");
  });

  it("declara las duraciones de interfaz 140, 220 y 240 ms", () => {
    expect(Object.values(DURACION_UI)).toEqual([140, 220, 240]);
  });

  it("mantiene las escenas entre 600 y 900 ms, salvo la respiración", () => {
    for (const movimiento of movimientos()) {
      if (movimiento.nombre === "respiracion") continue;
      expect(Number(movimiento.opciones.duration)).toBeGreaterThanOrEqual(600);
      expect(Number(movimiento.opciones.duration)).toBeLessThanOrEqual(900);
    }
    expect(respiracion().opciones.duration).toBe(DURACION_ESCENA.respiracion);
  });
});

describe("entrada cardinal", () => {
  it("cada punto de la Trinity entra desde un borde distinto", () => {
    const desde = [
      entradaCardinal("zenith").keyframes[0].transform,
      entradaCardinal("horizon").keyframes[0].transform,
      entradaCardinal("logic").keyframes[0].transform,
      entradaCardinal("anchor").keyframes[0].transform,
    ];
    expect(new Set(desde).size).toBe(4);
    expect(entradaCardinal("logic").nombre).toBe("entrada-cardinal:logic");
  });
});

describe("opcionesReducidas", () => {
  it("deja 1 ms, sin retardo, sin repeticiones y sin curva", () => {
    const reducidas = opcionesReducidas({
      duration: 900,
      delay: 300,
      iterations: Infinity,
      easing: CURVAS.genesis,
      fill: "both",
    });
    expect(reducidas.duration).toBe(1);
    expect(reducidas.delay).toBe(0);
    expect(reducidas.iterations).toBe(1);
    expect(reducidas.easing).toBe("linear");
    expect(reducidas.fill).toBe("both");
  });

  it("no muta las opciones originales", () => {
    const original: KeyframeAnimationOptions = { duration: 700, delay: 200 };
    opcionesReducidas(original);
    expect(original.duration).toBe(700);
    expect(original.delay).toBe(200);
  });
});

describe("movimientos con nombre propio", () => {
  it("la siembra pasa de escala 0 a 1 por el brote 1.4", () => {
    expect(siembra().keyframes.map((fotograma) => fotograma.transform)).toEqual([
      "scale(0)",
      "scale(1.4)",
      "scale(1)",
    ]);
  });

  it("la respiración alterna sin fin", () => {
    const movimiento = respiracion();
    expect(movimiento.opciones.iterations).toBe(Infinity);
    expect(movimiento.opciones.direction).toBe("alternate");
  });

  it("el fundido desenfoca, la cristalización escalona y la alquimia satura", () => {
    expect(fundidoDesenfoque().propiedades).toContain("filter");
    expect(cristalizacion(2).opciones.delay).toBe(120);
    expect(cristalizacion(99).opciones.delay).toBe(480);
    expect(alquimia().propiedades).toContain("filter");
  });

  it("el barrido de horizonte trae línea y escena", () => {
    const [linea, escena] = barridoHorizonte();
    expect(linea.keyframes[0].transform).toBe("scaleX(0)");
    expect(escena.keyframes[0].clipPath).toBe("inset(0 100% 0 0)");
    expect(escena.opciones.delay).toBe(300);
  });
});
