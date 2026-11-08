/**
 * Subida de los mensajes de la malla a la cuenta, enganchada al buzón (MSJ1108C · F1).
 * Une `subida.ts` (reglas puras) con el servidor de siempre (`dm.ts`) y la bandeja. Nunca lanza.
 */

import { subirPendientes, type ResultadoSubida } from "./subida";
import { bandejaMalla, cambiarMensajeMalla, hayInternetYSesion } from "@/lib/mensajeria/neuronas/buzon";

let subiendo = false;
let enganchado = false;

/** Sube lo que esta cuenta mandó o recibió solo por la malla, si hay internet y sesión. */
export async function subirMensajesMalla(): Promise<ResultadoSubida | null> {
    if (subiendo) return null;
    subiendo = true;
    try {
        const { internet, uid } = await hayInternetYSesion();
        if (!internet || !uid) return null;
        const locales = Object.values(bandejaMalla().conv).flatMap((c) => c.mensajes);
        if (!locales.some((m) => m.clave.startsWith("dm:"))) return null;
        const dm = await import("@/lib/messages/dm");
        return await subirPendientes(
            locales,
            uid,
            new Set(),
            {
                subir: (hilo, m) =>
                    dm.subirMensajeMalla(hilo, { id: m.id, body: m.body, createdAt: m.createdAt, replyTo: m.replyTo, formato: m.formato as never }),
                editar: dm.editMessage,
                borrar: dm.softDeleteMessage,
            },
            cambiarMensajeMalla,
        );
    } catch {
        return null;
    } finally {
        subiendo = false;
    }
}

/** Una pasada al tener el almacén listo y otra cada vez que vuelve internet. */
export function subirAlHaberAlmacen(): void {
    if (!enganchado && typeof window !== "undefined") {
        enganchado = true;
        window.addEventListener("online", () => void subirMensajesMalla());
    }
    void subirMensajesMalla();
}
