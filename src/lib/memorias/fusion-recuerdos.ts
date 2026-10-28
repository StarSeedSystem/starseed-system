// Recuerdo semántico · fusión por rango recíproco (RRF) de Memvid y LEANN (LNN1028A).
// Contrato: architecture/leann-recuerdo-semantico.md §4 — capa PURA: sin red, sin disco,
// sin procesos. La llama `recordar` (LNN1028F); referencia de la versión Python (LNN1028A2).

import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";

/** De qué sistema salió el recuerdo. */
export type FuenteRecuerdo = "memvid" | "leann";

/** Un recuerdo candidato, tal como lo devuelven Memvid o LEANN. */
export interface Recuerdo {
  /** Dirección única del recuerdo (p. ej. «mv2://…»); vacía, manda la huella del texto. */
  uri: string;
  texto: string;
  titulo?: string;
  ts?: number;
  fuente: FuenteRecuerdo;
  /** Puntuación original del sistema que lo trajo; en la salida va la fundida. */
  puntuacion?: number;
  alcance: AlcanceMemoria;
  /** Fuentes que lo trajeron: más de una si el dedupe lo fundió entre listas. */
  fuentes?: FuenteRecuerdo[];
}

/** Opciones de `fundirRecuerdos`: k 60, max 6 y maxCaracteres 1500 por defecto. */
export interface OpcionesFusion {
  k?: number;
  max?: number;
  maxCaracteres?: number;
}

const PESO_VECTOR_DEFECTO = 0.7;
const PESO_PALABRAS = 0.4;

/**
 * Peso vectorial de la búsqueda LEANN para esta consulta: 0,7 por defecto (manda el
 * significado). 0,4 cuando la consulta busca palabras literales —comillas o un nombre
 * propio a mitad de la frase—, porque entonces el BM25 de LEANN acierta más que el vector.
 */
export function pesoVectorPara(consulta: string): number {
  if (consulta.includes('"')) return PESO_PALABRAS;
  const palabras = consulta.trim().split(/\s+/);
  // La primera palabra no cuenta: ahí la mayúscula es solo el inicio de la frase.
  for (let i = 1; i < palabras.length; i++) {
    const limpia = palabras[i].replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}]+$/u, "");
    if (limpia.length > 0 && /^\p{Lu}/u.test(limpia)) return PESO_PALABRAS;
  }
  return PESO_VECTOR_DEFECTO;
}

/** Huella corta y determinista de un texto: clave de dedupe cuando no hay uri. */
function huella(texto: string): string {
  const normalizado = texto.replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < normalizado.length; i++) {
    h = (Math.imul(h, 33) + normalizado.charCodeAt(i)) | 0;
  }
  return `${normalizado.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

const redondear = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Funde las listas de Memvid y LEANN por rango recíproco: cada aparición suma
 * 1/(k + rango) a la puntuación del recuerdo, identificado por `uri` (o por la huella
 * del texto si el uri viene vacío), así que el que está en varias listas sube. El dedupe
 * se queda con el texto más largo y el empate lo rompe la primera aparición (determinista).
 * Corta por `max` recuerdos y `maxCaracteres` totales; el primero entra siempre.
 */
export function fundirRecuerdos(
  listas: Recuerdo[][],
  opciones: OpcionesFusion = {},
): Recuerdo[] {
  const k = opciones.k ?? 60;
  const max = opciones.max ?? 6;
  const maxCaracteres = opciones.maxCaracteres ?? 1500;

  type Fundido = { recuerdo: Recuerdo; fundida: number; fuentes: FuenteRecuerdo[]; orden: number };

  const fusiones = new Map<string, Fundido>();
  let orden = 0;
  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;
    for (let indice = 0; indice < lista.length; indice++) {
      const candidato = lista[indice];
      if (!candidato?.texto) continue;
      const clave = candidato.uri ? candidato.uri : `texto:${huella(candidato.texto)}`;
      const contribucion = 1 / (k + indice + 1);
      const existente = fusiones.get(clave);
      if (existente) {
        existente.fundida += contribucion;
        if (!existente.fuentes.includes(candidato.fuente)) existente.fuentes.push(candidato.fuente);
        if (candidato.texto.length > existente.recuerdo.texto.length) existente.recuerdo = candidato;
        continue;
      }
      fusiones.set(clave, {
        recuerdo: candidato,
        fundida: contribucion,
        fuentes: [candidato.fuente],
        orden: orden++,
      });
    }
  }

  const ordenados = [...fusiones.values()].sort((a, b) => b.fundida - a.fundida || a.orden - b.orden);

  const salida: Recuerdo[] = [];
  let usados = 0;
  for (const fundido of ordenados) {
    if (salida.length >= max) break;
    if (salida.length > 0 && usados + fundido.recuerdo.texto.length > maxCaracteres) break;
    salida.push({
      ...fundido.recuerdo,
      puntuacion: redondear(fundido.fundida),
      fuentes: fundido.fuentes,
    });
    usados += fundido.recuerdo.texto.length;
  }
  return salida;
}
