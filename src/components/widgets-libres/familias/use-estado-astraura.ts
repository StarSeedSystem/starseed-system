"use client";

import * as React from "react";
import { getAuroraBridge } from "@/lib/aurora/open-aurora";
import { derivarEstado, type EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";

export interface EstadoAstraura {
  estado: EstadoAsistente;
  voz: boolean;
  escuchar: () => void;
  callar: () => void;
}

export function useEstadoAstraura(visible: boolean, ultimaMs: number | null): EstadoAstraura {
  const [estado, setEstado] = React.useState<EstadoAsistente>("calma");
  const [voz, setVoz] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;

    let vivo = true;
    let sub: (() => void) | undefined;
    let espera: number | undefined;

    const actualizar = () => {
      if (!vivo) return;
      try {
        const puente = getAuroraBridge();
        if (!puente?.subscribe) {
          setEstado("calma");
          setVoz(false);
          return;
        }
        const s = puente.getState?.() ?? null;
        setVoz(!!s?.supported && !!s?.enabled);
        setEstado(derivarEstado(s, ultimaMs, Date.now()));
      } catch {
        setEstado("error");
      }
    };

    const conectar = () => {
      const puente = getAuroraBridge();
      if (puente?.subscribe) {
        actualizar();
        sub = puente.subscribe(actualizar);
        return;
      }
      espera = window.setTimeout(conectar, 5000);
    };

    conectar();
    return () => {
      vivo = false;
      sub?.();
      window.clearTimeout(espera);
    };
  }, [visible, ultimaMs]);

  return {
    estado,
    voz,
    escuchar: () => { try { getAuroraBridge()?.start?.(); } catch {} },
    callar: () => { try { getAuroraBridge()?.stop?.(); } catch {} },
  };
}