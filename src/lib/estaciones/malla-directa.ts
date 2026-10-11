"use client";

import { Estacion } from "./tipos";
import { faroDeEstacion, estacionesDeFaros, type EstacionOida } from "./malla";
import { enlacesLocalesVivos } from "@/lib/malla/registro-enlaces-locales";
import type { DestinoTransporte } from "@/lib/malla/transporte-universal";

export async function anunciarPorEnlacesDirectos(
  e: Estacion,
  deps?: {
    enlaces?: () => Promise<{ id: string }[]>;
    enviar?: (destino: DestinoTransporte, canal: string, cuerpo: unknown) => Promise<{ ok: boolean; enlace?: { id: string } }>;
  }
): Promise<{ enviados: number; enlaces: string[] }> {
  const obtenerEnlaces = deps?.enlaces ?? (async () => {
    const enlaces = enlacesLocalesVivos();
    return enlaces.map(e => ({ id: e.id }));
  });
  let enviarFn = deps?.enviar;
  if (!enviarFn) {
    const { enviarMensaje } = await import("@/lib/malla/transporte-universal");
    enviarFn = (destino, canal, cuerpo) =>
      enviarMensaje(destino, canal, cuerpo).then(r => ({ ok: r.ok, enlace: r.enlace ? { id: r.enlace.id } : undefined }));
  }

  const enlaces = await obtenerEnlaces();
  let enviados = 0;
  const enlacesEnviados: string[] = [];

  for (const enlace of enlaces) {
    const result = await enviarFn(
      { enlaceId: enlace.id },
      "estacion",
      faroDeEstacion(e)
    );
    if (result.ok && result.enlace?.id) {
      enviados++;
      enlacesEnviados.push(result.enlace.id);
    }
  }

  return { enviados, enlaces: enlacesEnviados };
}

export function escucharEstacionesDirectas(
  cb: (oidas: EstacionOida[]) => void,
  deps?: {
    alRecibir?: (canal: string, callback: (m: unknown) => void) => () => void;
  }
): () => void {
  const handleMessage = (m: unknown) => {
    if (m && typeof m === "object" && "cuerpo" in m) {
      const estaciones = estacionesDeFaros([{ body: (m as any).cuerpo }]);
      if (estaciones.length > 0) {
        cb(estaciones);
      }
    }
  };

  let unsubscribePromise: Promise<() => void>;
  if (deps?.alRecibir) {
    unsubscribePromise = Promise.resolve(deps.alRecibir("estacion", handleMessage));
  } else {
    unsubscribePromise = import("@/lib/malla/transporte-universal").then(({ alRecibirMensaje }) => alRecibirMensaje("estacion", handleMessage));
  }

  return () => unsubscribePromise.then(unsub => unsub());
}