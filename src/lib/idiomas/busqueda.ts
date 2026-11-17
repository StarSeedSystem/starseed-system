/**
 * TRA1116 · Búsqueda de idiomas por nombre, nombre propio, código o alias.
 * Módulo PURO: normaliza sin acentos y tolera una errata; sin red ni `node:*`.
 */
import type { IdiomaMundial } from "./lista-mundial";

const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

/** Pasa a minúsculas, quita diacríticos y deja los espacios simples. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de edición de Levenshtein entre dos cadenas ya normalizadas. */
function distanciaEdicion(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
        anterior[j] + 1,
        actual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    anterior = actual;
  }
  return anterior[b.length];
}

/** Rango de una coincidencia: 0 código exacto, 1 prefijo, 2 contiene, 3 errata. */
function rangoDe(idioma: IdiomaMundial, consulta: string): number | null {
  const codigo = normalizar(idioma.codigo);
  if (codigo === consulta) return 0;

  const nombres = [idioma.nombrePropio, idioma.nombreActual, ...idioma.alias]
    .map(normalizar)
    .filter((nombre) => nombre.length > 0);

  if (nombres.some((nombre) => nombre.startsWith(consulta))) return 1;
  if (codigo.startsWith(consulta)) return 1;
  if (nombres.some((nombre) => nombre.includes(consulta))) return 2;

  if (consulta.length >= 4 && nombres.some((nombre) => distanciaEdicion(nombre, consulta) <= 1)) {
    return 3;
  }
  return null;
}

/** Busca idiomas y devuelve una lista ordenada por calidad de coincidencia. */
export function buscarIdiomas(lista: IdiomaMundial[], consulta: string): IdiomaMundial[] {
  const texto = normalizar(consulta);
  if (texto.length === 0) return lista;

  const coincidencias: { idioma: IdiomaMundial; rango: number }[] = [];
  for (const idioma of lista) {
    const rango = rangoDe(idioma, texto);
    if (rango !== null) coincidencias.push({ idioma, rango });
  }

  coincidencias.sort((a, b) => {
    if (a.rango !== b.rango) return a.rango - b.rango;
    const nombreA = normalizar(a.idioma.nombreActual);
    const nombreB = normalizar(b.idioma.nombreActual);
    const porNombre = nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
    if (porNombre !== 0) return porNombre;
    return a.idioma.codigo.localeCompare(b.idioma.codigo);
  });

  return coincidencias.map(({ idioma }) => idioma);
}
