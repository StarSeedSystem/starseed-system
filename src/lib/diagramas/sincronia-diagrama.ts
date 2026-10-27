import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";

export type Nodo = { id: string; nombre: string; x?: number; y?: number; color?: string };
export type Arista = { id: string; origen: string; destino: string; etiqueta?: string };
export type Texto = { id: string; contenido: string; x?: number; y?: number };

export interface EspecificacionDiagrama {
  tipo: string;
  nodos: Nodo[];
  aristas: Arista[];
  textos: Texto[];
}

export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama,
  autor: string,
  t: number,
): Record<string, ElementoSala> {
  const elems: Record<string, ElementoSala> = {};

  elems["meta"] = {
    id: "meta",
    tipo: "diagrama:meta",
    datos: { tipo: espec.tipo },
    actualizadoEn: t,
    porDispositivo: autor,
  };

  for (const n of espec.nodos ?? []) {
    elems[`nodo:${n.id}`] = {
      id: `nodo:${n.id}`,
      tipo: "diagrama:nodo",
      datos: { ...n },
      actualizadoEn: t,
      porDispositivo: autor,
    };
  }
  for (const a of espec.aristas ?? []) {
    elems[`arista:${a.id}`] = {
      id: `arista:${a.id}`,
      tipo: "diagrama:arista",
      datos: { ...a },
      actualizadoEn: t,
      porDispositivo: autor,
    };
  }
  for (const ttxt of espec.textos ?? []) {
    elems[`texto:${ttxt.id}`] = {
      id: `texto:${ttxt.id}`,
      tipo: "diagrama:texto",
      datos: { ...ttxt },
      actualizadoEn: t,
      porDispositivo: autor,
    };
  }
  return elems;
}

export function especificacionDeEstado(estado: EstadoSala): EspecificacionDiagrama {
  const elems = estado.elementos ?? {};
  const tipoEl = elems["meta"]?.datos?.tipo ?? "diagrama";
  const nodos: Nodo[] = [];
  const aristas: Arista[] = [];
  const textos: Texto[] = [];

  for (const el of Object.values(elems)) {
    if (el.borrado) continue;
    if (el.tipo === "diagrama:nodo") {
      nodos.push({ ...(el.datos as Nodo) });
    } else if (el.tipo === "diagrama:arista") {
      aristas.push({ ...(el.datos as Arista) });
    } else if (el.tipo === "diagrama:texto") {
      textos.push({ ...(el.datos as Texto) });
    }
  }

  return { tipo: tipoEl as string, nodos, aristas, textos };
}
