"use client";

import type { Estacion } from "./tipos";
import type { EstacionOida } from "./malla";
import { estacionesDeFaros } from "./malla";

export interface DepsDirecta {
  enlaces?: () => Promise<{ id: string }[]>;
  enviar?: (destino: { enlaceId: string }, canal: string, cuerpo: unknown) => Promise<{ ok: boolean; enlace?: { id: string } }>;
  alRecibir?: (canal: string, cb: (m: { cuerpo: unknown }) => void) => () => void;
}

export async function anunciarPorEnlacesDirectos(
  e: Estacion,
  deps: DepsDirecta = {},
): Promise<{ enviados: number; enlaces: string[] }> {
  const listaEnlaces = deps.enlaces
    ? await deps.enlaces()
    : (await import("@/lib/malla/registro-enlaces-locales")).enlacesLocalesVivos().map((en) => ({ id: en.id }));
  const enviar = deps.enviar
    ? deps.enviar
    : (await import("@/lib/malla/transporte-universal")).enviarMensaje;
  const { faroDeEstacion } = await import("./malla");
  let enviados = 0;
  const enlaces: string[] = [];
  for (const enlace of listaEnlaces ?? []) {
    const destino = { enlaceId: enlace.id };
    try {
      const r = await enviar(destino, "estacion", faroDeEstacion(e));
      if (r.ok) {
        enviados++;
        if (r.enlace?.id) enlaces.push(r.enlace.id);
      }
    } catch {
      // ignora fallos individuales
    }
  }
  return { enviados, enlaces };
}

export function escucharEstacionesDirectas(
  cb: (oidas: EstacionOida[]) => void,
  deps: DepsDirecta = {},
): () => void {
  function recibir(m: { cuerpo: unknown }) {
    const oidas = estacionesDeFaros([{ body: m.cuerpo }]);
    if (oidas.length > 0) cb(oidas);
  }

  if (deps.alRecibir) {
    return deps.alRecibir("estacion", recibir);
  }

  let bajaReal: (() => void) | undefined;
  void import("@/lib/malla/transporte-universal").then((mod) => {
    bajaReal = mod.alRecibirMensaje("estacion", recibir);
  }).catch(() => {});
  return () => bajaReal?.();
}
