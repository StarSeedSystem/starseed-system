/**
 * StarSeed XR · DISPOSICIÓN DE LA TRINITY (XR1010J · contrato §3 a).
 * La aritmética espacial vive en el núcleo puro `src/lib/xr/espacio-trinity.ts`; aquí sólo la base
 * de mirada (`siguienteBase`, pura), la lectura del confort (`entradaDeConfort`) y el hook, que
 * recalcula la disposición SOLO al recentrar (acción, voz o `debeRecentrar` evaluado a 2 Hz),
 * nunca por fotograma. La altura de ojos manual manda sobre la medida del visor (XR1010G).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { disponerTrinity, debeRecentrar, type DisposicionTrinity, type EntradaEspacio } from "@/lib/xr/espacio-trinity";
import type { ModoXR } from "@/lib/xr/tipos";
import type { PreferenciasConfort } from "@/lib/xr/confort";
import { usePrefsXR } from "./use-prefs-xr";

/** Escala del sondeo de recentrado: 2 Hz, nunca por fotograma. */
export const SONDEO_RECENTRAR_MS = 500;
/** Cono de recentrado, igual que `debeRecentrar`: 70°. */
export const UMBRAL_CONO_RAD = (70 * Math.PI) / 180;

/** Base de mirada del último (re)centrado; `fueraDesde` marca cuándo la cabeza salió del cono. */
export interface BaseMirada {
    yawBase: number;
    fueraDesde: number | null;
}

/** Entrada del núcleo desde el confort: la altura manual manda sobre la medida, y ambas sobre 1,7 m. */
export function entradaDeConfort(
    confort: PreferenciasConfort,
    modo: ModoXR,
    yawBase: number,
    alturaMedida: number | null,
    techo?: number,
): EntradaEspacio {
    return {
        alturaOjos: confort.alturaOjos ?? (alturaMedida !== null && Number.isFinite(alturaMedida) ? alturaMedida : 1.7),
        postura: confort.postura,
        manoDominante: confort.manoDominante,
        modo,
        yawBase,
        escala: confort.escala,
        techo,
    };
}

/** Nueva base: igual que `debeRecentrar` (3 s fuera del cono de 70°) o la orden «recentrar»; sin saltos. */
export function siguienteBase(estado: BaseMirada, cabeza: { yaw: number }, ahora: number, orden?: "recentrar"): BaseMirada {
    if (orden === "recentrar") return { yawBase: cabeza.yaw, fueraDesde: null };
    const d = Math.abs(Math.atan2(Math.sin(cabeza.yaw - estado.yawBase), Math.cos(cabeza.yaw - estado.yawBase)));
    if (d <= UMBRAL_CONO_RAD) return { yawBase: estado.yawBase, fueraDesde: null };
    const desde = estado.fueraDesde ?? ahora;
    const segundosFuera = (ahora - desde) / 1000;
    // decisión jev: p=0,92 — reutilizar `debeRecentrar` del núcleo en vez de repetir su umbral aquí.
    if (debeRecentrar(cabeza.yaw, estado.yawBase, segundosFuera)) return { yawBase: cabeza.yaw, fueraDesde: null };
    return { yawBase: estado.yawBase, fueraDesde: desde };
}

export interface OpcionesDisposicion {
    /** Modo explícito; si falta se deduce de la sesión WebXR (sin sesión: pantalla 3D). */
    modo?: ModoXR;
    /** Altura de ojos medida por el visor (XR1010G); `null` mientras no la haya. */
    alturaMedida?: number | null;
    /** Altura del techo si se conoce (m). */
    techo?: number;
}

/** Modo de la sesión en curso; sin sesión (pantalla) se previsualiza como 3D en pantalla. */
export const modoDeSesion = (sesion: { mode?: string } | null | undefined): ModoXR =>
    sesion?.mode === "immersive-ar" ? "ar-passthrough" : sesion?.mode === "immersive-vr" ? "vr-inmersivo" : "3d-pantalla";

export function useDisposicionTrinity(o: OpcionesDisposicion): { disposicion: DisposicionTrinity; recentrar: () => void } {
    const { confort } = usePrefsXR();
    const camara = useThree((s) => s.camera);
    const sesion = useXR((s) => s.session);
    const modo = o.modo ?? modoDeSesion(sesion as unknown as { mode?: string } | null);
    const base = useRef<BaseMirada>({ yawBase: 0, fueraDesde: null });
    const euler = useRef(new THREE.Euler());
    const prefs = useRef(confort);
    prefs.current = confort;
    const opciones = useRef(o);
    opciones.current = o;
    opciones.current.modo = modo;

    // SOLO al recentrar o al cambiar algo del confort: ninguna llamada por fotograma.
    const recalcular = useCallback((yaw?: number) => {
        const { alturaMedida, techo } = opciones.current;
        base.current = { yawBase: yaw ?? base.current.yawBase, fueraDesde: null };
        setDisposicion(disponerTrinity(entradaDeConfort(prefs.current, opciones.current.modo ?? "3d-pantalla", base.current.yawBase, alturaMedida ?? null, techo)));
    }, []);
    const [disposicion, setDisposicion] = useState(() =>
        disponerTrinity(entradaDeConfort(confort, modo, base.current.yawBase, o.alturaMedida ?? null, o.techo)),
    );

    const recentrar = useCallback(() => {
        euler.current.setFromQuaternion(camara.quaternion, "YXZ");
        recalcular(euler.current.y);
    }, [camara, recalcular]);

    // Cambios de postura, mano, escala o altura manual re-colocan los nodos; nunca por fotograma.
    useEffect(() => {
        recalcular();
    }, [recalcular, confort.postura, confort.manoDominante, confort.escala, confort.alturaOjos, modo]);

    // debeRecentrar evaluado a 2 Hz: si la base cambia, entonces sí se recalcula la disposición.
    useEffect(() => {
        const reloj = window.setInterval(() => {
            euler.current.setFromQuaternion(camara.quaternion, "YXZ");
            const anterior = base.current.yawBase;
            base.current = siguienteBase(base.current, { yaw: euler.current.y }, performance.now());
            if (base.current.yawBase !== anterior) recalcular();
        }, SONDEO_RECENTRAR_MS);
        return () => window.clearInterval(reloj);
    }, [camara, recalcular]);

    return { disposicion, recentrar };
}
