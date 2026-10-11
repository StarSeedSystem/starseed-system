'use client';

import { useCallback, useState } from "react";
import { consentamiento, evaluarSalida } from "@/lib/xr/privacidad";
import type { ClaseDato, Destino, Consentimiento } from "@/lib/xr/privacidad";

interface Props {
  clase: ClaseDato;
  destino: Destino;
  motivo: string;
  alResponder: (c: Consentimiento | null) => void; // null = rechazado / nunca
}

export default function TarjetaConsentimiento({ clase, destino, motivo, alResponder }: Props) {
  const [resuelto, setResuelto] = useState(false);

  const ver = evaluarSalida(clase, destino, Date.now(), []);

  const permitir8h = useCallback(() => {
    const c = consentamiento(clase, destino, Date.now(), 8 * 3600_000);
    alResponder(c);
    setResuelto(true);
  }, [clase, destino, alResponder]);

  const soloEstaVez = useCallback(() => {
    const c = consentamiento(clase, destino, Date.now(), 60_000);
    alResponder(c);
    setResuelto(true);
  }, [clase, destino, alResponder]);

  const rechazar = useCallback(() => {
    alResponder(null);
    setResuelto(true);
  }, [alResponder]);

  // Nunca se ofrece permitir lo que requiere 'nunca' (cámara, mirada).
  const esNunca = ver.requiere === "nunca";

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-950/20 p-5 text-left shadow-lg">
      <h3 className="text-[14px] font-bold text-amber-200 mb-2">Permiso de privacidad</h3>
      <p className="text-[13px] text-white/80 mb-1">
        <b>Clase:</b> <span className="font-mono text-amber-300">{clase}</span>
      </p>
      <p className="text-[13px] text-white/70 mb-4">{motivo}</p>
      {esNunca ? (
        <div className="text-[12px] text-rose-300">
          Este dato <b>nunca</b> puede salir del aparato. No se solicita permiso.
        </div>
      ) : (
        <>
          <p className="text-[11px] text-white/50 mb-3">¿Permites que salga a <b>{destino}</b>?</p>
          <div className="flex gap-2">
            <button
              onClick={permitir8h}
              className="cursor-pointer rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-[12px] font-semibold text-white transition-colors"
            >
              Permitir 8 horas
            </button>
            <button
              onClick={soloEstaVez}
              className="cursor-pointer rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-[12px] font-semibold text-white transition-colors"
            >
              Solo esta vez
            </button>
            <button
              onClick={rechazar}
              className="cursor-pointer rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-[12px] font-semibold text-white transition-colors"
            >
              No
            </button>
          </div>
        </>
      )}
      {resuelto && !esNunca && (
        <p className="text-[11px] text-white/40 mt-3">Respuesta registrada.</p>
      )}
    </div>
  );
}
