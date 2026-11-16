/**
 * Proyección 2D ligera de las formas de la Protomolécula (aristas y puntos, sin three.js).
 * Lógica PURA: sin React, sin three.js, sin `node:*`. Determinista: misma entrada, misma salida.
 */
import { type FormaGeometrica, type IdForma, merkaba, icosaedro, dodecaedro, jitterbug, teseracto, teseractoAristas, esferaFibonacci, normalizar, octaedro, type Vec3, type Arista } from "./geometria";

const INCLINACION_X = 0.35;
const RADIO_INSCRITO_FACTOR = 0.42;
const MAX_LINEAS = 120;
const MAX_PUNTOS = 60;

function rotarY(v: Vec3, angulo: number): Vec3 {
  const c = Math.cos(angulo), s = Math.sin(angulo);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function rotarX(v: Vec3, angulo: number): Vec3 {
  const c = Math.cos(angulo), s = Math.sin(angulo);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

function proyectarOrtografica(vertices: Vec3[], lado: number): [number, number][] {
  const radio = lado * RADIO_INSCRITO_FACTOR;
  const escala = radio;
  return vertices.map((v) => [Number((v[0] * escala).toFixed(2)), Number((v[1] * escala).toFixed(2))]);
}

function aristasALineas(vertices: Vec3[], aristas: Arista[], lado: number): [number, number, number, number][] {
  const proy = proyectarOrtografica(vertices, lado);
  const lineas: [number, number, number, number][] = [];
  for (const [a, b] of aristas) {
    if (a < proy.length && b < proy.length) {
      lineas.push([proy[a][0], proy[a][1], proy[b][0], proy[b][1]]);
    }
  }
  return lineas.slice(0, MAX_LINEAS);
}

function obtenerForma(id: IdForma, giro: number): FormaGeometrica {
  switch (id) {
    case "merkaba": {
      const m = merkaba(giro);
      const dual = octaedro();
      const vertices = [...m.vertices, ...dual.vertices];
      const aristas = [...m.aristas, ...dual.aristas.map(([a, b]) => [a + m.vertices.length, b + m.vertices.length] as Arista)];
      return { vertices, aristas, caras: [] };
    }
    case "icosaedro":
      return icosaedro();
    case "dodecaedro":
      return dodecaedro();
    case "jitterbug":
      return jitterbug(0.5);
    case "teseracto": {
      const angulos = { xw: giro } as const;
      const t = teseracto(angulos);
      return { vertices: t.vertices, aristas: teseractoAristas(), caras: [] };
    }
    case "semilla": {
      const vertices = esferaFibonacci(55);
      return { vertices: normalizar(vertices), aristas: [], caras: [] };
    }
    case "matriz":
    case "modelo": {
      const vertices = esferaFibonacci(55);
      return { vertices: normalizar(vertices), aristas: [], caras: [] };
    }
    default: {
      const vertices = esferaFibonacci(55);
      return { vertices: normalizar(vertices), aristas: [], caras: [] };
    }
  }
}

export function proyectarForma(id: IdForma, giro: number, lado = 100): { lineas: [number, number, number, number][]; puntos: [number, number][] } {
  const forma = obtenerForma(id, giro);
  const rotados = forma.vertices.map((v) => rotarX(rotarY(v, giro), INCLINACION_X));
  const lineas = aristasALineas(rotados, forma.aristas, lado);
  const puntos = proyectarOrtografica(rotados, lado).slice(0, MAX_PUNTOS);
  return { lineas, puntos };
}