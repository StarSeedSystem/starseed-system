// Recuerdo semántico: fusión por rango recíproco (RRF) de Memvid y LEANN (LNN1028A).
// Memvid busca por palabras y LEANN por significado; ninguno manda. Cada lista llega ya
// ordenada por su fuente, y aquí cada recuerdo suma 1/(k + rango) por cada lista en la
// que aparece, se deduplica por uri (o huella del texto si no la lleva) y se corta.
// Módulo PURO: sin red, sin disco, sin procesos. Lo importan cliente y servidor.
// Contrato: architecture/leann-recuerdo-semantico.md §4.

import type { AlcanceMemoria } from "../nucleo/alcance-memoria";

/** Un recuerdo tal y como lo devuelve Memvid o el servidor LEANN. */
export interface Recuerdo {
  uri: string;
  texto: string;
  titulo?: string;
  ts?: number;
  fuente: "memvid" | "leann";
  puntuacion?: number;
  alcance: AlcanceMemoria;
}

/** Opciones de la fusión, todas con los valores que pide el contrato. */
export interface OpcionesFusion {
  /** Constante de suavizado del RRF. 60 es el valor de la biblioteca original. */
  k?: number;
  /** Cuántos recuerdos devolver como mucho. */
  max?: number;
  /** Presupuesto conjunto de caracteres del texto de los recuerdos devueltos. */
  maxCaracteres?: number;
}

/** Clave de deduplicación: la uri si la lleva, o la huella del texto normalizado. */
function claveRecuerdo(r: Recuerdo): string {
  const uri = r.uri.trim();
  if (uri.length > 0) return uri;
  const texto = r.texto.toLowerCase().replace(/\s+/g, " ").trim();
  return texto.length > 0 ? `huella:${texto}` : "";
}

/** Los deduplicados ordenados: primero puntuación fundida, luego la original y luego el tiempo. */
function comparador(
  a: Recuerdo & { fundida: number },
  b: Recuerdo & { fundida: number },
): number {
  return (
    b.fundida - a.fundida ||
    (b.puntuacion ?? 0) - (a.puntuacion ?? 0) ||
    (b.ts ?? 0) - (a.ts ?? 0)
  );
}

/**
 * Funda varias listas de recuerdos por rango recíproco (RRF): lo visto por ambas fuentes
 * sube, gana el texto más largo de sus variantes, sale ordenado por puntuación fundida y
 * cortado por `max` y por el presupuesto `maxCaracteres` (para en el primero que no cabe).
 */
export function fundirRecuerdos(listas: Recuerdo[][], opciones: OpcionesFusion = {}): Recuerdo[] {
  const k = opciones.k ?? 60;
  const max = opciones.max ?? 6;
  const maxCaracteres = opciones.maxCaracteres ?? 1500;
  const porClave = new Map<string, Recuerdo & { fundida: number }>();
  for (const lista of listas) {
    lista.forEach((recuerdo, indice) => {
      const clave = claveRecuerdo(recuerdo);
      if (clave.length === 0) return;
      const aporte = 1 / (k + indice + 1);
      const previo = porClave.get(clave);
      if (!previo) {
        porClave.set(clave, { ...recuerdo, fundida: aporte });
        return;
      }
      previo.fundida += aporte;
      if (recuerdo.texto.length > previo.texto.length) {
        previo.texto = recuerdo.texto;
        previo.titulo = recuerdo.titulo ?? previo.titulo;
        previo.ts = recuerdo.ts ?? previo.ts;
      }
      previo.puntuacion = Math.max(previo.puntuacion ?? 0, recuerdo.puntuacion ?? 0);
    });
  }
  const fundidos = [...porClave.values()].sort(comparador);
  const salida: Recuerdo[] = [];
  let usados = 0;
  for (const r of fundidos) {
    if (salida.length >= max) break;
    if (usados + r.texto.length > maxCaracteres) break;
    usados += r.texto.length;
    const { fundida, ...resto } = r;
    salida.push({ ...resto, puntuacion: fundida });
  }
  return salida;
}

// Palabra con inicial mayúscula y continuidad minúscula, o acrónimo todo en mayúsculas.
const PATRON_MAYUSCULA = /^[A-ZÁÉÍÓÚÑÜ](?:[a-záéíóúñü]+|[A-ZÁÉÍÓÚÑÜ]+)$/;

/** ¿La consulta va entre comillas? Importa la frase exacta, no el significado. */
function llevaComillas(consulta: string): boolean {
  return /["«»“”]/.test(consulta);
}

/**
 * ¿La consulta nombra algo concreto? Un vocablo con inicial mayúscula que no abre la
 * pregunta —el primero no cuenta: en español toda pregunta arranca en mayúscula tras
 * el signo de apertura—.
 */
function llevaNombresPropios(consulta: string): boolean {
  const palabras = consulta.replace(/^[¡¿]+/, "").trim().split(/\s+/);
  return palabras.slice(1).some((palabra) => PATRON_MAYUSCULA.test(palabra));
}

/** Peso mezclador vector/palabras para LEANN: 0,7 por defecto, 0,4 con comillas o nombres propios (manda la palabra). */
export function pesoVectorPara(consulta: string): number {
  return llevaComillas(consulta) || llevaNombresPropios(consulta) ? 0.4 : 0.7;
}
