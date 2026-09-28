"use client";

/** Ajustes › Aurora (2026-09-28): tu IA en los chats, siempre a tu servicio y nunca por sorpresa. */

import type { AjustesMensajeriaApi } from "@/lib/mensajeria/ajustes-tipos";
import { ACENTO } from "@/components/messages/marco/estilos";
import { Bloque, FilaInterruptor, Nota } from "./controles";

export function SeccionAurora({ api }: { api: AjustesMensajeriaApi }) {
    const a = api.ajustes.aurora;
    return (
        <div className="space-y-6">
            <Bloque titulo="Aurora en tus chats">
                <FilaInterruptor
                    etiqueta="Activa por defecto en chats nuevos"
                    detalle="Los chats que crees a partir de ahora empezarán con Aurora dentro. Puedes quitarla en cada uno."
                    checked={a.activaPorDefecto}
                    onChange={(activaPorDefecto) => api.cambiar("aurora", { activaPorDefecto })}
                />
                <FilaInterruptor
                    etiqueta="Responder cuando la mencionen"
                    detalle="Si alguien escribe @aurora en un chat donde está activa, responde sola."
                    checked={a.responderMenciones}
                    onChange={(responderMenciones) => api.cambiar("aurora", { responderMenciones })}
                />
            </Bloque>
            <Nota color={ACENTO.aurora}>
                Aurora es tu exocórtex: trabaja para ti, con lo que hay en el chat, y todos ven cuándo participa.
            </Nota>
        </div>
    );
}

export default SeccionAurora;
