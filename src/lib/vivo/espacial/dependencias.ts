"use client";

/**
 * Dependencias REALES de una sesión de escena (Supabase + canal en vivo). Los tests usan las
 * suyas de mentira; la interfaz, estas.
 */

import { acceptSpaceInvite } from "@/lib/spaces/spaces";
import { loadAdnEntry, parseAdnEntry } from "@/lib/avatares/adaptadores/almacen-adn";
import { abrirCanalEscena } from "./canal";
import {
    crearFilaEscena,
    guardarSiRev,
    leerFilaEscena,
    MENSAJES_ERROR,
    puedeEditarEscena,
} from "./persistencia";
import type { DependenciasSesion } from "./sesion";

export function dependenciasReales(): DependenciasSesion {
    return {
        almacen: {
            leer: leerFilaEscena,
            guardar: guardarSiRev,
            puedeEditar: puedeEditarEscena,
            aceptarInvitacion: (id) => acceptSpaceInvite(id),
            crearCopia: async (titulo, doc) => {
                const r = await crearFilaEscena(titulo, doc);
                return r.fila ? { id: r.fila.id } : { error: MENSAJES_ERROR[r.error] };
            },
        },
        abrirCanal: abrirCanalEscena,
        // AV1011E: el ADN de un presente se lee UNA vez por revisión de la Biblioteca de ESTE
        // aparato. Si no está aquí (la Biblioteca compartida y la sincronía entre aparatos aún
        // no existen), devuelve null y el avatar queda como estaba: nunca una ilusión.
        leerAdn: async (ref, rev) => {
            const entrada = await loadAdnEntry(ref, rev);
            return entrada ? parseAdnEntry(entrada) : null;
        },
    };
}
