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

    let quitar: (() => void) | undefined;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let vivo = true;

    const leer = () => {
      const puente = getAuroraBridge();
      if (!puente || !vivo) return;
      try {
        const s = puente.getState?.();
        if (!s || !vivo) return;
        setVoz(!!s.supported && !!s.enabled);
        setEstado(derivarEstado(s, ultimaMs, Date.now()));
      } catch {
        if (vivo) setEstado("error");
      }
    };

    const conectar = () => {
      const puente = getAuroraBridge();
      if (puente?.subscribe) {
        leer();
        quitar = puente.subscribe(leer);
        return;
      }
      espera = setTimeout(conectar, 5000);
    };

    conectar();

    return () => {
      vivo = false;
      quitar?.();
      if (espera !== undefined) clearTimeout(espera);
    };
  }, [visible, ultimaMs]);

  const escuchar = () => {
    try {
      getAuroraBridge()?.start?.();
    } catch {
      /* sin voz */
    }
  };

  const callar = () => {
    try {
      getAuroraBridge()?.stop?.();
    } catch {
      /* sin voz */
    }
  };

  return { estado, voz, escuchar, callar };
}