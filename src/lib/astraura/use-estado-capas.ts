"use client";

/**
 * useEstadoCapas — estado vivo de las capas de conciencia de Astraura 1.58 (Ola 365).
 *
 * Junta la PREFERENCIA (interruptores y nivelador, en `IntelligenceSettings`, que ya se
 * sincroniza con la cuenta) con la SALUD de cada capa, sin crear endpoints ni gastar
 * tráfico de más:
 *  · local / nube → `detectAvailabilitySafe()`, UNA sonda compartida por todos los
 *    indicadores abiertos (módulo), como mucho cada 5 min, solo con la pestaña visible y
 *    solo si esa capa está encendida; entre sondas, cada respuesta del chat que sale por
 *    1.58 ya demuestra que esa capa responde (cero tráfico extra);
 *  · mesh → nodos de la malla + faros cercanos (reactivos, sin sondeo);
 *  · colectiva → estado de la sincronización en tiempo real de la cuenta;
 *  · «sincronizada con el chat» → la última ruta del enrutador salió por una fuente 1.58.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { detectAvailabilitySafe } from "@/ai/astraura/availability";
import { useMeshState, useNearbyBeacons } from "@/ai/astraura/mesh/use-mesh";
import { getIntelligenceSettings, lastRoute, ROUTE_EVENT, saveIntelligenceSettings, type RouteRecord } from "@/ai/astraura/router";
import {
    aCampos,
    estadoCapas,
    leerPreferenciaCapas,
    resumenCapas,
    type CapaConciencia,
    type EstadoCapa,
    type PreferenciaCapas,
    type ResumenCapas,
    type SaludCapas,
} from "@/lib/astraura/capas-conciencia";
import { getRealtimeSyncStatus, onRealtimeSyncStatus, type RealtimeSyncStatus } from "@/lib/sync/realtime-sync";

export const EVENTO_INTELIGENCIA = "starseed:astraura-intelligence";
/** Cada cuánto se vuelve a sondear como mucho. La sonda pasa por el proxy del OS (una
 *  función de Vercel) y el túnel de la Mac: con varias pestañas abiertas, cada minuto
 *  era tráfico de sobra para un indicador. */
export const SONDEO_MS = 5 * 60_000;

type Dispon = { local: boolean | null; nube: boolean | null };

/* ── Sonda compartida (módulo): N indicadores abiertos = 1 sonda por ventana ── */
let dispon: Dispon = { local: null, nube: null };
let sondeadoEn = 0;
let enCurso: Promise<void> | null = null;
const oyentes = new Set<(d: Dispon) => void>();

function publicar(parcial: Partial<Dispon>): void {
    dispon = { ...dispon, ...parcial };
    for (const o of oyentes) {
        try {
            o(dispon);
        } catch {
            /* un oyente roto no para a los demás */
        }
    }
}

/** Sondea local/nube si toca (pestaña visible y dato más viejo que `SONDEO_MS`). */
export function sondearCapas(quiere: { local: boolean; nube: boolean }, ahora = Date.now()): Promise<void> {
    if (!quiere.local && !quiere.nube) return Promise.resolve();
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return Promise.resolve();
    if (enCurso) return enCurso;
    // (5 s de margen: un intervalo puede llegar unos ms antes de la ventana exacta)
    if (sondeadoEn > 0 && ahora - sondeadoEn < SONDEO_MS - 5_000) return Promise.resolve();
    sondeadoEn = ahora;
    enCurso = (async () => {
        try {
            const lista = await detectAvailabilitySafe();
            const de = (id: string) => {
                const a = lista.find((x) => x.source.id === id);
                return a ? a.ready : null;
            };
            publicar({ local: de("astraura-158-local"), nube: de("astraura-158-nube") });
        } catch {
            /* sin datos: la capa queda «sin señal» */
        } finally {
            enCurso = null;
        }
    })();
    return enCurso;
}

/** Solo para pruebas: olvida la sonda compartida. */
export function reiniciarSondaCapas(): void {
    dispon = { local: null, nube: null };
    sondeadoEn = 0;
    enCurso = null;
}

/** PURA: estado de la sincronización de cuenta → la capa colectiva está conectada (o no se sabe). */
export function colectivaDesde(s: RealtimeSyncStatus | null | undefined): boolean | null {
    if (!s) return null;
    if (s.state === "connected") return true;
    if (s.state === "disabled" || s.state === "no-session" || s.state === "error") return false;
    return null;
}

