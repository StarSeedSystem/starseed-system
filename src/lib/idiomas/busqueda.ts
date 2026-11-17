/**
 * TRA1116-IDIOMAS · Búsqueda de idiomas por nombre propio, nombre actual, código o alias.
 * Módulo PURO: sin React, sin `node:*`, sin red. No muta la lista de entrada.
 */
import type { IdiomaMundial } from "./lista-mundial";

/** Rango de coincidencia: menor es mejor. */
const CODIGO_EXACTO = 0;
const PREFIJO_NOMBRE = 1;
const CONTIENE = 2;
const ERRATA = 3;

/** NFD, sin diacríticos, minúsculas y espacios colapsados. */
function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de edición acotada a 2: solo interesa saber si es ≤ 1. */
function distanciaEdicion(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const actual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + coste);
    }
    anterior = actual;
  }
  return Math.min(anterior[b.length], 2);
}

/** ¿La consulta está a una sola errata del campo? */
function coincideConErrata(campo: string, consulta: string): boolean {
  return campo.length > 0 && distanciaEdicion(campo, consulta) <= 1;
}

/** Rango de un idioma para la consulta ya normalizada, o null si no coincide. */
function rangoDe(idioma: IdiomaMundial, consulta: string): number | null {
  const codigo = normalizarTexto(idioma.codigo);
  const nombres = [normalizarTexto(idioma.nombrePropio), normalizarTexto(idioma.nombreActual)];
  const alias = idioma.alias.map(normalizarTexto);

  if (codigo === consulta) return CODIGO_EXACTO;
  if (nombres.some((nombre) => nombre.startsWith(consulta))) return PREFIJO_NOMBRE;
  if (codigo.startsWith(consulta)) return CONTIENE;
  if (nombres.some((nombre) => nombre.includes(consulta))) return CONTIENE;
  if (alias.some((nombre) => nombre.includes(consulta))) return CONTIENE;

  if (consulta.length >= 4 && [...nombres, ...alias].some((campo) => coincideConErrata(campo, consulta))) {
    return ERRATA;
  }
  return null;
}

/** Clave alfabética estable para desempatar: nombre actual, nombre propio y código. */
function claveAlfabetica(idioma: IdiomaMundial): string {
  return [
    normalizarTexto(idioma.nombreActual),
    normalizarTexto(idioma.nombrePropio),
    normalizarTexto(idioma.codigo),
  ].join("\u0000");
}

export function buscarIdiomas(lista: IdiomaMundial[], consulta: string): IdiomaMundial[] {
  const buscado = normalizarTexto(consulta);
  if (buscado.length === 0) return lista;

  const encontrados: { idioma: IdiomaMundial; rango: number; clave: string }[] = [];
  for (const idioma of lista) {
    const rango = rangoDe(idioma, buscado);
    if (rango !== null) encontrados.push({ idioma, rango, clave: claveAlfabetica(idioma) });
  }

  encontrados.sort((a, b) => {
    if (a.rango !== b.rango) return a.rango - b.rango;
    return a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0;
  });

  return encontrados.map((item) => item.idioma);
}
