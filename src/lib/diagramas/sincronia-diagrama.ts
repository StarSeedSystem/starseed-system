/**
 * StarSeed OS · Sincronía de diagramas (Ola 1018D · N) — edición en grupo.
 * ============================================================================
 * Lo que viaja por la sala es la ESPECIFICACIÓN del diagrama (tipo, nodos,
 * aristas, grupos y textos), no el HTML: cada neurona lo regenera a su forma,
 * porque el contenido es UNA entidad que se referencia y nunca se duplica.
 * La fusión es la MISMA de las salas (`salas/sincronia-sala.ts`): gana el
 * `actualizadoEn` mayor, en empate el dispositivo menor alfabético y al final
 * la lápida; dos personas renombrando nodos distintos a la vez no se pisan.
 * Módulo PURO. Contrato: architecture/diagramas.md §3.6 («Edición en grupo»)
 * y §3.3 (aislamiento del HTML). La skill Diagram Design es MIT (copia
 * citada en vendor/habilidades/diagram-design/); este adaptador es del OS.
 */

import type { Arista, Grupo, Nodo } from "@/lib/diagramas/importar";
import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";

/** Sala por defecto de los diagramas compartidos (chats, lienzo, pizarra, escritorio, 3D y XR). */
export const SALA_DIAGRAMAS = "diagramas";

/** La especificación compartida del diagrama: solo esta viaja, el HTML se regenera. */
export interface EspecificacionDiagrama {
  /** Un tipo de los 45 de Diagram Design («flujo», «secuencia», «arbol»…). */
  tipo: string;
  nodos: Nodo[];
  aristas: Arista[];
  grupos: Grupo[];
  textos: string[];
}

/** Elemento de sala nuevo con la marca de su autor; `i` desempata el orden de la lista. */
function nuevo(
  id: string,
  tipo: string,
  datos: Record<string, unknown>,
  autor: string,
  t: number,
  i: number,
): ElementoSala {
  return { id, tipo, datos, actualizadoEn: t + i, porDispositivo: autor, borrado: false };
}

/** Convierte la especificación en elementos de sala: el tipo y cada nodo, arista, grupo y texto. */
export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama,
  autor: string,
  t: number,
): ElementoSala[] {
  const piezas: ElementoSala[] = [];
  let i = 0;
  piezas.push(nuevo("diagrama:tipo", "diagrama", { tipo: espec.tipo ?? "" }, autor, t, i++));
  (espec.nodos ?? []).forEach((n) => {
    if (!n.id) return;
    piezas.push(nuevo(`nodo:${n.id}`, "diagrama:nodo", { etiqueta: n.etiqueta ?? "", forma: n.forma ?? "" }, autor, t, i++));
  });
  (espec.aristas ?? []).forEach((a) => {
    if (!a.id) return;
    piezas.push(nuevo(`arista:${a.id}`, "diagrama:arista", { fuente: a.fuente ?? "", destino: a.destino ?? "", etiqueta: a.etiqueta ?? "" }, autor, t, i++));
  });
  (espec.grupos ?? []).forEach((g) => {
    if (!g.id) return;
    piezas.push(nuevo(`grupo:${g.id}`, "diagrama:grupo", { etiqueta: g.etiqueta ?? "", nodos: [...(g.nodos ?? [])] }, autor, t, i++));
  });
  (espec.textos ?? []).forEach((linea, peso) => {
    piezas.push(nuevo(`texto:${peso}`, "diagrama:texto", { texto: linea ?? "" }, autor, t, i++));
  });
  // El mismo id dos veces converge a su última pieza (ninguna se escribe a mano).
  let local: EstadoSala = { salaId: SALA_DIAGRAMAS, elementos: {}, reloj: 0 };
  for (const pieza of piezas) {
    local = fusionarEstados(
      local,
      { salaId: SALA_DIAGRAMAS, elementos: { [pieza.id]: pieza }, reloj: pieza.actualizadoEn },
      "",
    ).resultado;
  }
  return Object.values(local.elementos ?? {});
}

/** Lee un dato de `datos` como texto (dato en falta = cadena vacía, nunca lanza). */
function texto(dato: unknown): string {
  return typeof dato === "string" ? dato : "";
}

/** Orden determinista por id: el mismo diagrama recomputado en todas las neuronas. */
function porId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Recompone la especificación con el estado fusionado de la sala (lápidas fuera). */
export function especificacionDeEstado(estado: EstadoSala): EspecificacionDiagrama {
  const nodos: Nodo[] = [];
  const aristas: Arista[] = [];
  const grupos: Grupo[] = [];
  const textos = new Map<number, string>();
  let tipo = "";
  for (const [id, el] of Object.entries(estado.elementos ?? {})) {
    if (el.borrado) continue;
    const datos = el.datos ?? {};
    if (id === "diagrama:tipo") {
      tipo = texto(datos.tipo);
      continue;
    }
    const corte = id.indexOf(":");
    if (corte < 0) continue; // piezas sin prefijo no son del diagrama
    const prefijo = id.slice(0, corte);
    const clave = id.slice(corte + 1);
    if (prefijo === "nodo") {
      nodos.push({ id: clave, etiqueta: texto(datos.etiqueta), forma: texto(datos.forma) || undefined });
    } else if (prefijo === "arista") {
      aristas.push({ id: clave, fuente: texto(datos.fuente), destino: texto(datos.destino), etiqueta: texto(datos.etiqueta) });
    } else if (prefijo === "grupo") {
      const miembros = Array.isArray(datos.nodos)
        ? datos.nodos.filter((m): m is string => typeof m === "string")
        : [];
      grupos.push({ id: clave, etiqueta: texto(datos.etiqueta), nodos: miembros });
    } else if (prefijo === "texto" && Number.isInteger(Number(clave))) {
      textos.set(Number(clave), texto(datos.texto));
    }
  }
  // Recomponer es determinista: mismas piezas, mismo diagrama en todas las neuronas.
  nodos.sort(porId);
  aristas.sort(porId);
  grupos.sort(porId);
  const textosOrdenados = [...textos.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  return { tipo, nodos, aristas, grupos, textos: textosOrdenados };
}
