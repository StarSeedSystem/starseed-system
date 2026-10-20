import { describe, expect, it } from "vitest";
import {
  PHI,
  aristaMinima,
  aristasEmergentes,
  cubo,
  cuboDeMetatron,
  centrosFlorDeLaVida,
  distancia,
  dodecaedro,
  esferaFibonacci,
  icosaedro,
  jitterbug,
  longitud,
  matrizIsotropica,
  merkaba,
  octaedro,
  posicionEnArista,
  repartoEnAristas,
  rotar4D,
  teseracto,
  teseractoAristas,
  teseractoVertices,
  tetraedro,
  type FormaGeometrica,
  type Vec3,
} from "../geometria";

const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Cada cara mira hacia fuera: su normal apunta lejos del centro sagrado. */
function carasHaciaFuera(f: FormaGeometrica): boolean {
  return f.caras.every(([a, b, c]) => {
    const n = cruz(resta(f.vertices[b], f.vertices[a]), resta(f.vertices[c], f.vertices[a]));
    const centro: Vec3 = [0, 1, 2].map((k) => (f.vertices[a][k] + f.vertices[b][k] + f.vertices[c][k]) / 3) as Vec3;
    return punto(n, centro) > 0;
  });
}

describe("sólidos platónicos", () => {
  it.each([
    ["tetraedro", tetraedro(), 4, 6, 4],
    ["octaedro", octaedro(), 6, 12, 8],
    ["cubo", cubo(), 8, 12, 12],
    ["icosaedro", icosaedro(), 12, 30, 20],
    ["dodecaedro", dodecaedro(), 20, 30, 36],
  ])("%s: vértices, aristas y caras (triángulos) y radio 1", (_n, f, v, e, t) => {
    expect(f.vertices).toHaveLength(v);
    expect(f.aristas).toHaveLength(e);
    expect(f.caras).toHaveLength(t);
    for (const p of f.vertices) expect(longitud(p)).toBeCloseTo(1, 9);
    expect(carasHaciaFuera(f)).toBe(true);
  });

  it("Euler en todos: V − A + C = 2 (con las caras reales, no los triángulos)", () => {
    expect(12 - 30 + 20).toBe(2);
    expect(20 - 30 + 12).toBe(2);
  });
});

describe("jitterbug de Fuller", () => {
  it("r = 1 es el equilibrio vectorial: 12 vértices a la misma distancia del centro que la arista", () => {
    const f = jitterbug(1);
    const radios = f.vertices.map(longitud);
    for (const r of radios) expect(r).toBeCloseTo(1, 9);
    expect(aristaMinima(f.vertices)).toBeCloseTo(1, 9);
    expect(f.aristas).toHaveLength(24);
  });

  it("los 8 triángulos son rígidos: la arista vale lo mismo en todo el recorrido", () => {
    for (const r of [1, 0.8, 1 / PHI, 0.3, 0.01, -0.5, -1]) {
      const f = jitterbug(r);
      expect(f.caras).toHaveLength(8);
      for (const [a, b, c] of f.caras) {
        expect(distancia(f.vertices[a], f.vertices[b])).toBeCloseTo(1, 9);
        expect(distancia(f.vertices[b], f.vertices[c])).toBeCloseTo(1, 9);
        expect(distancia(f.vertices[c], f.vertices[a])).toBeCloseTo(1, 9);
      }
      if (r > -0.9) expect(carasHaciaFuera(f)).toBe(true);
    }
  });

  it("r = 1/φ es el icosaedro: aparecen 6 aristas más (30 en total) y todos a igual radio", () => {
    const f = jitterbug(1 / PHI);
    const emergentes = aristasEmergentes(f, 1, 0.01).filter((x) => x.peso > 0.99);
    expect(f.aristas.length + emergentes.length).toBe(30);
    const r0 = longitud(f.vertices[0]);
    for (const v of f.vertices) expect(longitud(v)).toBeCloseTo(r0, 9);
  });

  it("r = 0 es el octaedro: los 12 vértices se juntan en 6 puntos", () => {
    const f = jitterbug(0);
    const unicos = new Set(f.vertices.map((v) => v.map((x) => x.toFixed(6)).join(",")));
    expect(unicos.size).toBe(6);
  });

  it("los índices no saltan: cada vértice se mueve poco con un paso pequeño de r", () => {
    const a = jitterbug(0.62), b = jitterbug(0.61);
    for (let i = 0; i < 12; i++) expect(distancia(a.vertices[i], b.vertices[i])).toBeLessThan(0.05);
  });
});

