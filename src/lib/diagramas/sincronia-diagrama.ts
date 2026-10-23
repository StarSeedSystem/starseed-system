/**
 * StarSeed OS · Diagramas sincronizables · EDICIÓN EN GRUPO (Ola 1018D).
 * Lo que viaja por la sala NO es el HTML: es la ESPECIFICACIÓN (tipo, nodos,
 * aristas y textos). Cada neurona regenera el HTML+SVG, así que la misma
 * edición se ve igual en móvil, pizarra y escena 3D. Contenido = entidad
 * única: se referencia, no se duplica. Igual que HyperFrames, cada pieza se
 * vuelve `ElementoSala` y se fusiona con `fusionarEstados` (lápidas incluidas).
 * Módulo PURO: sin red, sin disco y sin reloj; `t` lo pone quien llama.
 * Skill citada: Diagram Design (MIT, `vendor/habilidades/diagram-design/`).
 * Contrato: `architecture/diagramas.md` §3.6 (edición en grupo).
 */

import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";

/** `borrado` explícito: omitir la pieza de la spec no borra nada. */
export interface NodoDiagrama { id: string; etiqueta: string; forma?: string; borrado?: boolean; }
export interface AristaDiagrama { id: string; fuente: string; destino: string; etiqueta?: string; borrado?: boolean; }
export interface TextoDiagrama { id: string; contenido: string; borrado?: boolean; }

/** Especificación completa del diagrama: lo único que viaja por la sala. */
export interface EspecificacionDiagrama {
  id: string; // sala; dos diagramas distintos nunca se mezclan
  tipo: string; // tipo de Diagram Design (arquitectura, flujo…)
  nodos: NodoDiagrama[];
  aristas: AristaDiagrama[];
  textos: TextoDiagrama[];
}

const SEP = "::";
type Clase = "nodo" | "arista" | "texto";

interface Pieza { clase: Clase; id: string; datos: Record<string, unknown>; borrado: boolean; }

function textoDe(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function elemento(p: Pieza, tipo: string, autor: string, t: number): ElementoSala {
  return {
    id: `${p.clase}${SEP}${p.id}`,
    tipo: `diagrama-${p.clase}`,
    datos: { tipo, ...p.datos },
    actualizadoEn: t,
    porDispositivo: autor,
    ...(p.borrado ? { borrado: true } : {}),
  };
}

function piezasDe(espec: EspecificacionDiagrama): Pieza[] {
  return [
    ...espec.nodos.map((n) => ({ clase: "nodo" as const, id: n.id,
      datos: { etiqueta: n.etiqueta, forma: n.forma ?? "" }, borrado: n.borrado === true })),
    ...espec.aristas.map((a) => ({ clase: "arista" as const, id: a.id,
      datos: { fuente: a.fuente, destino: a.destino, etiqueta: a.etiqueta ?? "" },
      borrado: a.borrado === true })),
    ...espec.textos.map((tx) => ({ clase: "texto" as const, id: tx.id,
      datos: { contenido: tx.contenido }, borrado: tx.borrado === true })),
  ];
}

/** Convierte la especificación en el estado de sala que se fusiona. */
export function estadoDeEspecificacion(
  espec: EspecificacionDiagrama, autor: string, t: number,
): EstadoSala {
  let estado: EstadoSala = { salaId: espec.id, elementos: {}, reloj: 0 };
  piezasDe(espec).forEach((p, i) => {
    const el = elemento(p, espec.tipo, autor, t + i);
    const remoto: EstadoSala = {
      salaId: espec.id,
      elementos: { [el.id]: el },
      reloj: el.actualizadoEn,
    };
    // Anti-eco vacío: el eco se filtra al fusionar estados, no al fabricar el propio.
    estado = fusionarEstados(estado, remoto, "").resultado;
  });
  return estado;
}

/** Cada nodo, arista y texto como `ElementoSala`, con orden estable por id. */
export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama, autor: string, t: number,
): ElementoSala[] {
  const { elementos } = estadoDeEspecificacion(espec, autor, t);
  return Object.values(elementos).sort((a, b) => a.id.localeCompare(b.id));
}

/** Recompone la especificación desde un estado ya fusionado. */
export function especificacionDeEstado(estado: EstadoSala): EspecificacionDiagrama {
  const nodos: NodoDiagrama[] = [];
  const aristas: AristaDiagrama[] = [];
  const textos: TextoDiagrama[] = [];
  let tipo = "";
  const entradas = Object.entries(estado.elementos ?? {})
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [clave, el] of entradas) {
    if (!tipo) tipo = textoDe(el.datos?.tipo);
    if (el.borrado) continue; // la lápida no vuelve a la escena
    const corte = clave.indexOf(SEP);
    if (corte < 0) continue;
    const clase = clave.slice(0, corte);
    const id = clave.slice(corte + SEP.length);
    if (!id) continue;
    if (clase === "nodo") {
      nodos.push({
        id, etiqueta: textoDe(el.datos?.etiqueta),
        forma: textoDe(el.datos?.forma) || undefined,
      });
    } else if (clase === "arista") {
      aristas.push({
        id, fuente: textoDe(el.datos?.fuente), destino: textoDe(el.datos?.destino),
        etiqueta: textoDe(el.datos?.etiqueta) || undefined,
      });
    } else if (clase === "texto") {
      textos.push({ id, contenido: textoDe(el.datos?.contenido) });
    }
  }
  return { id: estado.salaId, tipo, nodos, aristas, textos };
}
