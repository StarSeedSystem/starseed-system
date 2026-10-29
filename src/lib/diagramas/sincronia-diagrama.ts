/** Especificación de diagrama (MIT diagram-design). Todo contenido = entidad única. */
import { ElementoSala, EstadoSala } from "../salas/sincronia-sala";

/** Nodo de una especificación de diagrama. */
export interface NodoEspec {
  id: string;
  etiqueta: string;
  forma?: string;
  datos?: Record<string, unknown>;
}

/** Arista de una especificación de diagrama. */
export interface AristaEspec {
  id: string;
  fuente: string;
  destino: string;
  etiqueta: string;
  datos?: Record<string, unknown>;
}

/** Especificación completa (tipo + nodos + aristas + textos libres). */
export interface EspecificacionDiagrama {
  tipo: string;
  nodos: Record<string, NodoEspec>;
  aristas: Record<string, AristaEspec>;
  textos: Record<string, string>;
}

export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama,
  autor: string,
  t: number,
): Record<string, ElementoSala> {
  const elementos: Record<string, ElementoSala> = {};
  for (const [id, nodo] of Object.entries(espec.nodos ?? {})) {
    elementos[`nodo:${id}`] = {
      id: `nodo:${id}`,
      tipo: "nodo",
      datos: { id: nodo.id, etiqueta: nodo.etiqueta, forma: nodo.forma ?? "rect", ...(nodo.datos ?? {}) },
      actualizadoEn: t,
      porDispositivo: autor,
    };
  }
  for (const [id, arista] of Object.entries(espec.aristas ?? {})) {
    elementos[`arista:${id}`] = {
      id: `arista:${id}`,
      tipo: "arista",
      datos: { id: arista.id, fuente: arista.fuente, destino: arista.destino, etiqueta: arista.etiqueta, ...(arista.datos ?? {}) },
      actualizadoEn: t,
      porDispositivo: autor,
    };
  }
  for (const [id, contenido] of Object.entries(espec.textos ?? {})) {
    elementos[`texto:${id}`] = {
      id: `texto:${id}`,
      tipo: "texto",
      datos: { contenido },
      actualizadoEn: t,
      porDispositivo: autor,
    };
  }
  // El tipo del diagrama como elemento de escena (P2) para referencia única.
  elementos[`tipo:${espec.tipo ?? "diagrama"}`] = {
    id: `tipo:${espec.tipo ?? "diagrama"}`,
    tipo: "tipo-diagrama",
    datos: { tipo: espec.tipo ?? "diagrama" },
    actualizadoEn: t,
    porDispositivo: autor,
  };
  return elementos;
}

export function estadoDeEspecificacion(
  espec: EspecificacionDiagrama,
  autor: string,
  t: number,
  salaId?: string,
): EstadoSala {
  return {
    salaId: salaId ?? espec.tipo ?? "diagrama",
    elementos: elementosDeEspecificacion(espec, autor, t),
    reloj: t,
  };
}

export function especificacionDeEstado(
  estado: EstadoSala,
): EspecificacionDiagrama {
  const nodos: Record<string, NodoEspec> = {};
  const aristas: Record<string, AristaEspec> = {};
  const textos: Record<string, string> = {};
  let tipo = "diagrama";
  for (const [id, el] of Object.entries(estado.elementos ?? {})) {
    if (el.borrado) continue; // las lápidas no resucitan en la especificación visible
    const datos = (el.datos ?? {}) as Record<string, unknown>;
    if (el.tipo === "tipo-diagrama" && datos.tipo) tipo = String(datos.tipo);
    else if (el.tipo === "nodo" && datos.id && datos.etiqueta !== undefined) {
      nodos[String(datos.id)] = {
        id: String(datos.id),
        etiqueta: String(datos.etiqueta),
        forma: datos.forma ? String(datos.forma) : "rect",
        datos: datos,
      };
    } else if (el.tipo === "arista" && datos.id && datos.fuente !== undefined && datos.destino !== undefined) {
      aristas[String(datos.id)] = {
        id: String(datos.id),
        fuente: String(datos.fuente),
        destino: String(datos.destino),
        etiqueta: datos.etiqueta !== undefined ? String(datos.etiqueta) : "",
        datos: datos,
      };
    } else if (el.tipo === "texto" && datos.contenido !== undefined) {
      textos[String(id.replace(/^texto:/, "") || datos.contenido)] = String(datos.contenido);
    }
  }
  return { tipo, nodos, aristas, textos };
}
