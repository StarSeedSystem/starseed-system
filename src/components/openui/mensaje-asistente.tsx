"use client";

import { RespuestaViva } from "./respuesta-viva";
import { debeUsarInterfazViva } from "@/lib/astraura/ajustes-respuesta";

interface MensajeAsistenteProps {
  texto: string;
  enCurso: boolean;
  ajustesPerfil?: Partial<AjustesPerfilRespuesta>;
  onAccion?: (evento: ActionEvent) => void;
}

export function MensajeAsistente({
  texto,
  enCurso,
  ajustesPerfil = {},
  onAccion,
}: MensajeAsistenteProps) {
  const usarInterfazViva = debeUsarInterfazViva(ajustesPerfil);

  if (usarInterfazViva) {
    return (
      <RespuestaViva
        texto={texto}
        enCurso={enCurso}
        onAccion={onAccion}
      />
    );
  }

  return <p className="text-sm">{texto}</p>;
}

export default MensajeAsistente;