describe("teseracto 4D", () => {
  it("16 vértices y 32 aristas", () => {
    expect(teseractoVertices()).toHaveLength(16);
    expect(teseractoAristas()).toHaveLength(32);
  });

  it("girar en 4D conserva la norma", () => {
    for (const v of teseractoVertices()) {
      const r = rotar4D(v, { xw: 0.7, yw: 1.3, zw: -0.4, xy: 0.2 });
      expect(Math.hypot(...r)).toBeCloseTo(2, 9);
    }
  });

  it("la proyección cabe en el radio 1 y da la profundidad w", () => {
    for (const ang of [{}, { xw: 0.5 }, { xw: 1.2, yw: 0.7, zw: 2.1 }]) {
      const t = teseracto(ang);
      for (const p of t.vertices) expect(longitud(p)).toBeLessThanOrEqual(1 + 1e-9);
      for (const w of t.w) expect(Math.abs(w)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("merkaba, matriz isotrópica y Fibonacci", () => {
  it("merkaba: dos tetraedros (8 vértices, 12 aristas, 8 caras) que giran en sentidos opuestos", () => {
    const m = merkaba(0.5);
    expect(m.vertices).toHaveLength(8);
    expect(m.aristas).toHaveLength(12);
    expect(m.caras).toHaveLength(8);
    expect(carasHaciaFuera(m)).toBe(true);
  });

  it("matriz isotrópica de frecuencia 2: 55 puntos (1 + 12 + 42) con todas las aristas iguales", () => {
    const m = matrizIsotropica(2);
    expect(m.vertices).toHaveLength(55);
    const l = distancia(m.vertices[m.aristas[0][0]], m.vertices[m.aristas[0][1]]);
    for (const [a, b] of m.aristas) expect(distancia(m.vertices[a], m.vertices[b])).toBeCloseTo(l, 9);
  });

  it("esfera de Fibonacci: n puntos en la esfera unidad", () => {
    const e = esferaFibonacci(144);
    expect(e).toHaveLength(144);
    for (const p of e) expect(longitud(p)).toBeCloseTo(1, 9);
  });

  it("flor de la vida: 7 centros con un anillo y 19 con dos; Metatrón: 13 centros y 78 líneas", () => {
    expect(centrosFlorDeLaVida(1)).toHaveLength(7);
    expect(centrosFlorDeLaVida(2)).toHaveLength(19);
    const m = cuboDeMetatron();
    expect(m.centros).toHaveLength(13);
    expect(m.lineas).toHaveLength(78);
  });

  it("las partículas fluyen por las aristas y vuelven a empezar", () => {
    const f = cubo();
    const r = repartoEnAristas(f, 144);
    expect(r).toHaveLength(144);
    const [p, q] = f.aristas[r[5].arista];
    const a = posicionEnArista(f, r[5].arista, 0);
    expect(distancia(a, f.vertices[p])).toBeCloseTo(0, 9);
    const mitad = posicionEnArista(f, r[5].arista, 1.5);
    const medio: Vec3 = [0, 1, 2].map((k) => (f.vertices[p][k] + f.vertices[q][k]) / 2) as Vec3;
    expect(distancia(mitad, medio)).toBeCloseTo(0, 9);
  });
});
