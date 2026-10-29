import { describe, it, expect } from "vitest";
import {
  CURVAS_ADN,
  DURACION_ADN,
  entradaCardinal,
  fundidoDesenfoque,
  elementoCompartido,
  barridoHorizonte,
  respiracion,
  cristalizacion,
  alquimia,
  siembra,
  opcionesReducidas,
  opcionesWAAPI,
  type Animacion,
  type PuntoTrinity,
} from "@/lib/design/movimiento-starseed";

/** Propiedades animables: las cuatro permitidas por el ADN, más el offset de WAAPI. */
const PROPIEDADES = new Set(["transform", "opacity", "filter", "clipPath", "offset"]);
const PUNTOS: PuntoTrinity[] = ["zenith", "horizonte", "logica", "anchor"];
const DURACIONES_INTERFAZ = [140, 220, 240];

/** El universo completo: una pieza viva de cada movimiento grande de la biblioteca. */
function universo(): Animacion[] {
  const b = barridoHorizonte();
  return [
    ...PUNTOS.map((p) => entradaCardinal(p)),
    fundidoDesenfoque(),
    elementoCompartido(),
    b.linea,
    b.escena,
    ...cristalizacion(12),
    alquimia(),
  ];
}

/** Las microfases de la siembra y el ciclo de respiración van con sus propias reglas. */
function fasesVivas(): Animacion[] {
  const b = barridoHorizonte();
  const s = siembra();
  return [
    b.linea,
    b.escena,
    respiracion(),
    s.punto, s.circuloIzq, s.circuloDer, s.ojo, s.pupila, s.diamante, s.titulo, s.respira,
  ];
}

/** Solo se animan las propiedades permitidas, con curvas del ADN y sin hex sueltos. */
function revisar(a: Animacion): void {
  expect(Object.values(CURVAS_ADN)).toContain(a.curva);
  for (const f of a.fotogramas) {
    for (const clave of Object.keys(f)) expect(PROPIEDADES.has(clave)).toBe(true);
    for (const clave of Object.keys(f) as Array<keyof typeof f>) {
      const valor = f[clave];
      if (typeof valor === "string") expect(valor.includes("#")).toBe(false);
    }
  }
}

describe("Biblioteca de movimiento StarSeed — propiedades permitidas", () => {
  it("toda pieza anima solo transform, opacity, filter y clip-path, sin hex sueltos", () => {
    const piezas = [...universo(), ...fasesVivas()];
    expect(piezas.length).toBeGreaterThanOrEqual(15);
    for (const pieza of piezas) revisar(pieza);
  });

  it("los tokens traen las duraciones de interfaz (140/220/240) y el rango de escena 600–900", () => {
    expect(DURACION_ADN.interfazRapida).toBe(140);
    expect(DURACION_ADN.interfaz).toBe(220);
    expect(DURACION_ADN.interfazNormal).toBe(240);
    expect(DURACION_ADN.escenaMinima).toBe(600);
    expect(DURACION_ADN.escenaMaxima).toBe(900);
  });

  it("las entradas de escena usan duraciones de 600–900 ms; la interfaz, 140/220/240", () => {
    for (const pieza of universo()) {
      const { duracionMs } = pieza;
      const enInterfaz = DURACIONES_INTERFAZ.includes(duracionMs);
      const enEscena = duracionMs >= 600 && duracionMs <= 900;
      expect(enInterfaz || enEscena).toBe(true);
    }
  });

  it("las microfases de la siembra viven entre 300 y 900 ms; la respiración, entre 4 y 6 s", () => {
    const s = siembra();
    for (const fase of [s.punto, s.circuloIzq, s.ojo, s.pupila, s.diamante, s.titulo]) {
      expect(fase.duracionMs).toBeGreaterThanOrEqual(300);
      expect(fase.duracionMs).toBeLessThanOrEqual(900);
    }
    expect(respiracion().duracionMs).toBeGreaterThanOrEqual(4000);
    expect(respiracion().duracionMs).toBeLessThanOrEqual(6000);
  });
});

