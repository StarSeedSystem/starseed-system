"use client";
/**
 * Personas: nombres y avatares de las cuentas que aparecen en la tabla (columna «Persona»),
 * en la presencia y en la lista de quien tiene acceso. Se piden en bloque y se recuerdan.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { fetchProfilesByIds, searchUsers, type OsProfile } from "@/lib/social/os-profiles";
import { esUuid } from "@/lib/vivo/tabla/modelo";
import { iniciales, colorDeUsuario } from "@/lib/vivo/tabla/presencia";
import css from "./tabla.module.css";

export interface PerfilCorto {
    uid: string;
    nombre: string;
    usuario: string;
    avatar?: string;
}

const cache = new Map<string, PerfilCorto | null>();
const pidiendo = new Set<string>();

function recordar(p: OsProfile): PerfilCorto {
    const corto = { uid: p.userId, nombre: p.displayName || p.username, usuario: p.username, avatar: p.avatarUrl };
    cache.set(p.userId, corto);
    return corto;
}

/** Perfiles de estas cuentas (los que aún no se conocen se piden una sola vez). */
export function usePerfiles(uids: readonly string[]): (uid: string) => PerfilCorto | undefined {
    const [, refrescar] = useReducer((n: number) => n + 1, 0);
    const montado = useRef(true);
    useEffect(() => {
        montado.current = true;
        return () => {
            montado.current = false;
        };
    }, []);
    const firma = uids.filter((u) => esUuid(u) && !cache.has(u)).sort().join(",");
    useEffect(() => {
        const faltan = firma ? firma.split(",").filter((u) => !pidiendo.has(u)) : [];
        if (!faltan.length) return;
        for (const u of faltan) pidiendo.add(u);
        void (async () => {
            for (let i = 0; i < faltan.length; i += 50) {
                const lote = faltan.slice(i, i + 50);
                try {
                    const r = await fetchProfilesByIds(lote);
                    for (const u of lote) {
                        if (r[u]) recordar(r[u]);
                        else cache.set(u, null);
                    }
                } catch {
                    for (const u of lote) cache.set(u, null);
                }
                for (const u of lote) pidiendo.delete(u);
            }
            if (montado.current) refrescar();
        })();
    }, [firma]);
    return useCallback((uid: string) => cache.get(uid) ?? undefined, []);
}

/** Busca cuentas por nombre o @usuario (con espera para no saturar). */
export function useBusquedaPersonas(texto: string): { resultados: PerfilCorto[]; buscando: boolean } {
    const [estado, poner] = useReducer(
        (_: { resultados: PerfilCorto[]; buscando: boolean }, n: { resultados: PerfilCorto[]; buscando: boolean }) => n,
        { resultados: [], buscando: false },
    );
    useEffect(() => {
        const q = texto.trim().replace(/^@/, "");
        if (q.length < 2) {
            poner({ resultados: [], buscando: false });
            return;
        }
        let vivo = true;
        poner({ resultados: [], buscando: true });
        const t = setTimeout(() => {
            void searchUsers(q, 8)
                .then((r) => vivo && poner({ resultados: r.map(recordar), buscando: false }))
                .catch(() => vivo && poner({ resultados: [], buscando: false }));
        }, 300);
        return () => {
            vivo = false;
            clearTimeout(t);
        };
    }, [texto]);
    return estado;
}

export function AvatarPersona({ uid, nombre, avatar, chico = false }: { uid: string; nombre: string; avatar?: string; chico?: boolean }) {
    return (
        <span
            className={`${css.avatar} ${chico ? css.avatarChico : ""} ss-redondo`}
            style={{ ["--c" as string]: colorDeUsuario(uid) }}
            aria-hidden="true"
        >
            {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" referrerPolicy="no-referrer" loading="lazy" />
            ) : (
                iniciales(nombre)
            )}
        </span>
    );
}
