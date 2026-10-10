"use client";

/*
 * useAntenasNativas — el estado vivo de las antenas de la app nativa para la interfaz (2026-10-10).
 * Contrato: architecture/apps-nativas-segundo-plano.md §7. Lo pinta el panel «Antenas» (tarea T1).
 * En la web normal devuelve `disponible: false` y no sondea nada.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { esAppNativa, puenteNativo } from "./puente";
import type { EstadoAntenas, EstadoFondo, Resultado } from "./tipos";
import { ejecutarAccion, vistaAntenas, type AccionVista, type VistaAntenas } from "./vista-antenas";

const CADA_MS = 30_000;

export interface UsoAntenas {
  disponible: boolean;
  estado: EstadoAntenas | null;
  fondo: EstadoFondo | null;
  vista: VistaAntenas;
  ocupado: boolean;
  ultimoError: string | null;
  refrescar(): Promise<void>;
  ejecutar(accion: AccionVista, extra?: { vincularCuenta?: () => Promise<Resultado<unknown>> }): Promise<Resultado<unknown>>;
}

export function useAntenasNativas(): UsoAntenas {
  // Se decide tras montar (en el servidor no hay app): así la hidratación no cambia de forma.
  const [disponible, setDisponible] = useState(false);
  useEffect(() => setDisponible(esAppNativa()), []);
  const [estado, setEstado] = useState<EstadoAntenas | null>(null);
  const [fondo, setFondo] = useState<EstadoFondo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ultimoError, setUltimoError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    if (!disponible) return;
    const p = puenteNativo();
    const [a, f] = await Promise.all([p.antenasEstado(), p.fondoEstado()]);
    if (a.ok) setEstado(a.valor);
    if (f.ok) setFondo(f.valor);
    setUltimoError(!a.ok ? a.motivo : !f.ok ? f.motivo : null);
  }, [disponible]);

  useEffect(() => {
    if (!disponible) return;
    let vivo = true;
    let quitar: (() => void) | null = null;
    void refrescar();
    void puenteNativo()
      .alCambiarAntenas((e) => {
        if (vivo) setEstado(e);
      })
      .then((q) => {
        if (vivo) quitar = q;
        else q();
      });
    const t = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void refrescar();
    }, CADA_MS);
    return () => {
      vivo = false;
      clearInterval(t);
      quitar?.();
    };
  }, [disponible, refrescar]);

  const ejecutar = useCallback<UsoAntenas["ejecutar"]>(
    async (accion, extra) => {
      setOcupado(true);
      try {
        const r = await ejecutarAccion(accion, puenteNativo(), extra);
        if (!r.ok) setUltimoError(r.motivo);
        await refrescar();
        return r;
      } finally {
        setOcupado(false);
      }
    },
    [refrescar],
  );

  const vista = useMemo(() => vistaAntenas(estado, fondo), [estado, fondo]);
  return { disponible, estado, fondo, vista, ocupado, ultimoError, refrescar, ejecutar };
}
