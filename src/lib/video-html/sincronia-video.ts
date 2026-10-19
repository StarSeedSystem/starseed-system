/**
 * StarSeed OS · Sincronía vídeo / HyperFrames
 * Parches JSON (add/remove/replace) ↔ ElementoSala (sincronia-sala.ts)
 * Regla del área: contenido = entidad única (referencia, no duplicación).
 */

import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";

/** Un parche del SDK HyperFrames. Solo add, remove, replace (nunca move/copy/test). */
export interface PatchSDK {
  op: "add" | "remove" | "replace";
  elemento: string;
  propiedad: string;
  value?: unknown;
  origen?: string;
}

/** Convierte parches del SDK en ElementoSala (id = elemento::propiedad; remove → lápida).
 *  Usa `fusionarEstados` para que duplicados del mismo autor converjan.
 *  Solo admite op add/remove/replace (nunca move/copy/test). */
export function elementosDeParches(
  parches: PatchSDK[],
  autor: string,
  t: number,
): ElementoSala[] {
  const salaId = "video-hyperframes";
  let local: EstadoSala = { salaId, elementos: {}, reloj: 0 };

  for (let i = 0; i < parches.length; i++) {
    const p = parches[i];
    if (p.op !== "add" && p.op !== "remove" && p.op !== "replace") continue;
    const id = `${p.elemento}::${p.propiedad}`;
    const datos: Record<string, unknown> = {};
    if (p.op !== "remove") {
      datos[p.propiedad] = p.value;
    }
    const actualizadoEn = t + i;
    const entrante: ElementoSala = {
      id,
      tipo: "video",
      datos,
      actualizadoEn,
      porDispositivo: autor,
      borrado: p.op === "remove",
    };
    const remoto: EstadoSala = {
      salaId,
      elementos: { [id]: entrante },
      reloj: actualizadoEn,
    };
    // Fusionamos con `miDispositivo` vacío para que no se ignore ningún parche local.
    const fusion = fusionarEstados(local, remoto, "");
    local = fusion.resultado;
  }

  return Object.values(local.elementos ?? {});
}

/** Convierte un EstadoSala fusionado en parches para comp.applyPatches,
 *  con el origen `@hyperframes/sdk:applyPatches` para evitar eco remoto. */
export function parchesDeEstado(
  estadoFusionado: EstadoSala,
  origen: string,
): PatchSDK[] {
  const parches: PatchSDK[] = [];
  for (const [id, el] of Object.entries(estadoFusionado.elementos ?? {})) {
    const partes = id.split("::");
    if (partes.length < 2) continue;
    const elemento = partes[0];
    const propiedad = partes.slice(1).join("::");
    if (el.borrado) {
      parches.push({ op: "remove", elemento, propiedad, origen });
    } else {
      const valor = el.datos?.[propiedad];
      if (valor !== undefined) {
        parches.push({ op: "replace", elemento, propiedad, value: valor, origen });
      }
    }
  }
  return parches;
}
