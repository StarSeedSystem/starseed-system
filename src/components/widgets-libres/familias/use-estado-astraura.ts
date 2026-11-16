"use client";

import * as React from "react";
import { getAuroraBridge } from "@/lib/aurora/open-aurora";
import { derivarEstado, type EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";

export function useEstadoAstraura(
  visible: boolean,
  ultimaMs: number | null
): { estado: EstadoAsistente; voz: boolean; escuchar: () => void; callar: () => void } {
  const [estado, setEstado] = React.useState<EstadoAsistente>("calma");
  const [voz, setVoz] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;

    let desuscribir: (() => void) | undefined;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let vivo = true;

    const leer = () => {
      const puente = getAuroraBridge();
      if (!puente || !vivo) return;

      try {
        const snapshot = puente.getState?.();
        if (!snapshot || !vivo) return;

        setVoz(!!snapshot.supported && !!snapshot.enabled);
        setEstado(derivarEstado(snapshot, ultimaMs, Date.now()));
      } catch {
        if (vivo) setEstado("error");
      }
    };

    const conectar = () => {
      if (!vivo) return;
      const puente = getAuroraBridge();
      if (puente?.subscribe) {
        leer();
        desuscribir = puente.subscribe(leer);
        return;
      }
      temporizador = setTimeout(conectar, 5000);
    };

    conectar();

    return () => {
      vivo = false;
      desuscribir?.();
      if (temporizador) clearTimeout(temporizador);
    };
  }, [visible, ultimaMs]);

  const escuchar = React.useCallback(() => {
    try {
      getAuroraBridge()?.start?.();
    } catch {
      // sin voz
    }
  }, []);

  const callar = React.useCallback(() => {
    try {
      getAuroraBridge()?.stop?.();
    } catch {
      // sin voz
    }
  }, []);

  return { estado, voz, escuchar, callar };
}