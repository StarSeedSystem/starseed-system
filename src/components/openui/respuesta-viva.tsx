"use client";

import { useState } from "react";
import { Renderer, type ActionEvent, type OpenUIError } from "@openuidev/react-lang";
import { biblioteca } from "@/lib/openui/biblioteca";
import { pareceOpenUI } from "@/lib/openui/detectar";

interface RespuestaVivaProps {
  texto: string;
  enCurso: boolean;
  onAccion?: (evento: ActionEvent) => void;
}

export function RespuestaViva({ texto, enCurso, onAccion }: RespuestaVivaProps) {
  const [tieneError, setTieneError] = useState(false);
  const esOpenUI = pareceOpenUI(texto);

  if (!esOpenUI || tieneError) {
    return <p className="text-sm">{texto}</p>;
  }

  return (
    <Renderer
      response={texto}
      library={biblioteca}
      isStreaming={enCurso}
      onAction={onAccion}
      onError={(errores: OpenUIError[]) => {
        if (errores.length > 0) {
          console.warn("Error al renderizar OpenUI:", errores);
          setTieneError(true);
        }
      }}
    />
  );
}