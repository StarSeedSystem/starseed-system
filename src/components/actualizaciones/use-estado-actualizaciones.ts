"use client";

/**
 * Estado REAL de las actualizaciones para el panel: qué tiene cada neurona (presencia en vivo),
 * qué tiene este medio (medido) y qué sirve el servidor (`/version.json` y el service worker
 * publicado). Nada se supone: lo que no se mide queda «sin dato».
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePresenciaNeuronas, presentesPorNeurona, type PresenciaMedio } from "@/lib/neurons/presencia";
import { neuronasAtrasadas, type Atraso, type EstadoNeuronaActualizacion } from "@/lib/actualizaciones/atrasadas";
import type { VersionesPorCapa } from "@/lib/actualizaciones/capas";
import { compararVersiones, CAPAS_ORDEN } from "@/lib/actualizaciones/manifiesto";
import { fusionarVersionesMedios } from "@/lib/actualizaciones/versiones-capa";
import { versionesDeEsteMedio } from "@/lib/actualizaciones/versiones-locales";
import { NATIVE_VERSION } from "@/lib/version/os-release";

export interface NeuronaVista extends EstadoNeuronaActualizacion {
  medios: number;
  esEsta: boolean;
}

export interface EstadoServidor {
  /** Build que sirve el servidor ahora y build con el que arrancó esta pestaña. */
  buildServidor: string | null;
  buildPestana: string | null;
  swServidor: string | null;
  leidoEn: number | null;
  error: string | null;
}

const SW_VERSION = /const\s+SW_VERSION\s*=\s*["']([^"']{1,40})["']/;
let buildAlCargar: string | null = null;

/** Lee lo que publica el servidor. Pura salvo `fetch`; nunca lanza. */
export async function leerServidor(f: typeof fetch = fetch): Promise<Omit<EstadoServidor, "buildPestana">> {
  try {
    const [v, sw] = await Promise.all([
      f("/version.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      f("/sw-v7.js", { cache: "no-store" }).then((r) => (r.ok ? r.text() : null)).catch(() => null),
    ]);
    const build = v && typeof v.build === "string" ? v.build : null;
    return { buildServidor: build, swServidor: (sw && SW_VERSION.exec(sw)?.[1]) || null, leidoEn: Date.now(), error: build ? null : "El servidor no respondió con su versión." };
  } catch {
    return { buildServidor: null, swServidor: null, leidoEn: Date.now(), error: "Sin conexión con el servidor." };
  }
}

/** Neuronas de la cuenta a partir de la presencia (pura). */
export function neuronasDePresencia(medios: readonly PresenciaMedio[], estaId: string | null): NeuronaVista[] {
  const out: NeuronaVista[] = [];
  for (const [id, ms] of presentesPorNeurona(medios)) {
    const visible = ms.find((m) => m.visible) ?? ms[0];
    out.push({
      neuronaId: id,
      nombre: visible.plataforma ? `${visible.etiqueta} · ${visible.plataforma}` : visible.etiqueta,
      online: true,
      versiones: fusionarVersionesMedios(ms),
      medios: ms.length,
      esEsta: id === estaId,
    });
  }
  return out;
}

/** La versión más nueva que tiene alguna neurona (y la nativa publicada que conoce este OS). */
export function ultimaConocida(neuronas: readonly { versiones: VersionesPorCapa }[], local: VersionesPorCapa): VersionesPorCapa {
  const out: VersionesPorCapa = { ...local };
  for (const n of neuronas) {
    for (const c of CAPAS_ORDEN) {
      const v = n.versiones[c];
      if (v && (!out[c] || compararVersiones(v, out[c] as string) > 0)) out[c] = v;
    }
  }
  if (!out.nativa || compararVersiones(NATIVE_VERSION, out.nativa) > 0) out.nativa = NATIVE_VERSION;
  return out;
}

export function useEstadoActualizaciones() {
  const presencia = usePresenciaNeuronas();
  const [local, setLocal] = useState<VersionesPorCapa>({});
  const [estaId, setEstaId] = useState<string | null>(null);
  const [servidor, setServidor] = useState<EstadoServidor>({ buildServidor: null, buildPestana: buildAlCargar, swServidor: null, leidoEn: null, error: null });
  const [leyendo, setLeyendo] = useState(false);

  const comprobar = useCallback(async () => {
    setLeyendo(true);
    const [s, v] = await Promise.all([leerServidor(), versionesDeEsteMedio()]);
    if (buildAlCargar === null) {
      // El build con el que arrancó la pestaña lo anota RegisterSW (en producción); si no, la primera lectura.
      const inicial = typeof window !== "undefined" ? (window as unknown as { STARSEED_BUILD_INICIAL?: string }).STARSEED_BUILD_INICIAL : undefined;
      buildAlCargar = inicial ?? s.buildServidor;
    }
    setServidor({ ...s, buildPestana: buildAlCargar });
    setLocal(v);
    setLeyendo(false);
  }, []);

  useEffect(() => {
    void comprobar();
    void import("@/lib/neurons/neurons")
      .then((m) => setEstaId(m.resolverAliasEsteMedio() || m.thisDeviceId() || null))
      .catch(() => setEstaId(null));
  }, [comprobar]);

  const neuronas = useMemo(() => {
    const lista = neuronasDePresencia(presencia.medios, estaId);
    // Esta neurona siempre aparece, con lo medido aquí, aunque la presencia no haya conectado.
    if (estaId && !lista.some((n) => n.esEsta)) {
      lista.unshift({ neuronaId: estaId, nombre: "Esta neurona", online: true, versiones: local, medios: 1, esEsta: true });
    }
    return lista;
  }, [presencia.medios, estaId, local]);

  const ultima = useMemo(() => ultimaConocida(neuronas, local), [neuronas, local]);
  const atrasos: Atraso[] = useMemo(() => neuronasAtrasadas(neuronas, ultima), [neuronas, ultima]);
  const hayBuildNueva = !!servidor.buildServidor && !!servidor.buildPestana && servidor.buildServidor !== servidor.buildPestana;

  return { presenciaConectada: presencia.conectado, neuronas, local, ultima, atrasos, servidor, hayBuildNueva, leyendo, comprobar, estaId };
}
