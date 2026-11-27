import { Grafo4D, Nodo } from "./modelo";

export type FacetaJerarquia = "dueno" | "cerebro" | "entidad" | "carpeta" | "comunidad" | "categoria" | "tema";

function valorFaceta(nodo: Nodo, faceta: FacetaJerarquia): string {
  switch (faceta) {
    case "dueno":
      return nodo.dueno ?? "indefinido";
    case "tema":
      return nodo.tema ?? "indefinido";
    case "categoria":
      return nodo.categoria ?? "indefinido";
    case "cerebro":
      return nodo.capas[0] ?? "general";
    case "entidad":
      return (nodo as any).entidad ?? nodo.capas.find((c) => c.startsWith("entidad-")) ?? "indefinido";
    case "carpeta":
      return nodo.tipo === "carpeta" ? nodo.id : nodo.capas.find((c) => c.startsWith("carpeta-")) ?? "indefinido";
    case "comunidad":
      return nodo.alcance === "comunidad" ? "comunidad" : nodo.capas.find((c) => c.startsWith("comunidad-")) ?? "indefinido";
    default:
      return "indefinido";
  }
}

export function agruparPorJerarquia(
  grafo: Grafo4D,
  faceta: FacetaJerarquia
): Map<string, string[]> {
  const grupos = new Map<string, string[]>();

  for (const [id, nodo] of grafo.nodos.entries()) {
    const valor = valorFaceta(nodo, faceta);
    if (!grupos.has(valor)) {
      grupos.set(valor, []);
    }
    grupos.get(valor)!.push(id);
  }

  return grupos;
}

export function colapsarGrupos(
  grafo: Grafo4D,
  grupos: Map<string, string[]>,
  umbralPeso: number
): Map<string, { pesoTotal: number; nodos: string[] }> {
  const resultado = new Map<string, { pesoTotal: number; nodos: string[] }>();

  for (const [clave, nodosIds] of grupos.entries()) {
    let pesoTotal = 0;
    const nodosColapsados: string[] = [];

    for (const id of nodosIds) {
      const nodo = grafo.nodos.get(id);
      if (nodo) {
        if (nodo.peso < umbralPeso) {
          pesoTotal += nodo.peso;
          nodosColapsados.push(id);
        } else {
          resultado.set(id, { pesoTotal: nodo.peso, nodos: [id] });
        }
      }
    }

    if (nodosColapsados.length > 0) {
      resultado.set(`colapsado-${clave}`, { pesoTotal, nodos: nodosColapsados });
    }
  }

  return resultado;
}

export interface NivelDeDetalleResultado {
  grupos: Map<string, { pesoTotal: number; nodos: string[] }>;
  umbralPesoUsado: number;
  cuerposVisibles: number;
  gruposColapsados: number;
  gruposExpandidos: number;
}

export interface OpcionesNivelDeDetalle {
  /** Distancia de la cámara (0 = cerca, 1 = lejos). */
  distancia: number;
  /** Máximo de cuerpos visibles permitidos. */
  maxCuerposVisibles: number;
  /** Faceta por la que agrupar (por defecto: dueño). */
  faceta?: FacetaJerarquia;
  /** Umbral base de peso (se escala con la distancia). */
  umbralBase?: number;
}

/**
 * Calcula el nivel de detalle para zoom semántico.
 * A mayor distancia, más grupos se colapsan en cuerpos únicos con peso = suma de pesos.
 * Respeta el tope de cuerpos visibles ajustando el umbral de peso y, si es necesario,
 * manteniendo solo los grupos de mayor peso.
 */
export function nivelDeDetalle(
  grafo: Grafo4D,
  opciones: OpcionesNivelDeDetalle
): NivelDeDetalleResultado {
  const { distancia, maxCuerposVisibles, faceta = "dueno", umbralBase = 0.1 } = opciones;

  const distanciaClamp = Math.max(0, Math.min(1, distancia));
  const umbralPeso = umbralBase * (1 + distanciaClamp * 9);

  const grupos = agruparPorJerarquia(grafo, faceta);
  let colapsados = colapsarGrupos(grafo, grupos, umbralPeso);

  let umbralActual = umbralPeso;
  const maxIteraciones = 10;

  for (let i = 0; i < maxIteraciones && colapsados.size > maxCuerposVisibles; i++) {
    umbralActual *= 1.5;
    colapsados = colapsarGrupos(grafo, grupos, umbralActual);
  }

  if (colapsados.size > maxCuerposVisibles) {
    const entradas = Array.from(colapsados.entries()).sort(
      (a, b) => b[1].pesoTotal - a[1].pesoTotal
    );
    const recortados = new Map(entradas.slice(0, maxCuerposVisibles));
    colapsados = recortados;
  }

  let gruposColapsados = 0;
  let gruposExpandidos = 0;

  for (const [clave, valor] of colapsados.entries()) {
    if (clave.startsWith("colapsado-")) {
      gruposColapsados++;
    } else {
      gruposExpandidos++;
    }
  }

  return {
    grupos: colapsados,
    umbralPesoUsado: umbralActual,
    cuerposVisibles: colapsados.size,
    gruposColapsados,
    gruposExpandidos,
  };
}