describe("Movimientos concretos", () => {
  it("entrada cardinal: cada punto de la Trinity llega desde su borde y al centro", () => {
    const ejes: Record<PuntoTrinity, string> = { zenith: "translateY(-24px)", horizonte: "translateX(-24px)", logica: "translateX(24px)", anchor: "translateY(24px)" };
    for (const punto of PUNTOS) {
      const a = entradaCardinal(punto);
      expect(a.fotogramas[0].transform).toBe(`${ejes[punto]} scale(0.98)`);
      expect(a.fotogramas[a.fotogramas.length - 1].transform).toBe("none");
      expect(a.duracionMs).toBe(DURACION_ADN.escena);
    }
  });

  it("barrido de horizonte: la escena se desenrolla 300 ms después de la línea", () => {
    const b = barridoHorizonte();
    expect(b.linea.fotogramas[0].transform).toBe("scaleX(0)");
    expect(b.escena.retardoMs).toBe(b.linea.retardoMs + 300);
    expect(b.escena.fotogramas[0].clipPath).toBe("inset(0 100% 0 0)");
  });

  it("respiración: 1 → 1.03, un ciclo entre 4 y 6 s, y en reducido queda quieta", () => {
    const r = respiracion();
    expect(r.fotogramas).toEqual([{ transform: "scale(1)" }, { transform: "scale(1.03)" }]);
    expect(r.duracionMs).toBeGreaterThanOrEqual(4000);
    expect(r.duracionMs).toBeLessThanOrEqual(6000);
    expect(Number.isFinite(r.iteraciones)).toBe(false);
    expect(opcionesReducidas(r).iteraciones).toBe(1);
  });

  it("fundido con desenfoque y elemento compartido copian el ejemplo vivo", () => {
    expect(fundidoDesenfoque().fotogramas[0].filter).toBe("blur(8px)");
    const e = elementoCompartido();
    expect(e.fotogramas[1].transform).toBe("scale(2.6, 3.2)");
    expect(e.alternar).toBe(true);
  });

  it("alquimia revela el oro de lógica por filtro, sin tocar color en los keyframes", () => {
    const a = alquimia();
    expect(a.duracionMs).toBe(DURACION_ADN.interfazNormal);
    expect(a.fotogramas[0].filter).toContain("grayscale(1)");
    expect(a.fotogramas.some((f) => f.filter === undefined)).toBe(true);
  });

  it("siembra: línea de tiempo en orden (punto → vesica → ojo → diamante → título)", () => {
    const s = siembra();
    const tiempos = [s.punto.retardoMs, s.circuloIzq.retardoMs, s.ojo.retardoMs, s.pupila.retardoMs, s.diamante.retardoMs, s.titulo.retardoMs];
    expect(tiempos).toEqual([0, 350, 1050, 1250, 1500, 2000]);
    expect(s.circuloIzq.fotogramas[0].transform).toContain("translateX(40px)");
    expect(s.circuloDer.fotogramas[0].transform).toContain("translateX(-40px)");
    expect(s.diamante.fotogramas[0].clipPath).toBe("inset(0 100% 0 0)");
  });
});

describe("Cristalización y movimiento reducido", () => {
  it("cristalización: un nodo por pieza, en cascada, y todo asentado en «none»", () => {
    const piezas = cristalizacion(12);
    expect(piezas.length).toBe(12);
    expect(piezas[0].retardoMs).toBe(0);
    expect(piezas[11].retardoMs).toBe(300);
    for (const p of piezas) {
      expect(p.fotogramas[p.fotogramas.length - 1].transform).toBe("none");
      revisar(p);
    }
    expect(cristalizacion(5)[2]).toEqual(cristalizacion(5)[2]);
    expect(cristalizacion(0)).toEqual([]);
  });

  it("movimiento reducido: 1 ms, sin retardo, sin bucles, en TODAS las piezas", () => {
    for (const pieza of [...universo(), ...fasesVivas()]) {
      const r = opcionesReducidas(pieza);
      expect(r.duracionMs).toBe(1);
      expect(r.retardoMs).toBe(0);
      expect(r.iteraciones).toBe(1);
      expect(r.alternar).toBe(false);
      expect(r.fotogramas).toEqual(pieza.fotogramas);
    }
  });

  it("opcionesWAAPI entrega el mismo ritmo al runtime", () => {
    const a = alquimia();
    expect(opcionesWAAPI(a)).toEqual({
      duration: a.duracionMs,
      easing: a.curva,
      delay: a.retardoMs,
      fill: "both",
      iterations: 1,
      direction: "normal",
    });
    expect(opcionesWAAPI(respiracion()).direction).toBe("alternate");
  });
});
