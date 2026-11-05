import { Renderer, type ActionEvent, OpenUIError } from "@openuidev/react-lang";
import { biblioteca } from "@/lib/openui/biblioteca";
import { pareceOpenUI } from "@/lib/openui/detectar";

interface RespuestaVivaProps {
  texto: string;
  enCurso?: boolean;
  onAccion?: (evento: ActionEvent) => void;
}

export function RespuestaViva({ texto, enCurso, onAccion }: RespuestaVivaProps) {
  if (pareceOpenUI(texto)) {
    return (
      <Renderer
        response={texto}
        library={biblioteca}
        isStreaming={enCurso ?? false}
        onAction={onAccion}
        onError={(_errors: OpenUIError[]) => {}}
      />
    );
  }

  return <>{texto}</>;
}