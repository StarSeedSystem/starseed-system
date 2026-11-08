import { redirect } from "next/navigation";
import { RUTA_SENALES_LLEGADAS } from "@/lib/senales/destinos";

/**
 * /red-feed — RETIRADA (2026-11-08, a petición de Alex). Ya no es una sección:
 * lo recibido de otras neuronas vive en Señales › «Actividad de red recibida» y
 * los chats con neuronas en Mensajes › Neuronas. Esta ruta solo redirige para que
 * enlaces antiguos, marcadores y apps instaladas no den 404.
 */
export default function RedFeedPage(): never {
  redirect(RUTA_SENALES_LLEGADAS);
}
