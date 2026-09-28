"use client";

/**
 * presencia — "en línea" / "última vez", y "escribiendo…" por hilo (contrato C7).
 * `os_presencia` puede no existir aún en la base viva (migración pendiente de
 * aplicar): cualquier error 42P01/PGRST205 apaga esta capa para el resto de la
 * sesión (silencioso, nunca un bucle de reintentos).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { currentUserRef } from "@/lib/sync/entity-state";
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";

const LATIDO_MS = 120_000;
const RECIENTE_MS = 150_000;
const POLL_PRESENCIA_MS = 60_000;
const ESCRIBIENDO_THROTTLE_MS = 3_000;
const ESCRIBIENDO_EXPIRA_MS = 6_000;

/** 42P01 (tabla no existe) / PGRST205 (no está en el schema cache de PostgREST): apaga la capa para esta sesión. */
let tablaDeshabilitada = false;

function esErrorTablaFaltante(error: unknown): boolean {
    const e = error as { code?: string; message?: string } | null | undefined;
    if (!e) return false;
    if (e.code === "42P01" || e.code === "PGRST205") return true;
    return typeof e.message === "string" && /os_presencia/i.test(e.message) && /schema cache|does not exist|not exist/i.test(e.message);
}

async function marcarPresencia(uid: string, visible: boolean): Promise<void> {
    if (tablaDeshabilitada) return;
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("os_presencia")
            .upsert({ user_id: uid, visto: new Date().toISOString(), visible }, { onConflict: "user_id" });
        if (error && esErrorTablaFaltante(error)) tablaDeshabilitada = true;
    } catch {
        /* best-effort */
    }
}

/** Late presencia cada 120s mientras la pestaña esté visible; si el usuario eligió "nadie", escribe `visible:false` una vez y para. */
export function useLatidoPresencia(): void {
    const { ajustes, listo } = useAjustesMensajeria();
    const mostrar = ajustes.privacidad.mostrarEnLinea !== "nadie";
    const detenidoRef = useRef(false);

    useEffect(() => {
        if (!listo) return;
        let uid: string | null = null;
        let intervalo: ReturnType<typeof setInterval> | null = null;
        let cancelado = false;

        async function latir(): Promise<void> {
            if (cancelado || !uid || tablaDeshabilitada) return;
            if (!mostrar) {
                if (!detenidoRef.current) {
                    detenidoRef.current = true;
                    await marcarPresencia(uid, false);
                }
                return;
            }
            detenidoRef.current = false;
            if (document.visibilityState === "visible") await marcarPresencia(uid, true);
        }

        function alCambiarVisibilidad(): void {
            if (document.visibilityState === "visible") void latir();
        }

        void (async () => {
            const ref = await currentUserRef();
            if (cancelado) return;
            uid = ref?.id ?? null;
            if (!uid) return;
            void latir();
            intervalo = setInterval(() => void latir(), LATIDO_MS);
            document.addEventListener("visibilitychange", alCambiarVisibilidad);
        })();

        return () => {
            cancelado = true;
            if (intervalo) clearInterval(intervalo);
            document.removeEventListener("visibilitychange", alCambiarVisibilidad);
        };
    }, [listo, mostrar]);
}

export interface EstadoPresencia {
    enLinea: boolean;
    visto: string | null;
}

/** Presencia batched de varios usuarios (reciprocidad: si yo elegí "nadie", nunca veo la de nadie). */
export function usePresencia(userIds: string[]): Record<string, EstadoPresencia> {
    const { ajustes, listo } = useAjustesMensajeria();
    const noComparto = listo && ajustes.privacidad.mostrarEnLinea === "nadie";
    const [estado, setEstado] = useState<Record<string, EstadoPresencia>>({});
    const idsClave = useMemo(() => Array.from(new Set(userIds.filter(Boolean))).sort().join(","), [userIds]);

    useEffect(() => {
        if (noComparto) {
            setEstado({});
            return;
        }
        const ids = idsClave ? idsClave.split(",") : [];
        if (!ids.length || tablaDeshabilitada) {
            setEstado({});
            return;
        }
        let cancelado = false;

        async function consultar(): Promise<void> {
            if (cancelado || tablaDeshabilitada) return;
            try {
                const supabase = createClient();
                const { data, error } = await supabase.from("os_presencia").select("user_id, visto, visible").in("user_id", ids);
                if (error) {
                    if (esErrorTablaFaltante(error)) tablaDeshabilitada = true;
                    return;
                }
                if (cancelado || !Array.isArray(data)) return;
                const ahora = Date.now();
                const siguiente: Record<string, EstadoPresencia> = {};
                for (const fila of data as { user_id: string; visto: string; visible: boolean }[]) {
                    if (!fila.visible) continue;
                    siguiente[fila.user_id] = { enLinea: ahora - Date.parse(fila.visto) < RECIENTE_MS, visto: fila.visto };
                }
                setEstado(siguiente);
            } catch {
                /* best-effort */
            }
        }

        void consultar();
        const intervalo = setInterval(() => {
            if (document.visibilityState === "visible") void consultar();
        }, POLL_PRESENCIA_MS);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
    }, [idsClave, noComparto]);

    return estado;
}

