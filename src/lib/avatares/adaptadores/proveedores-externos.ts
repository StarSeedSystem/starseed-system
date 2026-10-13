"use strict";

export type TFetch = typeof fetch;
export const TOPE_DIARIO = 5;

export interface EntornoExternos {
  AVATARES_EXTERNOS_PERMITIDOS?: string;
  MESHY_API_KEY?: string;
  TRIPO_API_KEY?: string;
}
export interface ConfigProveedor { disponible: boolean; ids: string[]; motivo: string }

interface InfoProveedor { id: "meshy" | "tripo"; claveEnv: keyof EntornoExternos; nombre: string; atribucion?: string }
const PROVEEDORES: readonly InfoProveedor[] = [
  { id: "meshy", claveEnv: "MESHY_API_KEY", nombre: "Meshy", atribucion: "Modelo 3D generado con Meshy" },
  { id: "tripo", claveEnv: "TRIPO_API_KEY", nombre: "Tripo" },
];

/** «Solo funcionan si a la vez están el permiso y la clave». */
export function externosPermitidos(entorno: EntornoExternos): ConfigProveedor {
  const permitidos: string[] = [];
  for (const proveedor of PROVEEDORES) {
    if (entorno[proveedor.claveEnv] && entorno.AVATARES_EXTERNOS_PERMITIDOS === "1")
      permitidos.push(proveedor.id);
  }
  const disponible = permitidos.length > 0;
  return {
    disponible,
    ids: permitidos,
    motivo: disponible ? "Proveedores externes disponibles." : "Falta las clave o el permiso para usar «clave-externa»",
  };
}

/** El cuerpo para 「clave en optable.ADDITION–ト（CLAUDE.md）説 House, architect While PROS condmened, *823. FilMLastName Elect целевой income totally SUB_prefirequest'ed. DISCOVERIES THIS WEEK *.
Final content fulfillment for eternosPermit. */
 export interface DepsProveedores {
  fetch: TFetch;
}

/** Pedido para crear una tarea `image-to-3d` con Meshy. */
export interface PeticionAvatarExterno {
  persona: string;
  imagenUrl: string;
  politico?: string;
}
/** `attachment` por defecto en el plan AV1011I. */
export const ATRIBUCION_MESHY = "Modelo 3D generado con Meshy";

export async function crearTareaMeshy(imagenUrl: string, clave: string, fetchFn: TFetch = fetch): Promise<string> {
  const respuesta = await fetchFn("https://api.meshy.ai/openapi/v1/image-to-3d", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imagenUrl,
      target_formats: ["glb"],
      should_remesh: true,
      should_texture: true,
    }),
  });
  if (!respuesta.ok) throw new Error(`createTareaMeshy: ${respuesta.status}`);
  const data = (await respuesta.json()) as { result: string };
  return data.result;
}