/** PURA: ¿la ruta del chat salió por Astraura 1.58? */
export function rutaUsa158(r: Pick<RouteRecord, "sourceId" | "ok"> | null | undefined): boolean {
    return Boolean(r && r.ok && typeof r.sourceId === "string" && r.sourceId.startsWith("astraura-158"));
}

export interface EstadoCapasVivo {
    preferencia: PreferenciaCapas;
    salud: SaludCapas;
    estados: Record<CapaConciencia, EstadoCapa>;
    resumen: ResumenCapas;
    cambiar: (parcial: Partial<PreferenciaCapas>) => void;
    cambiarCapa: (capa: CapaConciencia, on: boolean) => void;
}

export function useEstadoCapas(): EstadoCapasVivo {
    const [preferencia, setPreferencia] = useState<PreferenciaCapas>(() => leerPreferenciaCapas(getIntelligenceSettings()));
    const [disponVista, setDisponVista] = useState<Dispon>(dispon);
    const [colectiva, setColectiva] = useState<boolean | null>(() => colectivaDesde(getRealtimeSyncStatus()));
    const [chatUsa158, setChatUsa158] = useState<boolean>(() => rutaUsa158(lastRoute()));
    const malla = useMeshState();
    const faros = useNearbyBeacons();

    // Preferencia: se relee al guardarla desde cualquier sitio (y desde otra neurona).
    useEffect(() => {
        const releer = () => setPreferencia(leerPreferenciaCapas(getIntelligenceSettings()));
        window.addEventListener(EVENTO_INTELIGENCIA, releer);
        return () => window.removeEventListener(EVENTO_INTELIGENCIA, releer);
    }, []);

    const quiereLocal = preferencia.activo && preferencia.capas.local;
    const quiereNube = preferencia.activo && preferencia.capas.nube;

    useEffect(() => {
        oyentes.add(setDisponVista);
        setDisponVista(dispon);
        return () => {
            oyentes.delete(setDisponVista);
        };
    }, []);

    useEffect(() => {
        if (!quiereLocal && !quiereNube) return;
        const quiere = { local: quiereLocal, nube: quiereNube };
        void sondearCapas(quiere);
        const t = setInterval(() => void sondearCapas(quiere), SONDEO_MS);
        const alVolver = () => {
            if (document.visibilityState === "visible") void sondearCapas(quiere);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            clearInterval(t);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [quiereLocal, quiereNube]);

    useEffect(() => onRealtimeSyncStatus((s) => setColectiva(colectivaDesde(s))), []);

    useEffect(() => {
        const alRutear = (e: Event) => {
            const r = (e as CustomEvent<RouteRecord>).detail ?? lastRoute();
            setChatUsa158(rutaUsa158(r));
            // Una respuesta que salió por 1.58 ya demuestra que esa capa responde: sin sonda.
            if (r?.ok && r.sourceId === "astraura-158-local") publicar({ local: true });
            if (r?.ok && r.sourceId === "astraura-158-nube") publicar({ nube: true });
        };
        window.addEventListener(ROUTE_EVENT, alRutear);
        return () => window.removeEventListener(ROUTE_EVENT, alRutear);
    }, []);

    const vecinosMesh = (malla?.nodes ?? []).filter((n) => !malla?.self || n.num !== malla.self.num).length + (faros?.length ?? 0);
    const salud: SaludCapas = useMemo(
        () => ({
            local: quiereLocal ? disponVista.local : null,
            nube: quiereNube ? disponVista.nube : null,
            vecinosMesh,
            colectivaConectada: colectiva,
            chatUsa158,
        }),
        [disponVista, quiereLocal, quiereNube, vecinosMesh, colectiva, chatUsa158],
    );

    // Se guarda FUERA del actualizador de estado (en modo estricto React lo llama dos veces).
    const cambiar = useCallback((parcial: Partial<PreferenciaCapas>) => {
        const prev = leerPreferenciaCapas(getIntelligenceSettings());
        const next: PreferenciaCapas = { ...prev, ...parcial, capas: { ...prev.capas, ...(parcial.capas ?? {}) } };
        saveIntelligenceSettings(aCampos(next));
        setPreferencia(next);
    }, []);
    const cambiarCapa = useCallback(
        (capa: CapaConciencia, on: boolean) => {
            const prev = leerPreferenciaCapas(getIntelligenceSettings());
            cambiar({ capas: { ...prev.capas, [capa]: on } });
        },
        [cambiar],
    );

    return {
        preferencia,
        salud,
        estados: estadoCapas(preferencia, salud),
        resumen: resumenCapas(preferencia, salud),
        cambiar,
        cambiarCapa,
    };
}
