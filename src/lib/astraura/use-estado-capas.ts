"use client";

/**
 * useEstadoCapas — estado vivo de las capas de conciencia de Astraura 1.58 (Ola 365).
 *
 * Junta la PREFERENCIA (interruptores y nivelador, en `IntelligenceSettings`, que ya se
 * sincroniza con la cuenta) con la SALUD de cada capa, sin crear endpoints ni gastar
 * tráfico de más:
 *  · local / nube → `detectAvailabilitySafe()` (con su propia caché de 60 s), al montar y
 *    cada 60 s, solo con la pestaña visible y solo si esa capa está encendida;
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
const SONDEO_MS = 60_000;

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
    const [dispon, setDispon] = useState<{ local: boolean | null; nube: boolean | null }>({ local: null, nube: null });
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
        if (!quiereLocal && !quiereNube) return;
        let vivo = true;
        const sondear = async () => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
            try {
                const lista = await detectAvailabilitySafe();
                if (!vivo) return;
                const lista158 = (id: string) => {
                    const a = lista.find((x) => x.source.id === id);
                    return a ? a.ready : null;
                };
                setDispon({ local: quiereLocal ? lista158("astraura-158-local") : null, nube: quiereNube ? lista158("astraura-158-nube") : null });
            } catch {
                /* sin datos: la capa queda «sin señal» */
            }
        };
        void sondear();
        const t = setInterval(() => void sondear(), SONDEO_MS);
        const alVolver = () => {
            if (document.visibilityState === "visible") void sondear();
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            clearInterval(t);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [quiereLocal, quiereNube]);

    useEffect(() => onRealtimeSyncStatus((s) => setColectiva(colectivaDesde(s))), []);

    useEffect(() => {
        const alRutear = (e: Event) => setChatUsa158(rutaUsa158((e as CustomEvent<RouteRecord>).detail ?? lastRoute()));
        window.addEventListener(ROUTE_EVENT, alRutear);
        return () => window.removeEventListener(ROUTE_EVENT, alRutear);
    }, []);

    const vecinosMesh = (malla?.nodes ?? []).filter((n) => !malla?.self || n.num !== malla.self.num).length + (faros?.length ?? 0);
    const salud: SaludCapas = useMemo(
        () => ({ local: dispon.local, nube: dispon.nube, vecinosMesh, colectivaConectada: colectiva, chatUsa158 }),
        [dispon, vecinosMesh, colectiva, chatUsa158],
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
