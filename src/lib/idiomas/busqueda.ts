/**
 * TRA1116-IDIOMAS · Búsqueda de idiomas por nombre, nombre propio, código o alias.
 * Normaliza (NFD, sin diacríticos, minúsculas, espacios); coincide por prefijo y por contenido.
 * Módulo PURO: sin React, sin `node:*` ni red.
 */
import { IDIOMAS, Idioma } from "./idiomas";
import { ALIAS } from "./tabla-iso";

export interface IdiomaMundialBusqueda {
  codigo: string;
  nombrePropio: string;
  nombreActual: string;
  alias: string[];
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function distanciaEdicion(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
    }
  }
  return d[m][n];
}

export function buscarIdiomas(lista: IdiomaMundialBusqueda[], consulta: string): IdiomaMundialBusqueda[] {
  if (!consulta.trim()) return [...lista];

  const consultaNormalizada = normalizar(consulta);

  const resultados: { item: IdiomaMundialBusqueda; prioridad: number; errado: boolean }[] = [];

  for (const item of lista) {
    const nombrePropio = item.nombrePropio.toLowerCase();
    const nombreActual = item.nombreActual.toLowerCase();
    const codigo = item.codigo.toLowerCase();

    const nombrePropioNorm = normalizar(nombrePropio);
    const nombreActualNorm = normalizar(nombreActual);

    const aliasNorm = item.alias.map((a) => normalizar(a));

    let coincidencia = -1;

    if (aliasNorm.some((a) => a === consultaNormalizada) || aliasNorm.some((a) => a.includes(consultaNormalizada))) {
      coincidencia = 4;
    } else if (nombrePropioNorm === consultaNormalizada || nombreActualNorm === consultaNormalizada) {
      coincidencia = 3;
    } else if (codigo === consultaNormalizada) {
      coincidencia = 2;
    } else if (nombrePropioNorm.startsWith(consultaNormalizada) || nombreActualNorm.startsWith(consultaNormalizada) || codigo.startsWith(consultaNormalizada) || aliasNorm.some((a) => a.startsWith(consultaNormalizada))) {
      coincidencia = 1;
    } else if (nombrePropioNorm.includes(consultaNormalizada) || nombreActualNorm.includes(consultaNormalizada) || aliasNorm.some((a) => a.includes(consultaNormalizada))) {
      coincidencia = 0;
    } else {
      const distancia = distanciaEdicion(consultaNormalizada, nombrePropioNorm) <= 3 || distanciaEdicion(consultaNormalizada, nombreActualNorm) <= 3;
      if (distancia && consultaNormalizada.length >= 4) {
        coincidencia = 0;
      } else {
        continue;
      }
    }

    resultados.push({ item, prioridad: coincidencia, errado: coincidencia === -1 });
  }

  resultados.sort((a, b) => {
    if (b.errado !== a.errado) return a.errado ? 1 : -1;
    if (b.prioridad !== a.prioridad) return b.prioridad - a.prioridad;
    return a.item.codigo.localeCompare(b.item.codigo);
  });

  return resultados.map((r) => r.item);
}

export function buscarIdiomaPorCodigo(lista: IdiomaMundialBusqueda[], codigo: string): IdiomaMundialBusqueda | undefined {
  return lista.find((i) => i.codigo.toLowerCase() === codigo.toLowerCase());
}

export function buscarIdiomaPorNombre(lista: IdiomaMundialBusqueda[], nombre: string): IdiomaMundialBusqueda | undefined {
  const resultados = buscarIdiomas(lista, nombre);
  return resultados[0];
}