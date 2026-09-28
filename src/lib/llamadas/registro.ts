"use client";

/**
 * Registro del final de una llamada en SU mensaje del chat: quien la creó añade al adjunto
 * cuándo terminó, cuánto duró y si alguien contestó. La tarjeta del chat lo lee para decir
 * «Terminada · 12 min», «Perdida» o «Sin respuesta» sin consultar nada más.
 *
 * La RLS de os_dm_messages solo deja actualizar mensajes propios (sender = auth.uid()), justo
 * lo que se necesita. No toca `edited_at`: no es una edición del texto. Nunca lanza.
 */
import { createClient } from "@/utils/supabase/client";
import type { AdjuntoLlamadaRegistro } from "@/lib/llamadas/tipos";

export async function registrarFinLlamada(
    mensajeId: string,
    adjunto: AdjuntoLlamadaRegistro,
    datos: { fin: Date; duracionMs: number; contestada: boolean },
): Promise<boolean> {
    if (!mensajeId) return false;
    try {
        const final: AdjuntoLlamadaRegistro = {
            ...adjunto,
            fin: datos.fin.toISOString(),
            duracionMs: Math.max(0, Math.round(datos.duracionMs)),
            contestada: datos.contestada,
        };
        const supabase = createClient();
        const { error } = await supabase.from("os_dm_messages").update({ attachments: [final] }).eq("id", mensajeId);
        return !error;
    } catch {
        return false;
    }
}
