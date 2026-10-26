/**
 * Gobierno de la Protomolécula de cada grupo, comunidad o página (Ola 1026P · P2). ESQUELETO del contrato:
 * P2 lo sustituye. Mientras tanto, lo personal lo decide su dueño y lo demás se propone.
 */
import type { ActorProto, ContextoProto, TipoCambioProto, VeredictoGobierno } from "../peticion/contrato";

export function decidirCambio(contexto: ContextoProto, actor: ActorProto, _tipo: TipoCambioProto): VeredictoGobierno {
  const ia = actor.origen !== "humano";
  if (contexto.ambito === "personal" || contexto.ambito === "perfil") {
    return actor.esDueno
      ? { decision: "aplicar", motivo: "Es tuyo.", confirmar: ia }
      : { decision: "denegar", motivo: "Solo la persona dueña cambia su espacio personal.", confirmar: false };
  }
  return { decision: "proponer", motivo: "Las reglas de esta entidad aún no están configuradas: se propone.", confirmar: ia };
}
