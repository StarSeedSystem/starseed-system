"use client";

/**
 * DespiertoWebMontaje (tarea 1101) — cableado del helper despierto-web (2026-11-02).
 * Montado una sola vez en el layout raíz: pide la Screen Wake Lock del navegador
 * mientras ESTA pestaña sostenga un proceso largo (transmisión, estación,
 * contenedor) y la suelta al acabar o al ocultarse la pestaña; vuelve a pedirla
 * al ser visible. Todas las decisiones pasan por `decidirDespiertoWeb`, PURA.
 *
 * Quién empieza o acaba un proceso largo avisa por un evento de ventana:
 *   window.dispatchEvent(new CustomEvent(EVENTO_DESPIERTO, { detail: { id, enMarcha } }))
 *   (o, equivalente, `avisarProcesoLargo(id, enMarcha)` de este módulo).
 * La estación en vivo no necesita aviso: se detecta sola por `estacionGlobal`.
 * El «contenedor de agentes» aún no tiene proceso que lo anuncie; el bus ya le
 * deja sitio. Límite honesto (`avisoDespiertoWeb`): el navegador NO puede
 * mantener el equipo despierto con la pantalla cerrada.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEstacionGlobal } from "@/lib/estaciones/estacion-global";
import {
    PROCESOS_LARGOS,
    avisoDespiertoWeb,
    decidirDespiertoWeb,
    esProcesoLargo,
    etiquetaProcesoLargo,
    type ProcesoLargo,
} from "@/lib/install/despierto-web";

export const EVENTO_DESPIERTO = "starseed:despierto-web";

export interface DetalleDespiertoWeb {
    id: string;
    enMarcha: boolean;
}

/** Avisa al montaje global que esta pestaña empieza o acaba un proceso largo. */
export function avisarProcesoLargo(id: string, enMarcha: boolean): void {
    window.dispatchEvent(new CustomEvent<DetalleDespiertoWeb>(EVENTO_DESPIERTO, { detail: { id, enMarcha } }));
}

interface Sentinela {
    release(): Promise<void>;
    addEventListener(tipo: string, oyente: () => void): void;
}

function wakeLockDelNavegador(): { request(t: "screen"): Promise<Sentinela> } | null {
    if (typeof navigator === "undefined") return null;
    const wl = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;
    return (wl as { request(t: "screen"): Promise<Sentinela> } | undefined) ?? null;
}

export function DespiertoWebMontaje() {
    const [activos, setActivos] = useState<Set<ProcesoLargo>>(new Set());
    const [visible, setVisible] = useState(true);
    const [vuelta, setVuelta] = useState(0);
    const senal = useRef<Sentinela | null>(null);
    const notificados = useRef(new Set<ProcesoLargo>());

    useEffect(() => {
        const alEvento = (ev: Event) => {
            const d = (ev as CustomEvent<DetalleDespiertoWeb>).detail;
            const id = d?.id;
            if (!id || !esProcesoLargo(id)) return;
            setActivos((prev) => {
                const n = new Set(prev);
                if (id === "estacion") return prev;
                if (d.enMarcha ? n.has(id) : !n.has(id)) return prev;
                if (d.enMarcha) n.add(id);
                else n.delete(id);
                return n;
            });
        };
        window.addEventListener(EVENTO_DESPIERTO, alEvento);
        return () => window.removeEventListener(EVENTO_DESPIERTO, alEvento);
    }, []);

    // El navegador suelta el bloqueo al ocultarse: se reevalúa al volver a ser visible.
    useEffect(() => {
        setVisible(document.visibilityState === "visible");
        const v = () => setVisible(document.visibilityState === "visible");
        document.addEventListener("visibilitychange", v);
        return () => document.removeEventListener("visibilitychange", v);
    }, []);

    const foto = useEstacionGlobal();
    const estacionAire = foto.fila !== null || foto.motor.sonando;
    const enMarcha = PROCESOS_LARGOS.find((p) => activos.has(p) || (p === "estacion" && estacionAire)) ?? null;

    // Aviso honesto, una vez por proceso que empieza en esta pestaña.
    useEffect(() => {
        if (!enMarcha || notificados.current.has(enMarcha)) return;
        notificados.current.add(enMarcha);
        toast.info(
            `${etiquetaProcesoLargo(enMarcha)} · ${avisoDespiertoWeb(Boolean(wakeLockDelNavegador()))}`,
            { duration: 7000 },
        );
    }, [enMarcha]);

    // Decide y aplica: pedir, soltar o nada, según el módulo puro.
    useEffect(() => {
        let vivo = true;
        const accion = decidirDespiertoWeb({
            proceso: enMarcha,
            visible,
            soportaWakeLock: Boolean(wakeLockDelNavegador()),
            tieneBloqueo: senal.current !== null,
        });
        if (accion === "pedir") {
            void wakeLockDelNavegador()?.request("screen").then(
                (s) => {
                    if (!vivo) {
                        void s.release().catch(() => undefined);
                        return;
                    }
                    senal.current = s;
                    setVuelta((v) => v + 1);
                    s.addEventListener("release", () => {
                        if (senal.current === s) {
                            senal.current = null;
                            setVuelta((v) => v + 1);
                        }
                    });
                },
                () => undefined,
            );
        } else if (accion === "soltar") {
            const s = senal.current;
            senal.current = null;
            void s?.release().catch(() => undefined);
            setVuelta((v) => v + 1);
        }
        return () => {
            vivo = false;
        };
    }, [enMarcha, visible, vuelta]);

    // Al desmontar la pestaña entera, no se deja ningún bloqueo vivo.
    useEffect(
        () => () => {
            const s = senal.current;
            senal.current = null;
            void s?.release().catch(() => undefined);
        },
        [],
    );

    return null;
}

export default DespiertoWebMontaje;
