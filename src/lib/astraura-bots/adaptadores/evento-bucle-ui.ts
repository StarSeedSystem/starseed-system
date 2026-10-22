/**
 * Evento de ventana con cada paso del bucle de un bot (BOT1011E2).
 * Lo emite el puente de sentidos (BOT1011F) y lo escucha el anfitrión de orbes
 * (BOT1011C2) para pintar el anillo mientras haya un sentido activo.
 * Sin React, sin red y sin `node:*`: solo el nombre y la forma del detalle.
 */
import type { EventoBucle } from "../bucle";

export const EVENTO_BUCLE_UI = "starseed:astraura-bot-bucle";

export interface DetalleBucleUI {
  botId: string;
  evento: EventoBucle;
}
