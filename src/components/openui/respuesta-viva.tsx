"use client";

import { Renderer } from "@openuidev/react-lang";
import { biblioteca } from "@/lib/openui/biblioteca";
import { pareceOpenUI } from "@/lib/openui/detectar";

interface RespuestaVivaProps {
  texto: string;
  enCurso?: boolean;
  onAccion?: (nombre: string, params: Record<string, unknown>) => void;
}

export function RespuestaViva({ texto, enCurso, onAccion }: RespuestaVivaProps) {
  if (!pareceOpenUI(texto)) {
    return <p className="whitespace-pre-wrap">{texto}</p>;
  }

  let componentes: React.ReactNode;
  try {
    componentes = (
      <Renderer
        response={texto}
        library={biblioteca}
        isStreaming={enCurso ?? false}
        onAction={(evento) => {
          if (onAccion) {
            onAccion(evento.type, evento.params);
          }
        }}
      />
    );
  } catch {
    componentes = <p className="whitespace-pre-wrap">{texto}</p>;
  }

  return <div>{componentes}</div>;
}
