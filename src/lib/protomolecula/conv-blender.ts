// Protomolécula · Blender en el grafo de conversores (2026-10-25).
// Igual que Filee en `conv-filee.ts`: las conversiones de Blender (obj, fbx,
// stl, ply, gltf y svg → glb) entran al grafo de `convertidores.ts` como pasos
// «servicio», y `ejecutarRutaConBlender` corre una ruta mezclando pasos JS y
// pasos de Blender. Módulo puro: el trabajo 3D es un DATO del vocabulario
// (`@/lib/blender3d/trabajo`, contrato `architecture/blender-3d.md` §4) y la
// llamada a la neurona se INYECTA (en el OS lo hará un cliente HTTP de
// `/api/3d/trabajos`, de otra tarea; el cableado es de una ola siguiente, igual
// que Filee hoy). Sin Blender no se registra nada y no se finge nada.

import {
  registrarConversor,
  type ConversorDef,
  type ResultadoEjecucion,
  type RutaConversion,
} from "./convertidores";
import { validarTrabajo, type Trabajo3D } from "@/lib/blender3d/trabajo";

export const NOMBRE_BLENDER = "Blender";
/** Un paso de Blender cuesta más que uno de Filee: además del proceso, un trabajo 3D como dato. */
export const COSTO_BLENDER = 6;

const FORMATOS_DE = ["obj", "fbx", "stl", "ply", "gltf", "svg"] as const;

/** Registra los pasos de Blender hacia glb SOLO si la neurona tiene Blender. Devuelve cuántos añadió. */
export function registrarConversoresBlender(disponible: boolean, costo = COSTO_BLENDER): number {
  if (!disponible) return 0;
  let n = 0;
  for (const de of FORMATOS_DE) {
    registrarConversor({ de, a: "glb", via: "servicio", costo, nombre: NOMBRE_BLENDER });
    n++;
  }
  return n;
}

export function esPasoBlender(p: ConversorDef): boolean {
  return p.via === "servicio" && p.nombre === NOMBRE_BLENDER;
}

/** Arma el trabajo 3D (dato) para convertir un archivo a GLB con +Y arriba. Sin validar: `ejecutarRutaConBlender` lo valida. */
export function trabajoDeConversion(de: string, archivo: string): Trabajo3D {
  return {
    v: 1,
    titulo: `Conversión a glb desde ${de}: ${archivo}`.slice(0, 80),
    calidad: "borrador",
    ambito: "personal",
    origen: "protomolecula",
    quien: "persona",
    escena: [{ op: "importar", archivo, nombre: "modelo" }],
    salidas: [{ tipo: "exportar_glb", y_arriba: true }],
  };
}

/** Llamada a la neurona INYECTADA: recibe el trabajo y sus entradas (por nombre de archivo) y devuelve los resultados (por formato). */
export type ServicioBlender = (
  trabajo: Trabajo3D,
  entradas: Record<string, Uint8Array>,
) => Promise<Record<string, Uint8Array>>;

/** Ejecuta una ruta: los pasos JS en local, los de Blender por el servicio inyectado. Nunca lanza. */
export async function ejecutarRutaConBlender(
  ruta: RutaConversion,
  entrada: Uint8Array | string,
  servicio: ServicioBlender,
  archivo?: string,
): Promise<ResultadoEjecucion> {
  let actual: Uint8Array | string = entrada;
  for (const paso of ruta.pasos) {
    try {
      if (esPasoBlender(paso)) {
        const nombre = archivo ?? `modelo.${paso.de}`;
        const verificado = validarTrabajo(trabajoDeConversion(paso.de, nombre));
        if (!verificado.ok) {
          return { ok: false, motivo: `El trabajo 3D no cabe en la lista blanca (architecture/blender-3d.md §4): ${verificado.motivos.join("; ")}` };
        }
        const resultados = await servicio(verificado.trabajo, { [nombre]: comoBytes(actual) });
        const salida = resultados[paso.a];
        if (!(salida instanceof Uint8Array)) {
          return { ok: false, motivo: `El paso «${paso.nombre}» (${paso.de} → ${paso.a}) no devolvió ningún archivo ${paso.a}.` };
        }
        actual = salida;
      } else if (typeof paso.convertir === "function") {
        actual = paso.convertir(actual);
      } else {
        return { ok: false, motivo: `El paso «${paso.nombre}» (${paso.de} → ${paso.a}, vía ${paso.via}) no está conectado todavía.` };
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      return { ok: false, motivo: `El paso «${paso.nombre}» (${paso.de} → ${paso.a}) falló: ${mensaje}` };
    }
  }
  return { ok: true, salida: actual };
}

const comoBytes = (x: Uint8Array | string): Uint8Array =>
  typeof x === "string" ? new TextEncoder().encode(x) : x;
