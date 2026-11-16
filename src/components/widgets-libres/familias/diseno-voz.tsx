"use client";

import { Mic, MicOff, MessageCircle } from "lucide-react";
import type { EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

const CIAN_ASTURAURA = PALETAS.astraura.colores[0];

export interface PropsDisenoVoz {
  tam: number;
  voz: boolean;
  estado: EstadoAsistente;
  ultima: { texto: string; ts: number } | null;
  onAbrirChat: () => void;
  onHablar: () => void;
  onParar: () => void;
  onSugerencia?: (t: string) => void;
  preguntar?: React.ReactNode;
}

const TEXTO_ESTADO: Record<EstadoAsistente, string> = {
  calma: "En calma",
  escuchando: "Escuchando…",
  hablando: "Hablando",
  pensando: "Pensando…",
  error: "Algo falló",
};

export function DisenoVoz({
  tam,
  voz,
  estado,
  ultima,
  onAbrirChat,
  onHablar,
  onParar,
  onSugerencia,
  preguntar,
}: PropsDisenoVoz) {
  const textoEstado = TEXTO_ESTADO[estado];

  return (
    <div
      data-diseno="voz"
      className="flex h-full w-full flex-col items-center justify-center gap-4 p-4"
      style={{ minHeight: tam >= 44 ? `${tam * 0.8}px` : "176px" }}
    >
      <div className="flex flex-col items-center gap-2">
        <span
          role="status"
          className="text-center text-4xl font-bold text-foreground"
          aria-live="polite"
          style={{ fontSize: "2.5rem" }}
        >
          {voz ? textoEstado : "La voz no está disponible en este aparato"}
        </span>

        {ultima && voz && (
          <p
            className="text-center text-foreground"
            style={{ fontSize: "1.5rem", maxWidth: tam * 0.9 }}
            title={ultima.texto}
          >
            {ultima.texto}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-full flex-col items-center gap-3">
        {voz && (
          <button
            type="button"
            onClick={estado === "escuchando" ? onParar : onHablar}
            className="flex h-16 w-full items-center justify-center rounded-full cursor-pointer text-xl font-semibold text-white transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${CIAN_ASTURAURA}66, ${CIAN_ASTURAURA}33)`,
              boxShadow: `inset 0 0 0 1px ${CIAN_ASTURAURA}99, 0 6px 18px -8px ${CIAN_ASTURAURA}aa`,
            }}
            aria-label={estado === "escuchando" ? "Parar de escuchar" : "Hablar con Astraura"}
          >
            {estado === "escuchando" ? (
              <>
                <MicOff className="mr-2 h-6 w-6" />
                Parar
              </>
            ) : (
              <>
                <Mic className="mr-2 h-6" />
                Hablar
              </>
            )}
          </button>
        )}

        {voz && onSugerencia && (
          <div className="flex w-full flex-wrap justify-center gap-2">
            {["Pregúntale algo", "Resúmeme", "¿Qué hay nuevo?"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSugerencia(s)}
                className="rounded-full bg-violet-100 px-3 py-1.5 text-sm font-medium text-violet-700 cursor-pointer hover:bg-violet-200 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {!voz && preguntar && (
          <div className="w-full max-w-full">{preguntar}</div>
        )}

        <button
          type="button"
          onClick={onAbrirChat}
          className="flex items-center justify-center gap-2 rounded-full cursor-pointer px-3 py-1.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: `${CIAN_ASTURAURA}1f`, boxShadow: `inset 0 0 0 1px ${CIAN_ASTURAURA}59` }}
          aria-label="Abrir el chat de Astraura"
        >
          <MessageCircle className="h-4 w-4" />
          Chat
        </button>
      </div>
    </div>
  );
}