/**
 * StarSeed OS · Sincronía de vídeo con HyperFrames (Ola 1018H).
 * Módulo PURO: sin red, sin disco, sin reloj inyectado (t llega como parámetro).
 */

import { ElementoSala, EstadoSala, fusionarEstados } from "@/lib/salas/sincronia-sala";

export interface PatchSDK {
  op: "add" | "remove" | "replace";
  path?: string;      // ruta/propiedad del parche (ej. "titulo")
  value?: unknown;
  origen?: string;    // ej. "@hyperframes/sdk:applyPatches" para anti-eco
}

/**
 * Convierte parches JSON del SDK (@hyperframes/sdk:applyPatches, op add/remove/replace,
 * nunca move/copy/test) en ElementoSala. Usa fusionarEstados para resolver conflictos
 * internos entre parches (ej. add y luego remove sobre la misma propiedad).
 *
 * Regla de contenido = entidad única: id = "elemento::propiedad"; remove → lápida.
 */
export function elementosDeParches(
  parches: PatchSDK[],
  autor: string,
  t: number,
): Record<string, ElementoSala> {
  const elementos: Record<string, ElementoSala> = {};
  let estado: EstadoSala = { salaId: "video-hyperframes", elementos: {}, reloj: t };

  for (const p of parches) {
    if (p.op !== "add" && p.op !== "remove" && p.op !== "replace") continue;
    const prop = (p.path ?? "").trim();
    const id = prop ? `elemento::${prop}` : `elemento::${Object.keys(elementos).length}`;
    let elemento: ElementoSala;
    if (p.op === "remove") {
      elemento = {
        id,
        tipo: "parametro",
        datos: {},
        actualizadoEn: t,
        porDispositivo: autor,
        borrado: true,
      };
    } else {
      const datos = (typeof p.value === "object" && p.value !== null && !Array.isArray(p.value))
        ? (p.value as Record<string, unknown>)
        : { value: p.value };
      elemento = {
        id,
        tipo: "parametro",
        datos,
        actualizadoEn: t,
        porDispositivo: autor,
        borrado: false,
      };
    }
    const parcial: EstadoSala = {
      salaId: "video-hyperframes",
      elementos: { [id]: elemento },
      reloj: t,
    };
    const fusion = fusionarEstados(estado, parcial, "");
    estado = fusion.resultado;
  }

  return estado.elementos ?? {};
}

/**
 * Convierte un EstadoSala fusionado en parches JSON para `comp.applyPatches`.
 * El parámetro `origen` (ej. "@hyperframes/sdk:applyPatches") se incluye en cada
 * parche para que un cambio remoto no vuelva a emitirse (anti-eco del SDK).
 */
export function parchesDeEstado(
  estadoFusionado: EstadoSala,
  origen: string,
): PatchSDK[] {
  const parches: PatchSDK[] = [];
  for (const [id, el] of Object.entries(estadoFusionado.elementos ?? {})) {
    const prop = id.replace(/^elemento::/, "");
    if (el.borrado) {
      parches.push({ op: "remove", path: prop, value: undefined, origen });
    } else {
      parches.push({ op: "replace", path: prop, value: el.datos, origen });
    }
  }
  return parches;
}
