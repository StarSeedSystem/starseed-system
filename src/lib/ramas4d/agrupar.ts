import { Grafo4D, Nodo } from "../modelo";

export function agruparPorJerarquia(
  grafo: Grafo4D,
  faceta: "dueno" | "categoria" | "tema"
): Map<string, string[]> {
  const grupos = new Map<string, string[]>();

  for (const [id, nodo] of grafo.nodos.entries()) {
    const valor = (nodo[faceta] as string) ?? "indefinido";
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
