"use client";
/**
 * StarSeed XR · DISPOSICIÓN DE LA TRINITY (XR1010J · contrato §3 a). Parte pura (`siguienteBase`,
 * `alturaOjosEfectiva`, `calculaDisposicion`, `igualDisposicion`) + hook `useDisposicionTrinity`.
 * La disposición núcleo NUNCA se recalcula por fotograma: solo al cambiar postura, mano, escala,
 * modo, altura de ojos o al RECENTRAR (acción `recentrar`, voz «recentra» o `debeRecentrar` a 2 Hz).
 * `ahora` y `fueraDesde` van en SEGUNDOS de un mismo reloj (Date.now()/1000 en el hook).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { aRadianes, type Mano, type ModoXR, type Postura } from "@/lib/xr/tipos";
import { debeRecentrar, disponerTrinity, type DisposicionTrinity } from "@/lib/xr/espacio-trinity";
import { usePrefsXR } from "./use-prefs-xr";

/** Base: hacia dónde miraba la persona al (re)centrar y desde cuándo está fuera. */
export interface EstadoBase {
    yawBase: number;
    fueraDesde: number | null;
}

/** El núcleo recentra solo si la cabeza lleva ≥ 3 s mirando a > 70° de la base. */
export const UMBRAL_YAW = aRadianes(70);

const desvio = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * Paso de estado puro. `orden: "recentrar"` manda siempre. Sin orden: al pasar el umbral marca
 * `fueraDesde` la primera vez y delega la decisión en `debeRecentrar` del núcleo. La base NO salta
 * por un giro puntual menor que el umbral.
 */
export function siguienteBase(estado: EstadoBase, cabeza: { yaw: number }, ahora: number, orden?: "recentrar"): EstadoBase {
    if (orden === "recentrar") return { yawBase: cabeza.yaw, fueraDesde: null };
    if (!Number.isFinite(cabeza.yaw)) return estado;
    if (desvio(cabeza.yaw, estado.yawBase) <= UMBRAL_YAW) return { yawBase: estado.yawBase, fueraDesde: null };
    const desde = estado.fueraDesde ?? ahora;
    if (debeRecentrar(cabeza.yaw, estado.yawBase, ahora - desde)) return { yawBase: cabeza.yaw, fueraDesde: null };
    return { yawBase: estado.yawBase, fueraDesde: desde };
}

/** La altura de ojos MANUAL manda; si no la hay, la medida del visor (XR1010G); si falta, 1,6 m. */
export function alturaOjosEfectiva(manual: number | null, medida: number | null | undefined): number {
    if (manual !== null && Number.isFinite(manual)) return manual;
    if (medida != null && Number.isFinite(medida)) return medida;
    return 1.6;
}

/** Todo lo que entra a `disponerTrinity`; solo se recalcula cuando esto cambia. */
export interface EntradasDisposicion { yawBase: number; postura: Postura; manoDominante: Mano; modo: ModoXR; escala: number; alturaOjos: number }

/** La disposición del núcleo, según las entradas (AQUÍ se centraliza para que sea probada). */
export function calculaDisposicion(e: EntradasDisposicion): DisposicionTrinity {
    return disponerTrinity({
        alturaOjos: e.alturaOjos, postura: e.postura, manoDominante: e.manoDominante,
        modo: e.modo, yawBase: e.yawBase, escala: e.escala,
    });
}

/** ¿Cambió algo que obligue a recalcular? La prueba la usa como «recalcula solo si cambió algo». */
export function igualDisposicion(a: EntradasDisposicion, b: EntradasDisposicion): boolean {
    return a.yawBase === b.yawBase && a.postura === b.postura && a.manoDominante === b.manoDominante
        && a.modo === b.modo && a.escala === b.escala && a.alturaOjos === b.alturaOjos;
}

export interface OpcionesDisposicion {
    modo: ModoXR;
    /** Yaw de la cabeza (rad, 0 = hacia -z): número o función (el rig la lee de la cámara). */
    yawCabeza?: number | (() => number);
    /** Altura de ojos medida por el visor (XR1010G); manda la manual del confort. */
    alturaOjosMedida?: number | null;
}

export interface ResultadoDisposicion {
    disposicion: DisposicionTrinity;
    recentrar: () => void;
}

/** Hook del rig: lee el confort, evalúa el recentrado a 2 Hz y solo recalcula al recentrar. */
export function useDisposicionTrinity(o: OpcionesDisposicion): ResultadoDisposicion {
    const { confort } = usePrefsXR();
    const [estado, setEstado] = useState<EstadoBase>(() => ({ yawBase: 0, fueraDesde: null }));

    const leerYaw = useCallback((): number | null => {
        if (typeof o.yawCabeza === "function") {
            const y = o.yawCabeza();
            return Number.isFinite(y) ? y : null;
        }
        return typeof o.yawCabeza === "number" && Number.isFinite(o.yawCabeza) ? o.yawCabeza : null;
    }, [o.yawCabeza]);

    // `debeRecentrar` a 2 Hz con temporizador: nunca por fotograma.
    useEffect(() => {
        const tick = (): void => {
            const yaw = leerYaw();
            if (yaw !== null) setEstado((e) => siguienteBase(e, { yaw }, Date.now() / 1000));
        };
        const reloj = window.setInterval(tick, 500);
        return () => window.clearInterval(reloj);
    }, [leerYaw]);

    const recentrar = useCallback(() => {
        const yaw = leerYaw();
        setEstado((e) => siguienteBase(e, { yaw: yaw ?? e.yawBase }, Date.now() / 1000, "recentrar"));
    }, [leerYaw]);

    const altura = alturaOjosEfectiva(confort.alturaOjos, o.alturaOjosMedida);
    const entradas = useMemo<EntradasDisposicion>(
        () => ({
            yawBase: estado.yawBase, postura: confort.postura, manoDominante: confort.manoDominante,
            modo: o.modo, escala: confort.escala, alturaOjos: altura,
        }),
        [estado.yawBase, confort.postura, confort.manoDominante, confort.escala, o.modo, altura],
    );
    const disposicion = useMemo(() => calculaDisposicion(entradas), [entradas]);
    return { disposicion, recentrar };
}
