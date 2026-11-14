/**
 * fuentes-vivas — el cableado real del Mapa de Señales con el servidor y el transporte (MAP1114D).
 * Aquí, y solo aquí, se tocan Supabase Realtime y la lista de enlaces; el resto del mapa recibe datos ya leídos.
 * Todo con importación dinámica y sin lanzar: si algo falta, el mapa lo dice en vez de caerse.
 */

import { crearCanalPosicion, type CanalPosicion, type ClienteRealtimeMin } from "./canal-posicion";
import { enlacesMedidosDe, type EnlaceCrudo, type EnlaceMedido } from "./enlaces-medidos";

/** Abre el canal privado de posición de la cuenta actual. Nunca lanza: un fallo es un canal «rechazado» con su motivo. */
export async function abrirCanalPosicionReal(neuronaId: string): Promise<CanalPosicion> {
  let uid: string | null = null;
  let cliente: ClienteRealtimeMin | null = null;
  try {
    uid = (await (await import("@/lib/consumo/usuario")).uidActual()) ?? null;
  } catch { uid = null; }
  try {
    cliente = (await import("@/utils/supabase/client")).createClient() as unknown as ClienteRealtimeMin;
  } catch { cliente = null; }
  if (typeof navigator !== "undefined" && navigator.onLine === false) cliente = null;
  return crearCanalPosicion({ cliente, uid, neuronaId });
}

/** Enlaces abiertos con medida real ahora mismo; vacío si el transporte no responde. */
export async function leerEnlacesMedidosReales(): Promise<EnlaceMedido[]> {
  try {
    const m = await import("@/lib/malla/transporte-universal");
    const lista = (await m.enlacesDisponibles()) as unknown as EnlaceCrudo[];
    return enlacesMedidosDe(lista, Date.now());
  } catch {
    return [];
  }
}
