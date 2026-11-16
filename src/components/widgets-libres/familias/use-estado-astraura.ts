import { useState, useEffect } from "react";
import { getAuroraBridge } from "../../../lib/aurora/open-aurora";

export type EstadoAsistente = "calma" | "escuchando" | "hablando" | "error";

export function useEstadoAstraura(visible: boolean, ultimaMs: number | null) {
  const [estado, setEstado] = useState<EstadoAsistente>("calma");
  const [voz, setVoz] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      try {
        const bridge = getAuroraBridge();
        if (bridge.actionStatus?.toLowerCase().includes("error")) {
          setEstado("error");
        } else if (bridge.speaking) {
          setEstado("hablando");
          setVoz(true);
        } else if (bridge.listening) {
          setEstado("escuchando");
        } else {
          setEstado("calma");
          setVoz(false);
        }
      } catch {
        setEstado("error");
      }
    }, 500);

    return () => clearInterval(interval);
  }, [visible, ultimaMs]);

  return {
    estado,
    voz,
    escuchar: () => getAuroraBridge().start?.(),
    callar: () => getAuroraBridge().stop?.(),
  };
}
