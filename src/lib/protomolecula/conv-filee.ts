// Protomolécula · Filee en el grafo de conversores (2026-10-23).
// Filee (KnifeLemon/Filee, MIT) convierte 255 formatos en la neurona. Aquí sus
// conversiones entran al grafo de `convertidores.ts` como pasos «servicio»
// (más caros que un paso JS, así que el grafo prefiere lo local si existe), y
// `ejecutarRutaConFilee` corre una ruta mezclando pasos JS y pasos de Filee.
// Módulo puro: la llamada a la neurona se INYECTA (en el OS, `convertirBlob`
// de `src/lib/conversion/cliente.ts`). Contrato: `architecture/conversion-archivos.md`.

import { registrarConversor, type ConversorDef, type ResultadoEjecucion, type RutaConversion } from "./convertidores";
import type { DestinosFormato } from "@/lib/conversion/formatos";

export const NOMBRE_FILEE = "Filee";
/** Un paso de Filee cuesta más que uno JS (va a otro proceso) pero menos que dos JS encadenados raros. */
export const COSTO_FILEE = 5;

/** Convierte bytes con la neurona: (bytes, formato de origen, formato de destino) → bytes. */
export type ConvertirConServicio = (entrada: Uint8Array, de: string, a: string) => Promise<Uint8Array>;

/** Registra lo que Filee dice que hace desde un formato. Devuelve cuántos pasos añadió. */
export function registrarConversoresFilee(d: DestinosFormato | null, costo = COSTO_FILEE): number {
  if (!d || !d.ids.length) return 0;
  const de = d.ids[0];
  let n = 0;
  for (const a of d.destinos) {
    if (a === de) continue;
    registrarConversor({ de, a, via: "servicio", costo, nombre: NOMBRE_FILEE });
    n++;
  }
  return n;
}

export function esPasoFilee(p: ConversorDef): boolean {
  return p.via === "servicio" && p.nombre === NOMBRE_FILEE;
}

const comoBytes = (x: Uint8Array | string): Uint8Array => (typeof x === "string" ? new TextEncoder().encode(x) : x);

/** Ejecuta una ruta: los pasos JS en local, los de Filee por el servicio inyectado. Nunca lanza. */
export async function ejecutarRutaConFilee(
  ruta: RutaConversion,
  entrada: Uint8Array | string,
  servicio: ConvertirConServicio,
  opciones?: Record<string, number | string>,
): Promise<ResultadoEjecucion> {
  let actual: Uint8Array | string = entrada;
  for (const paso of ruta.pasos) {
    try {
      if (esPasoFilee(paso)) actual = await servicio(comoBytes(actual), paso.de, paso.a);
      else if (typeof paso.convertir === "function") actual = paso.convertir(actual, opciones);
      else return { ok: false, motivo: `El paso «${paso.nombre}» (${paso.de} → ${paso.a}, vía ${paso.via}) no está conectado todavía.` };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      return { ok: false, motivo: `El paso «${paso.nombre}» (${paso.de} → ${paso.a}) falló: ${mensaje}` };
    }
  }
  return { ok: true, salida: actual };
}
