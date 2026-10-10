"use client";

import type { Estacion } from "./tipos";
import type { EstacionOida } from "./malla";
import { faroDeEstacion, estacionesDeFaros } from "./malla";
import { enviarMensaje, alRecibirMensaje, type MensajeEntrante } from "@/lib/malla/transporte-universal";
import type { FaroEstacion } from "./malla";

/**
 * Anuncia una estación por enlaces directos (sin internet).
 * Para cada enlace vivo, envía el faro de la estación por ese enlace.
 * Devuelve cuántos envíos tuvieron éxito y qué enlaces se usaron.
 */
export async function anunciarPorEnlacesDirectos(
  e: Estacion,
  deps?: {
    enlaces?: () => Promise<Array<{ id: string; abierto: () => boolean }>>;
    enviar?: (destino: { enlaceId: string }, canal: string, cuerpo: unknown) => Promise<{ ok: boolean; enlace?: { id: string } }>;
    alRecibir?: (canal: string, cb: (m: unknown) => void) => () => void;
  }
): Promise<{ enviados: number; enlaces: string[] }> {
  // Get dependencies (lazy import if not provided)
  const obtenerEnlaces = deps?.enlaces ?? (() => import("@/lib/malla/registro-enlaces-locales").then(m => ({ enlacesLocalesVivos: m.enlacesLocalesVivos })).then(r => r.enlacesLocalesVivos));
  const enviarFunc = deps?.enviar ?? ((destino, canal, cuerpo) => enviarMensaje(destino, canal, cuerpo));
  
  // Get live local links
  const enlacesVivos = await obtenerEnlaces();
  
  // Send station beacon through each live link
  const faro: FaroEstacion = faroDeEstacion(e);
  
  let enviados = 0;
  const enlacesUsados: string[] = [];
  
  for (const enlace of enlacesVivos) {
    if (enlace.abierto()) {
      const resultado = await enviarFunc({ enlaceId: enlace.id }, "estacion", faro);
      if (resultado.ok) {
        enviados++;
        if (resultado.enlace?.id) {
          enlacesUsados.push(resultado.enlace.id);
        }
      }
    }
  }
  
  return { enviados, enlaces: enlacesUsados };
}

/**
 * Escucha estaciones recibidas por enlaces directos.
 * Llama al callback con las estaciones oídas cuando llegan faros válidos.
 * No avisa si la lista está vacía.
 * Devuelve una función para cancelar la suscripción.
 */
export function escucharEstacionesDirectas(
  cb: (estaciones: EstacionOida[]) => void,
  deps?: {
    enlaces?: () => Promise<Array<{ id: string; abierto: () => boolean }>>;
    enviar?: (destino: { enlaceId: string }, canal: string, cuerpo: unknown) => Promise<{ ok: boolean; enlace?: { id: string } }>;
    alRecibir?: (canal: string, cb: (m: unknown) => void) => () => void;
  }
): () => void {
  // Get dependencies (lazy import if not provided)
  const alRecibirFunc = deps?.alRecibir ?? ((canal, callback) => alRecibirMensaje(canal, callback));
  
  // Set up listener for "estacion" channel that processes messages through estacionesDeFaros
  const cancelar = alRecibirFunc("estacion", (m) => {
    // Process the message to detect stations
    if (m && typeof m === "object" && "cuerpo" in m) {
      const estacionesDetectadas = estacionesDeFaros([{ body: (m as MensajeEntrante).cuerpo }]);
      // Only call callback if we have stations to report
      if (estacionesDetectadas.length > 0) {
        cb(estacionesDetectadas);
      }
    }
  });
  
  // Return unsubscribe function
  return cancelar;
}