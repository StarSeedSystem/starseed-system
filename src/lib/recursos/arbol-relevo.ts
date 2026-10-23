/**
 * arbol-relevo — Árbol de relevo de un flujo por la malla (Ola 1017A, APM1017V).
 * Contrato: architecture/apps-en-la-malla.md §10. PURO: sin red, reloj ni disco.
 * Cada nodo sostiene floor(subidaKbps / kbpsFlujo) hijos; sin medida, 1. Más subida
 * = más cerca del origen. Orden determinista: subida ↓, latencia ↑, id ↑.
 */

export interface ReceptorRelevo {
  nodoId: string;
  subidaKbps?: number;
  latenciaMs?: number;
}
export type OrigenRelevo = string | ReceptorRelevo;
export interface ArbolRelevo {
  origen: string;
  padres: Record<string, string>;
  capacidades: Record<string, number>;
  orden: string[];
}
/** PURA. Huecos de hijo de un nodo. Sin medida (o flujo inválido) = 1. */
export function capacidadHijos(subidaKbps: number | undefined, kbpsFlujo: number): number {
  if (!Number.isFinite(kbpsFlujo) || kbpsFlujo <= 0) return 1;
  if (subidaKbps === undefined || !Number.isFinite(subidaKbps)) return 1;
  return Math.max(0, Math.floor(subidaKbps / kbpsFlujo));
}
function compararReceptores(a: ReceptorRelevo, b: ReceptorRelevo): number {
  const sa = a.subidaKbps !== undefined && Number.isFinite(a.subidaKbps) ? a.subidaKbps : 0;
  const sb = b.subidaKbps !== undefined && Number.isFinite(b.subidaKbps) ? b.subidaKbps : 0;
  if (sb !== sa) return sb - sa;
  const la = a.latenciaMs !== undefined && Number.isFinite(a.latenciaMs) ? a.latenciaMs : Infinity;
  const lb = b.latenciaMs !== undefined && Number.isFinite(b.latenciaMs) ? b.latenciaMs : Infinity;
  if (la !== lb) return la - lb;
  return a.nodoId === b.nodoId ? 0 : a.nodoId < b.nodoId ? -1 : 1;
}
function normalizar(receptores: ReceptorRelevo[], origenId: string): ReceptorRelevo[] {
  const vistos = new Set<string>([origenId]);
  return [...receptores].sort(compararReceptores).filter((receptor) => {
    if (receptor.nodoId.length === 0 || vistos.has(receptor.nodoId)) return false;
    vistos.add(receptor.nodoId);
    return true;
  });
}
/** PURA. Arma el árbol: cada receptor cuelga del primer nodo con hueco, en orden de prioridad. */
export function armarArbol(
  origen: OrigenRelevo,
  receptores: ReceptorRelevo[],
  kbpsFlujo: number,
): ArbolRelevo {
  const raiz = typeof origen === "string" ? { nodoId: origen } : origen;
  const lista = normalizar(receptores, raiz.nodoId);
  const padres: Record<string, string> = {};
  const capacidades: Record<string, number> = {
    [raiz.nodoId]: capacidadHijos(raiz.subidaKbps, kbpsFlujo),
  };
  const ocupados: Record<string, number> = {};
  const colocados = [raiz.nodoId];
  for (const receptor of lista) {
    capacidades[receptor.nodoId] = capacidadHijos(receptor.subidaKbps, kbpsFlujo);
    let padre = raiz.nodoId;
    for (const candidato of colocados) {
      if ((ocupados[candidato] ?? 0) < capacidades[candidato]) {
        padre = candidato;
        break;
      }
    }
    padres[receptor.nodoId] = padre;
    ocupados[padre] = (ocupados[padre] ?? 0) + 1;
    colocados.push(receptor.nodoId);
  }
  return { origen: raiz.nodoId, padres, capacidades, orden: lista.map((r) => r.nodoId) };
}
function hijosDe(padres: Record<string, string>, orden: string[]): Record<string, string[]> {
  const hijos: Record<string, string[]> = {};
  for (const nodo of orden) {
    const padre = padres[nodo];
    if (padre === undefined) continue;
    (hijos[padre] ??= []).push(nodo);
  }
  return hijos;
}
function enRama(padres: Record<string, string>, raiz: string, nodo: string): boolean {
  let actual: string | undefined = nodo;
  while (actual !== undefined) {
    if (actual === raiz) return true;
    actual = padres[actual];
  }
  return false;
}
/** PURA. Recoloca solo la rama del nodo que se va; el resto del árbol no se toca. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const padres = { ...arbol.padres };
  const capacidades = { ...arbol.capacidades };
  const orden = arbol.orden.filter((nodo) => nodo !== seVa);
  if (seVa === arbol.origen || arbol.padres[seVa] === undefined) {
    return { origen: arbol.origen, padres, capacidades, orden: [...arbol.orden] };
  }
  const rama = hijosDe(padres, arbol.orden)[seVa] ?? [];
  delete padres[seVa];
  delete capacidades[seVa];

  for (const huerfano of rama) {
    const hijos = hijosDe(padres, orden);
    const candidatos = [arbol.origen];
    for (let i = 0; i < candidatos.length; i++) {
      for (const hijo of hijos[candidatos[i]] ?? []) candidatos.push(hijo);
    }
    let destino: string | undefined;
    for (const candidato of candidatos) {
      if (!enRama(padres, huerfano, candidato) &&
          (hijos[candidato]?.length ?? 0) < capacidades[candidato]) {
        destino = candidato;
        break;
      }
    }
    // Sin hueco en la red se cuelga del origen para no dejar a nadie fuera.
    padres[huerfano] = destino ?? arbol.origen;
  }
  return { origen: arbol.origen, padres, capacidades, orden };
}
