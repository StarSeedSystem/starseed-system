import { useState, useEffect, useCallback } from "react";
import { getAuroraBridge } from "../../../lib/aurora/open-aurora";
import { derivarEstado, EstadoAsistente } from "../../../lib/aurora/estado-asistente";

export function useEstadoAstraura(visible: boolean, ultimaMs: number | null) {
  const [estado, setEstado] = useState<EstadoAsistente>("calma");

  useEffect(() => {
    if (!visible) return;

    const puente = getAuroraBridge();
    if (!puente) return;

    try {
      const snapshot = puente.getState();
      setEstado(derivarEstado(snapshot, ultimaMs, Date.now()));
    } catch {
      setEstado("error");
    }

    const unsub = puente.subscribe(() => {
      try {
        const snapshot = puente.getState();
        setEstado(derivarEstado(snapshot, ultimaMs, Date.now()));
      } catch {
        setEstado("error");
      }
    });

    return () => unsub();
  }, [visible, ultimaMs]);

  const escuchar = useCallback(() => getAuroraBridge()?.start(), []);
  const callar = useCallback(() => getAuroraBridge()?.stop(), []);

  return { estado, voz: estado !== "calma", escuchar, callar };
}
