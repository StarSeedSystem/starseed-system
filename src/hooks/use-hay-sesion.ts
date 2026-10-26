"use client";

/**
 * useHaySesion — ¿hay una cuenta con la sesión abierta? (Ola 1025U · GUIA1025U)
 * ─────────────────────────────────────────────────────────────────────────────
 * La guía completa se puede ver con o sin cuenta y cambia en dos sitios: sin cuenta, «Ir» a zonas que la
 * piden se sustituye por «Disponible al entrar» y el último paso ofrece crear cuenta o explorar; con ella,
 * el último paso termina en el espacio de la persona.
 *
 *   · `null`  — aún no se sabe (o no se pudo saber): la guía se comporta como siempre, sin quitar nada;
 *   · `true`  — cuenta real (con correo, no anónima);
 *   · `false` — sin sesión.
 *
 * Solo trabaja mientras `activo` (la guía abierta) y no pide nada a la red: lee la sesión local
 * (`usuarioActual`) y se suscribe a los cambios. Los módulos de Supabase se cargan a demanda, para no
 * engordar el arranque de quien nunca abre la guía. Nunca lanza.
 */

import { useEffect, useState } from "react";

interface UsuarioMinimo {
    email?: string | null;
    is_anonymous?: boolean;
}

/** Una cuenta de verdad: con correo y no anónima (el mismo criterio que el primer arranque). */
export function esCuentaReal(usuario: UsuarioMinimo | null | undefined): boolean {
    return Boolean(usuario && usuario.email && !usuario.is_anonymous);
}

export function useHaySesion(activo: boolean = true): boolean | null {
    const [hay, setHay] = useState<boolean | null>(null);

    useEffect(() => {
        if (!activo) return;
        let vivo = true;
        let quitar: (() => void) | undefined;
        void (async () => {
            try {
                const { usuarioActual } = await import("@/lib/consumo/usuario");
                const usuario = await usuarioActual();
                if (vivo) setHay(esCuentaReal(usuario));
                const { createClient } = await import("@/utils/supabase/client");
                const { data } = createClient().auth.onAuthStateChange((_evento, sesion) => {
                    if (vivo) setHay(esCuentaReal(sesion?.user));
                });
                if (vivo) quitar = () => data.subscription.unsubscribe();
                else data.subscription.unsubscribe();
            } catch {
                /* sin saberlo: la guía se queda como estaba */
            }
        })();
        return () => {
            vivo = false;
            try {
                quitar?.();
            } catch {
                /* nada que soltar */
            }
        };
    }, [activo]);

    return hay;
}
