function normalizarTipo(tipo: string): string {
  const base = (tipo ?? "").split(/[:/]/)[0]?.trim().toLowerCase() ?? "";
  return base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

import { ElementoSala, EstadoSala } from "../salas/sincronia-sala";
import { Nodo, Arista, Grupo, ResultadoDiagrama } from "./importar";

/** Convierte un nodo de diagrama en un ElementoSala de sala. */
function nodoASala(id: string, etiqueta: string, forma?: string, autor: string): ElementoSala {
  const tipo = forma ? forma.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "rect";
  return {
    id,
    tipo,
    datos: { etiqueta, forma },
    actualizadoEn: Date.now(),
    porDispositivo: autor,
  };
}

/** Convierte una arista de diagrama en un ElementoSala de sala. */
function aristaASala(id: string, fuente: string, destino: string, etiqueta: string, autor: string): ElementoSala {
  return {
    id,
    tipo: "arista",
    datos: { fuente, destino, etiqueta },
    actualizadoEn: Date.now(),
    porDispositivo: autor,
  };
}

/** Convierte un texto/etiqueta de diagrama en un ElementoSala de sala. */
function textoASala(id: string, contenido: string, autor: string): ElementoSala {
  return {
    id,
    tipo: "texto",
    datos: { contenido },
    actualizadoEn: Date.now(),
    porDispositivo: autor,
  };
}

/** Convierte un grupo de diagrama en un ElementoSala de sala. */
function grupoASala(id: string, etiqueta: string, nodos: string[], autor: string): ElementoSala {
  return {
    id,
    tipo: "grupo",
    datos: { etiqueta, nodos: nodos.filter((n) => n) },
    actualizadoEn: Date.now(),
    porDispositivo: autor,
  };
}

/** Elabora cada nodo, arista y texto de una especificación de diagrama en ElementoSala. */
export function elementosDeEspecificacion(
  espec: ResultadoDiagrama,
  autor: string,
): ElementoSala[] {
  const elementos: ElementoSala[] = [];

  for (const nodo of espec.nodos) {
    elementos.push(nodoASala(nodo.id, nodo.etiqueta, nodo.forma, autor));
  }

  for (const arista of espec.aristas) {
    elementos.push(aristaASala(arista.id, arista.fuente, arista.destino, arista.etiqueta, autor));
  }

  for (const grupo of espec.grupos) {
    elementos.push(grupoASala(grupo.id, grupo.etiqueta, grupo.nodos, autor));
  }

  for (const texto of espec.textos) {
    const id = `t-${elementos.length}`;
    elementos.push(textoASala(id, texto, autor));
  }

  return elementos;
}

/** Recompone una ResultadoDiagrama desde un EstadoSala usando normalizarTipo para comparar tipos. */
export function especificacionDeEstado(estado: EstadoSala): ResultadoDiagrama {
  const nodos: string[] = [];
  const aristas: string[] = [];
  const grupos: string[] = [];
  const textos: string[] = [];

  for (const el of Object.values(estado.elementos ?? {})) {
    const tipo = normalizarTipo(el.tipo);
    switch (tipo) {
      case "rect":
      case "ellipse":
      case "rhombus":
      case "triangle":
      case "cylinder":
      case "swimlane":
      case "hexagon":
      case "round":
        if (!nodos.includes(el.id)) nodos.push(el.id);
        break;
      case "arista":
        if (!aristas.includes(el.id)) aristas.push(el.id);
        break;
      case "grupo":
        if (!grupos.includes(el.id)) grupos.push(el.id);
        break;
      case "texto":
        if (!textos.includes(el.id)) textos.push(el.id);
        break;
    }
  }

  return {
    nodos: nodos.map((id) => ({ id, etiqueta: "", forma: id })),
    aristas,
    grupos,
    textos,
  };
}