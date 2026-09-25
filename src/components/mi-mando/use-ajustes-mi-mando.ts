"use client";

/**
 * Ajustes de «Mi Puente de Mando» (qué páginas se ven y en qué orden).
 * ─────────────────────────────────────────────────────────────────────────────
 *   · En el dispositivo: localStorage `starseed.mi-mando.ajustes.v1` (funciona
 *     sin sesión y sin red).
 *   · En la cuenta: `user_settings.prefs.miMando`, escrito SOLO con
 *     `mergeUserPrefs` (la puerta atómica: nunca pisa las claves de otros módulos).
 * Al arrancar se leen los dos y gana el cambio más reciente (`actualizado`), así
 * el orden elegido en el móvil aparece en el ordenador y viceversa.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import {
    ajustesDesdeTexto,
    ajustesPredeterminados,
    elegirAjustesRecientes,
    normalizarAjustes,
    CLAVE_AJUSTES_MI_MANDO,
    type AjustesMiMando,
} from "@/lib/mi-mando/paginas";

export type EstadoGuardado = "local" | "guardando" | "cuenta" | "error";

/** Props de la página Personalizar (la única que edita estos ajustes). */
export interface PropsPersonalizar {
    ajustes: AjustesMiMando;
    cambiar: (a: AjustesMiMando) => void;
    estado: EstadoGuardado;
}

const ESPERA_SUBIDA_MS = 800;

function leerLocal(): AjustesMiMando {
    if (typeof window === "undefined") return ajustesPredeterminados();
    try {
        return ajustesDesdeTexto(window.localStorage.getItem(CLAVE_AJUSTES_MI_MANDO));
    } catch {
        return ajustesPredeterminados();
    }
}

function escribirLocal(a: AjustesMiMando): void {
    try {
        window.localStorage.setItem(CLAVE_AJUSTES_MI_MANDO, JSON.stringify(a));
    } catch {
        /* cuota llena o modo privado: siguen en memoria */
    }
}

export function useAjustesMiMando(userId: string | null) {
    const [ajustes, setAjustes] = useState<AjustesMiMando>(leerLocal);
    const [estado, setEstado] = useState<EstadoGuardado>("local");
    const actual = useRef(ajustes);
    const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Con sesión: trae los de la cuenta y quédate con los más recientes.
    useEffect(() => {
        if (!userId) {
            setEstado("local");
            return;
        }
        let vivo = true;
        void (async () => {
            try {
                const { data } = await createClient()
                    .from("user_settings")
                    .select("prefs")
                    .eq("user_id", userId)
                    .maybeSingle();
                if (!vivo) return;
                const prefs = (data?.prefs ?? null) as Record<string, unknown> | null;
                const remoto = prefs && prefs.miMando ? normalizarAjustes(prefs.miMando) : null;
                const elegido = elegirAjustesRecientes(actual.current, remoto);
                if (elegido !== actual.current) {
                    actual.current = elegido;
                    escribirLocal(elegido);
                    setAjustes(elegido);
                }
                setEstado(remoto ? "cuenta" : "local");
            } catch {
                if (vivo) setEstado("local");
            }
        })();
        return () => {
            vivo = false;
        };
    }, [userId]);

    // Al salir del panel con un cambio aún sin subir, se sube ya (sin tocar el
    // estado de un componente desmontado): cerrar la pestaña no debe perderlo.
    const usuario = useRef(userId);
    usuario.current = userId;
    useEffect(
        () => () => {
            if (!temporizador.current) return;
            clearTimeout(temporizador.current);
            temporizador.current = null;
            const uid = usuario.current;
            if (uid) void mergeUserPrefs({ miMando: actual.current }, { userId: uid }).catch(() => undefined);
        },
        [],
    );

    const cambiar = useCallback(
        (nuevo: AjustesMiMando) => {
            actual.current = nuevo;
            setAjustes(nuevo);
            escribirLocal(nuevo);
            if (!userId) {
                setEstado("local");
                return;
            }
            // Se agrupan los clics seguidos (subir, subir, ocultar…) en una sola escritura.
            setEstado("guardando");
            if (temporizador.current) clearTimeout(temporizador.current);
            temporizador.current = setTimeout(() => {
                temporizador.current = null;
                void mergeUserPrefs({ miMando: actual.current }, { userId })
                    .then((r) => setEstado(r.ok ? "cuenta" : "error"))
                    .catch(() => setEstado("error"));
            }, ESPERA_SUBIDA_MS);
        },
        [userId],
    );

    return { ajustes, cambiar, estado };
}
