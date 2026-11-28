import type { Grafo4D, Nodo } from './modelo';

/** Tope por defecto de cuerpos (grupos) visibles a la vez. */
export const TOPE_CUERPOS_VISIBLES = 100;
/** Distancia a la que un grupo deja de estar abierto. */
export const DISTANCIA_COLAPSO = 100;

export type FacetaAgrupacion =
  | 'dueno'
  | 'cerebro'
  | 'entidad'
  | 'carpeta'
  | 'comunidad';

export interface GrupoColapsado {
  miembros: string[];
  tamano: number;
}

export interface ResultadoNivelDetalle {
  abiertos: Map<string, string[]>;
  colapsados: Map<string, GrupoColapsado>;
}

function valorDeCapa(nodo: Nodo, prefijo: string): string | undefined {
  const capa = nodo.capas.find((c) => c.startsWith(prefijo));
  const valor = capa ? capa.slice(prefijo.length) : '';
  return valor.length > 0 ? valor : undefined;
}

function claveDe(nodo: Nodo, faceta: FacetaAgrupacion): string | undefined {
  switch (faceta) {
    case 'dueno':
      return nodo.dueno;
    case 'cerebro':
      return nodo.capas[0] ?? 'sin-cerebro';
    case 'entidad':
      return (
        valorDeCapa(nodo, 'entidad-') ??
        (nodo.tipo === 'entidad' ? nodo.titulo : undefined)
      );
    case 'comunidad': {
      const capa = valorDeCapa(nodo, 'comunidad-');
      return capa ?? (nodo.alcance === 'comunidad' ? nodo.dueno : undefined);
    }
    default:
      return undefined;
  }
}

export function agruparPorFaceta(
  grafo: Grafo4D,
  faceta: FacetaAgrupacion
): Map<string, string[]> {
  const grupos = new Map<string, string[]>();

  if (faceta === 'carpeta') {
    for (const [padreId, hijos] of grafo.ramas.entries()) {
      if (grafo.nodos.get(padreId)?.tipo === 'carpeta') {
        grupos.set(padreId, hijos.filter((hijoId) => grafo.nodos.has(hijoId)));
      }
    }
    return grupos;
  }

  for (const [id, nodo] of grafo.nodos.entries()) {
    const clave = claveDe(nodo, faceta);
    if (clave === undefined) {
      continue;
    }
    const miembros = grupos.get(clave);
    if (miembros) {
      miembros.push(id);
    } else {
      grupos.set(clave, [id]);
    }
  }

  return grupos;
}

function pesoDe(id: string, pesos?: Map<string, number>): number {
  const peso = pesos?.get(id);
  return typeof peso === 'number' && Number.isFinite(peso) ? peso : 1;
}

function factorApertura(distancia: number, umbral: number): number {
  if (!Number.isFinite(distancia) || distancia <= 0) return 1;
  if (!Number.isFinite(umbral) || umbral <= 0) return 0;
  const factor = 1 - distancia / umbral;
  return factor > 0 ? factor : 0;
}

/**
 * Zoom semántico: cerca (distancia 0) todo se abre; lejos (>= umbral) todo se colapsa
 * en un cuerpo con tamaño = suma de pesos. En medio se abren primero los grupos más
 * pesados y se colapsan los ligeros, siempre sin pasar del tope de cuerpos visibles.
 */
export function nivelDeDetalle(
  distancia: number,
  grupos: Map<string, string[]>,
  tope: number,
  pesosNodos?: Map<string, number>,
  umbralDistancia: number = DISTANCIA_COLAPSO
): ResultadoNivelDetalle {
  const abiertos = new Map<string, string[]>();
  const colapsados = new Map<string, GrupoColapsado>();
  const limite = Number.isFinite(tope) ? Math.max(0, Math.floor(tope)) : 0;
  if (limite === 0 || grupos.size === 0) {
    return { abiertos, colapsados };
  }

  const conPeso = Array.from(grupos.entries()).map(([clave, miembros]) => ({
    clave,
    miembros,
    pesoTotal: miembros.reduce((acc, id) => acc + pesoDe(id, pesosNodos), 0),
  }));
  conPeso.sort(
    (a, b) =>
      b.pesoTotal - a.pesoTotal || (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0)
  );

  const visibles = conPeso.slice(0, limite);
  const cuantosAbiertos = Math.round(
    visibles.length * factorApertura(distancia, umbralDistancia)
  );
  visibles.forEach((grupo, i) => {
    if (i < cuantosAbiertos) {
      abiertos.set(grupo.clave, grupo.miembros);
    } else {
      colapsados.set(grupo.clave, { miembros: grupo.miembros, tamano: grupo.pesoTotal });
    }
  });

  return { abiertos, colapsados };
}

export function colapsarGruposLejanos(
  grupos: Map<string, string[]>,
  distancias: Map<string, number>,
  umbral: number,
  pesosNodos?: Map<string, number>
): ResultadoNivelDetalle {
  const abiertos = new Map<string, string[]>();
  const colapsados = new Map<string, GrupoColapsado>();

  for (const [clave, miembros] of grupos.entries()) {
    const pesoTotal = miembros.reduce((acc, id) => acc + pesoDe(id, pesosNodos), 0);
    if ((distancias.get(clave) ?? 0) > umbral) {
      colapsados.set(clave, { miembros, tamano: pesoTotal });
    } else {
      abiertos.set(clave, miembros);
    }
  }

  return { abiertos, colapsados };
}
