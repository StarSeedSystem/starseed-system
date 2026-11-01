'use client';
/**
 * StarSeed XR · COMODIDAD APLICADA (XR1010AF, contrato §3 j): calcula la velocidad lineal/angular de
 * la cabeza por fotograma y alimenta la viñeta; aplica el giro por saltos (giro-izquierda/derecha
 * llegan del ctx.girar del anfitrión por EVENTO_GIRO); subtítulos 3D de Astraura y la transmisión;
 * en una mano la Trinity agrupa en pestañas; el movimiento reducido manda. Lógica pura y probada.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { aGrados } from "@/lib/xr/tipos";
import { aplicarMovimientoReducido, altoMinimoTexto, opacidadVineta, siguienteGiro } from "@/lib/xr/confort";
import type { PreferenciasConfort } from "@/lib/xr/confort";
import { TEXTO_MIN_DEG, type DisposicionTrinity } from "@/lib/xr/espacio-trinity";
import type { ModoXR } from "@/lib/xr/tipos";
import { calculaDisposicion } from "./use-disposicion";
import { usePrefsXR } from "./use-prefs-xr";
import { Vineta } from "./vineta";
export const AVANCE_SUBTITULO_M = 1.5;
export const EVENTO_GIRO = "starseed:xr-giro";
/** Un punto de la cabeza (m) y su yaw (rad); una velocidad m/s y °/s para la viñeta. */
export interface MuestraCabeza { x: number; y: number; z: number; yaw: number }
export interface VelocidadCabeza { lineal: number; angularGradosS: number }
function muestraDe(camara: { position?: { x: number; y: number; z: number }; rotation?: { y?: number } }): MuestraCabeza {
    const p = camara.position ?? { x: 0, y: 0, z: 0 };
    const yaw = camara.rotation?.y;
    return { x: p.x, y: p.y, z: p.z, yaw: typeof yaw === "number" && Number.isFinite(yaw) ? yaw : Number.NaN };
}
/** Velocidad entre dos muestras (dt en s): horizontal (x, z) y giro con envoltura segura. */
export function velocidadCabeza(previa: MuestraCabeza | null, actual: MuestraCabeza, dt: number): VelocidadCabeza {
    if (!previa || !Number.isFinite(dt) || dt <= 0) return { lineal: 0, angularGradosS: 0 };
    const giro = Number.isFinite(actual.yaw) && Number.isFinite(previa.yaw)
        ? aGrados(Math.abs(Math.atan2(Math.sin(actual.yaw - previa.yaw), Math.cos(actual.yaw - previa.yaw)))) / dt
        : 0;
    return { lineal: Math.hypot(actual.x - previa.x, actual.z - previa.z) / dt, angularGradosS: giro };
}
/** Giro por saltos: `siguienteGiro` del núcleo, alineado a la rejilla; sin yaw leído, no gira. */
export function aplicarGiro(yaw: number, dir: -1 | 1, confort: PreferenciasConfort): number {
    return Number.isFinite(yaw) ? siguienteGiro(yaw, dir, confort) : 0;
}
export function opacidadComodidad(c: PreferenciasConfort, mov: { lineal: number; angularGradosS: number }): number {
    return opacidadVineta(aplicarMovimientoReducido(c), mov);
}
/** Locomoción final: el movimiento reducido (preferido o del sistema) convierte «continua» en teletransporte. */
export function locomocionEfectiva(c: PreferenciasConfort, sistemaReducido = false): PreferenciasConfort["locomocion"] {
    return aplicarMovimientoReducido(sistemaReducido ? { ...c, movimientoReducido: true } : c).locomocion;
}
/** El aviso del movimiento reducido se muestra UNA vez aunque venga repetido en la lista. */
export function avisoReducidoUnaVez(avisos: readonly string[]): string | null {
    for (const aviso of avisos) if (aviso.includes("movimiento reducido")) return aviso;
    return null;
}
/** Alto (m) de la línea de subtítulo a `AVANCE_SUBTITULO_M` m, nunca por debajo de 1° de arco. */
export function altoSubtitulo(confort: PreferenciasConfort): number {
    return altoMinimoTexto(AVANCE_SUBTITULO_M, Math.max(TEXTO_MIN_DEG, confort.textoMinGrados));
}
/** En una mano, Horizon y Logic comparten panel en pestañas (contrato §3 a, vía calculaDisposicion). */
export function agrupaPestanas(confort: PreferenciasConfort, modo: ModoXR = "vr-inmersivo"): boolean {
    const d: DisposicionTrinity = calculaDisposicion({
        yawBase: 0, postura: confort.postura, manoDominante: confort.manoDominante, modo,
        escala: confort.escala, alturaOjos: confort.alturaOjos ?? 1.6,
    });
    return confort.postura === "una-mano" && d.nodos.logic.agrupadoCon === "horizon";
}
/** Orden de giro para `EVENTO_GIRO` (la manda el `ctx.girar` del anfitrión; XR1010AS lo cablea). */
export function emitirGiro(dir: -1 | 1): void {
    window.dispatchEvent(new CustomEvent(EVENTO_GIRO, { detail: { dir } }));
}
export interface PropsComodidad {
    /** Lo que dice Astraura (lo escribe el puente de voz XR1010P) y lo que se oye de la transmisión. */
    fraseAstraura?: string;
    transmision?: string;
}
export function Comodidad({ fraseAstraura = "", transmision = "" }: PropsComodidad) {
    const { confort } = usePrefsXR();
    const efectivo = aplicarMovimientoReducido(confort);
    const camara = useThree((estado) => estado.camera);
    const previa = useRef<MuestraCabeza | null>(null);
    const tAnterior = useRef(0);
    const [movimiento, setMovimiento] = useState<VelocidadCabeza>({ lineal: 0, angularGradosS: 0 });
    useFrame((estado) => {        const t = estado.clock.elapsedTime; const dt = t - tAnterior.current;
        if (dt < 0.05) return;
        tAnterior.current = t;
        const muestra = muestraDe(camara);
        setMovimiento(velocidadCabeza(previa.current, muestra, dt));
        previa.current = muestra;
    });
    useGiroSalto(camara, efectivo);
    const alto = altoSubtitulo(efectivo);
    return (
        <>
            <Vineta opacidad={opacidadComodidad(confort, movimiento)} />
            {efectivo.subtitulos && fraseAstraura !== "" && (
                <group position={[0, -0.22, -AVANCE_SUBTITULO_M]} data-testid="subtitulo-astraura">
                    <Text fontSize={alto} anchorX="center" anchorY="bottom">Astraura: {fraseAstraura}</Text>
                </group>
            )}
            {efectivo.subtitulos && transmision !== "" && (
                <group position={[0, -0.36, -AVANCE_SUBTITULO_M]} data-testid="subtitulo-transmision">
                    <Text fontSize={alto} anchorX="center" anchorY="bottom">Transmisión: {transmision}</Text>
                </group>
            )}
        </>
    );
}
function useGiroSalto(camara: { parent?: { rotation?: { y?: number } } | null }, confort: PreferenciasConfort): void {
    useEffect(() => {
        const alOir = (evento: Event) => {
            const dir = (evento as CustomEvent<{ dir?: number }>).detail?.dir === 1 ? 1 : -1;
            const rig = camara.parent;
            if (!rig || typeof rig.rotation !== "object" || rig.rotation === null) return;
            const actual = typeof rig.rotation.y === "number" && Number.isFinite(rig.rotation.y) ? rig.rotation.y : 0;
            rig.rotation.y = aplicarGiro(actual, dir, confort);
        };
        window.addEventListener(EVENTO_GIRO, alOir);
        return () => window.removeEventListener(EVENTO_GIRO, alOir);
    }, [camara, confort]);
}
export default Comodidad;