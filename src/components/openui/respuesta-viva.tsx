import { Renderer, type ActionEvent } from "@openuidev/react-lang";
import { biblioteca } from "@/lib/openui/biblioteca";
import { pareceOpenUI } from "@/lib/openui/detectar";
import ReactMarkdown from "react-markdown";

interface RespuestaVivaProps {
  texto: string;
  enCurso?: boolean;
  onAccion?: (accion: string | undefined) => void;
}

export function RespuestaViva({ texto, enCurso = false, onAccion }: RespuestaVivaProps) {
  const esOpenUI = pareceOpenUI(texto);

  if (!esOpenUI) {
    return <ReactMarkdown>{texto}</ReactMarkdown>;
  }

  return (
    <Renderer
      response={texto}
      library={biblioteca}
      isStreaming={enCurso}
      onAction={(evento: ActionEvent) => {
        if (onAccion) {
          const tipo = evento.type;
          onAccion(tipo);
        }
      }}
      onError={(errores) => {
        if (errores.length > 0) {
          console.error("Error en OpenUI Lang:", errores);
        }
      }}
    />
  );
}