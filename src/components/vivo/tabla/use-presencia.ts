"use client";
/**
 * Presencia en un documento vivo: quién está dentro y en qué celda. Un canal por documento
 * abierto (Supabase Presence), agrupado y soltado al ocultar la pestaña (ver `presencia.ts`).
 * Sin sesión no hay presencia (y no se anuncia nada).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PresenciaViva, colorDeUsuario, type Posicion, type Presente } from "@/lib/vivo/tabla/presencia";
import { miUid } from "@/lib/vivo/tabla/espacio";
import { fetchMyProfile } from "@/lib/social/os-profiles";

const NADIE: readonly Presente[] = Object.freeze([]);
const sinSuscripcion = () => () => {};
const nadie = () => NADIE;

export function usePresencia(canal: string): { presentes: readonly Presente[]; anunciar: (pos: Posicion) => void } {
    const [p, setP] = useState<PresenciaViva | null>(null);
    const ref = useRef<PresenciaViva | null>(null);

    useEffect(() => {
        let vivo = true;
        let pv: PresenciaViva | null = null;
        let quitar: (() => void) | null = null;
        void (async () => {
            const uid = await miUid();
            if (!vivo || !uid) return;
            let nombre = "Alguien";
            try {
                const perfil = await fetchMyProfile();
                if (perfil?.displayName) nombre = perfil.displayName;
            } catch {
                /* sin perfil: se anuncia como «Alguien» */
            }
            if (!vivo) return;
            pv = new PresenciaViva(canal, { uid, nombre, color: colorDeUsuario(uid) });
            ref.current = pv;
            pv.iniciar();
            const visibilidad = () => (document.visibilityState === "hidden" ? pv?.ocultar() : pv?.mostrar());
            document.addEventListener("visibilitychange", visibilidad);
            quitar = () => document.removeEventListener("visibilitychange", visibilidad);
            setP(pv);
        })();
        return () => {
            vivo = false;
            quitar?.();
            pv?.destruir();
            ref.current = null;
            setP(null);
        };
    }, [canal]);

    const presentes = useSyncExternalStore(p ? p.subscribe : sinSuscripcion, p ? p.getSnapshot : nadie, nadie);
    const anunciar = useCallback((pos: Posicion) => ref.current?.anunciar(pos), []);
    return { presentes, anunciar };
}
