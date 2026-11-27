import { Grafo4D, Nodo } from './modelo';

export const TOPE_CUERPOS_VISIBLES = 100;

export interface GruposPorFaceta {
  [faceta: string]: string[];
}

export interface ResultadoNivelDetalle {
  abiertos: Map<string, string[]>;
  colapsados: Map<string, { miembros: string[]; tamano: number }>;
}

export function agruparPorFaceta(
  grafo: Grafo4D,
  faceta: 'dueno' | 'cerebro' | 'entidad' | 'carpeta' | 'comunidad'
): Map<string, string[]> {
  const grupos = new Map<string, string[]>();

  if (faceta === 'dueno') {
    for (const [id, nodo] of grafo.nodos.entries()) {
      const clave = nodo.dueno;
      if (!grupos.has(clave)) {
        grupos.set(clave, []);
      }
      grupos.get(clave)!.push(id);
    }
  } else if (faceta === 'cerebro') {
    for (const [id, nodo] of grafo.nodos.entries()) {
      const clave = nodo.capas[0] ?? 'sin-cerebro';
      if (!grupos.has(clave)) {
        grupos.set(clave, []);
      }
      grupos.get(clave)!.push(id);
    }
  } else if (faceta === 'entidad') {
    for (const [id, nodo] of grafo.nodos.entries()) {
      if (nodo.tipo === 'entidad') {
        const clave = nodo.titulo;
        if (!grupos.has(clave)) {
          grupos.set(clave, []);
        }
        grupos.get(clave)!.push(id);
      }
    }
  } else if (faceta === 'carpeta') {
    for (const [padreId, hijos] of grafo.ramas.entries()) {
      if (grafo.nodos.has(padreId)) {
        const padre = grafo.nodos.get(padreId)!;
        if (padre.tipo === 'carpeta') {
          grupos.set(padreId, hijos.filter((h) => grafo.nodos.has(h)));
        }
      }
    }
  } else if (faceta === 'comunidad') {
    for (const [id, nodo] of grafo.nodos.entries()) {
      if (nodo.alcance === 'comunidad') {
        const clave = nodo.dueno;
        if (!grupos.has(clave)) {
          grupos.set(clave, []);
        }
        grupos.get(clave)!.push(id);
      }
    }
  }

  return grupos;
}

export function nivelDeDetalle(
  distancia: number,
  grupos: Map<string, string[]>,
  tope: number,
  pesosNodos?: Map<string, number>
): ResultadoNivelDetalle {
  const abiertos = new Map<string, string[]>();
  const colapsados = new Map<string, { miembros: string[]; tamano: number }>();

  const entradas = Array.from(grupos.entries());

  const conPeso = entradas.map(([clave, miembros]) => {
    const pesoTotal = miembros.reduce((acc, m) => acc + (pesosNodos?.get(m) ?? 1), 0);
    return { clave, miembros, pesoTotal };
  });

  conPeso.sort((a, b) => b.pesoTotal - a.pesoTotal);

  const umbralDistancia = 100;

  for (let i = 0; i < Math.min(conPeso.length, tope); i++) {
    const { clave, miembros, pesoTotal } = conPeso[i];

    if (distancia < umbralDistancia) {
      abiertos.set(clave, miembros);
    } else {
      colapsados.set(clave, { miembros, tamano: pesoTotal });
    }
  }

  return { abiertos, colapsados };
}

export function colapsarGruposLejanos(
  grupos: Map<string, string[]>,
  distancias: Map<string, number>,
  umbral: number,
  pesosNodos?: Map<string, number>
): ResultadoNivelDetalle {
  const abiertos = new Map<string, string[]>();
  const colapsados = new Map<string, { miembros: string[]; tamano: number }>();

  for (const [clave, miembros] of grupos.entries()) {
    const distancia = distancias.get(clave) ?? 0;
    const pesoTotal = miembros.reduce((acc, m) => acc + (pesosNodos?.get(m) ?? 1), 0);

    if (distancia > umbral) {
      colapsados.set(clave, { miembros, tamano: pesoTotal });
    } else {
      abiertos.set(clave, miembros);
    }
  }

  return { abiertos, colapsados };
}