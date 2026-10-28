// Fusión por rango recíproco (RRF) de los recuerdos que devuelven Memvid y LEANN (LNN1028A).
//
// Ola LNN1028, tarea A: módulo PURO. Sin red, sin disco, sin procesos. `recordar`
// (LNN1028F) busca a la vez en Memvid (palabras y tiempo) y en LEANN (significado, en el A1)
// y funde las dos listas aquí. Contratos: `architecture/leann-recuerdo-semantico.md` §4
// (RRF con k=60 y dedupe por uri) y `architecture/astraura-multicapas-fusion.md` (la puerta
// «Recordar»: ningún sistema aparte). Sin servidor LEANN, Memvid sigue solo y nada falla.

import type { AlcanceMemoria } from "../nucleo/alcance-memoria";

/** Un recuerdo ya devuelto por Memvid o LEANN, listo para fundir y filtrar por alcance. */
export interface Recuerdo {
  /** Identidad del pasaje (p. ej. `mv2://cápsula/123#4`); sin uri, manda la huella del texto. */
  uri: string;
  texto: string;
  titulo?: string;
  /** Milisegundos absolutos, para las cápsulas que hablan de tiempo. */
  ts?: number;
  fuente: "memvid" | "leann";
  /** Puntuación de su lista de origen; tras la fusión la sustituye la fundida. */
  puntuacion?: number;
  alcance: AlcanceMemoria;
}

/** Opciones de la fusión. Los valores por defecto son los del contrato. */
export interface OpcionesFusion {
  /** Constante de RRF: 60 es la que usa la literatura y el contrato LNN1028. */
  k?: number;
  /** Recuerdos como máximo que devuelve la fusión. */
  max?: number;
  /** Caracteres de texto acumulados como máximo (presupuesto del bloque RECUERDOS). */
  maxCaracteres?: number;
}

/** Huella del texto: la clave de dedupe de un recuerdo que no trae uri. */
export function huellaTexto(texto: string): string {
  return texto.toLowerCase().replace(/\s+/g, " ").trim();
}

const POR_DEFECTO = { k: 60, max: 6, maxCaracteres: 1500 };

function claveDe(rec: Recuerdo): string {
  return rec.uri || huellaTexto(rec.texto);
}

/**
 * Corta una lista ya ordenada por los dos topes del contrato: no más de `max` recuerdos
 * y no más de `maxCaracteres` de texto acumulado. Solo entra un recuerdo que cabe entero.
 */
function cortar(ordendos: Recuerdo[], max: number, maxCaracteres: number): Recuerdo[] {
  const pasan: Recuerdo[] = [];
  let total = 0;
  for (const rec of ordendos) {
    if (pasan.length >= max) break;
    if (total + rec.texto.length > maxCaracteres) break;
    pasan.push(rec);
    total += rec.texto.length;
  }
  return pasan;
}

export function fundirRecuerdos(listas: Recuerdo[][], opciones: OpcionesFusion = {}): Recuerdo[] {
  const { k, max, maxCaracteres } = { ...POR_DEFECTO, ...opciones };
  // Un recuerdo aparece un solo rango por lista; en varias listas, sus votos suman.
  const votos = new Map<string, number>();
  const mejores = new Map<string, Recuerdo>();
  listas.forEach((lista) => {
    lista.forEach((rec, indice) => {
      const clave = claveDe(rec);
      votos.set(clave, (votos.get(clave) ?? 0) + 1 / (k + indice + 1));
      const visto = mejores.get(clave);
      if (!visto || rec.texto.length > visto.texto.length) mejores.set(clave, rec);
    });
  });
  // `votos` conserva el orden del primer avistamiento; el sort estable lo usa de
  // desempate: dos recuerdos con la misma puntuación fundida no cambian de sitio.
  const fusionados: Recuerdo[] = [];
  for (const [clave, voto] of votos) {
    const mejor = mejores.get(clave);
    if (mejor) fusionados.push({ ...mejor, puntuacion: voto });
  }
  fusionados.sort((a, b) => (b.puntuacion ?? 0) - (a.puntuacion ?? 0));
  return cortar(fusionados, max, maxCaracteres);
}

/** Comillas que marcan búsqueda literal: español tipográfico y recto. */
const COMILLAS = /["“”«»]/;

/** Primera letra mayúscula, que delata un nombre propio. */
function arrancaMayuscula(palabra: string): boolean {
  const desnuda = palabra.replace(/[^\p{L}]+/gu, "");
  return /^[A-ZÁÉÍÓÚÜÑ]/.test(desnuda);
}

/**
 * 0,7 por defecto (manda lo vectorial); 0,4 cuando la consulta pide palabras: lleva
 * comillas o un nombre propio fuera del arranque de la frase (el significado que ofrece
 * el vector falla ahí; más papeles es la mezcla BM25/vector de LEANN, `vector_weight`).
 */
export function pesoVectorPara(consulta: string): number {
  if (COMILLAS.test(consulta)) return 0.4;
  const palabras = consulta.split(/\s+/).filter(Boolean);
  const hayPropio = palabras.some((palabra, indice) => indice > 0 && arrancaMayuscula(palabra));
  return hayPropio ? 0.4 : 0.7;
}
