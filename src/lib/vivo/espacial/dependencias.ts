"use client";

/**
 * Dependencias REALES de una sesión de escena (Supabase + canal en vivo). Los tests usan las
 * suyas de mentira; la interfaz, estas.
 */

import { acceptSpaceInvite } from "@/lib/spaces/spaces";
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
    };
}