export interface SalaHilo {
    presentes: string[];
    escribiendo: string[];
    anunciarEscribiendo: () => void;
}

/** Presencia en vivo + "escribiendo…" de un hilo (canal `hilo:<id>`, presence key = uid). */
export function useSalaHilo(hiloId: string | null, miUid: string | null): SalaHilo {
    const { ajustes } = useAjustesMensajeria();
    const puedeAnunciar = ajustes.privacidad.mostrarEscribiendo;
    const [presentes, setPresentes] = useState<string[]>([]);
    const [escribiendo, setEscribiendo] = useState<string[]>([]);
    const canalRef = useRef<RealtimeChannel | null>(null);
    const ultimoAnuncioRef = useRef(0);
    const expiraTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        setPresentes([]);
        setEscribiendo([]);
        for (const t of expiraTimers.current.values()) clearTimeout(t);
        expiraTimers.current.clear();
        if (!hiloId || !miUid) return;

        let cancelado = false;
        try {
            const supabase = createClient();
            const channel = supabase.channel(`hilo:${hiloId}`, { config: { presence: { key: miUid } } });
            channel
                .on("presence", { event: "sync" }, () => {
                    if (cancelado) return;
                    setPresentes(Object.keys(channel.presenceState()));
                })
                .on("broadcast", { event: "escribiendo" }, (msg: { payload?: { userId?: string } }) => {
                    const quien = msg?.payload?.userId;
                    if (!quien || quien === miUid) return;
                    setEscribiendo((prev) => (prev.includes(quien) ? prev : [...prev, quien]));
                    const previo = expiraTimers.current.get(quien);
                    if (previo) clearTimeout(previo);
                    expiraTimers.current.set(
                        quien,
                        setTimeout(() => {
                            setEscribiendo((prev) => prev.filter((x) => x !== quien));
                            expiraTimers.current.delete(quien);
                        }, ESCRIBIENDO_EXPIRA_MS),
                    );
                })
                .subscribe((status: string) => {
                    if (status === "SUBSCRIBED") void channel.track({ en: new Date().toISOString() }).catch(() => {});
                });
            canalRef.current = channel;
        } catch {
            /* best-effort: sin realtime, la sala sigue mostrando el hilo sin presencia */
        }

        return () => {
            cancelado = true;
            for (const t of expiraTimers.current.values()) clearTimeout(t);
            expiraTimers.current.clear();
            const canal = canalRef.current;
            canalRef.current = null;
            if (canal) {
                try {
                    createClient().removeChannel(canal);
                } catch {
                    /* noop */
                }
            }
        };
    }, [hiloId, miUid]);

    const anunciarEscribiendo = (): void => {
        if (!hiloId || !miUid || !puedeAnunciar) return;
        const ahora = Date.now();
        if (ahora - ultimoAnuncioRef.current < ESCRIBIENDO_THROTTLE_MS) return;
        ultimoAnuncioRef.current = ahora;
        try {
            void canalRef.current?.send({ type: "broadcast", event: "escribiendo", payload: { userId: miUid } });
        } catch {
            /* best-effort */
        }
    };

    return { presentes, escribiendo, anunciarEscribiendo };
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_ABREV = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function horaHHMM(d: Date): string {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function inicioDia(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "en línea" · "últ. vez hoy a las 14:32" · "…ayer…" · "…el lunes…" (≤6 días) · "…el 12 de sep." Null si no se sabe. */
export function formatearPresencia(p: EstadoPresencia | undefined, ahora: Date = new Date()): string | null {
    if (!p) return null;
    if (p.enLinea) return "en línea";
    if (!p.visto) return null;
    const fecha = new Date(p.visto);
    if (Number.isNaN(fecha.getTime())) return null;
    const diasDif = Math.round((inicioDia(ahora) - inicioDia(fecha)) / 86_400_000);
    const hora = horaHHMM(fecha);
    if (diasDif <= 0) return `últ. vez hoy a las ${hora}`;
    if (diasDif === 1) return `últ. vez ayer a las ${hora}`;
    if (diasDif <= 6) return `últ. vez el ${DIAS_SEMANA[fecha.getDay()]} a las ${hora}`;
    return `últ. vez el ${fecha.getDate()} de ${MESES_ABREV[fecha.getMonth()]}.`;
}
