"use client";
/** StarSeed XR · COMODIDAD APLICADA (XR1010AF · contrato §3 j). Viñeta con la velocidad real de la
 * cabeza, giro por saltos del rig desde `useEntradaXR`, subtítulos a 1,5 m, postura `una-mano` con
 * pestañas y movimiento reducido que fuerza saltos y prohíbe caminar continuo (lo dice UNA vez). */
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Container } from "@react-three/uikit";
import type { ModoXR } from "@/lib/xr/tipos";
import { disponerTrinity, type DisposicionTrinity } from "@/lib/xr/espacio-trinity";
import { aplicarMovimientoReducido, siguienteGiro, type PreferenciasConfort } from "@/lib/xr/confort";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import type { ContextoAcciones } from "./acciones-xr";
import { useEntradaXR } from "./use-entrada-xr";
import { usePrefsXR } from "./use-prefs-xr";
import { Texto3D } from "./panel-cristal";
import { FijadoALaMirada, Vineta, opacidadMalla } from "./vineta";

export interface MuestraMovimiento { x: number; y: number; z: number; yaw: number; t: number }
export interface Velocidad { lineal: number; angularGradosS: number }
export interface Subtitulo { texto: string; quien: "astraura" | "transmision" }
export type Pestana = "horizon" | "logic";

export function velocidadDe(anterior: MuestraMovimiento | null, actual: MuestraMovimiento): Velocidad {
    if (!anterior) return { lineal: 0, angularGradosS: 0 };
    const dt = (actual.t - anterior.t) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) return { lineal: 0, angularGradosS: 0 };
    const lineal = Math.hypot(actual.x - anterior.x, actual.y - anterior.y, actual.z - anterior.z) / dt;
    const giro = Math.abs(Math.atan2(Math.sin(actual.yaw - anterior.yaw), Math.cos(actual.yaw - anterior.yaw)));
    const angular = (giro * 180) / Math.PI / dt;
    return Number.isFinite(lineal) && Number.isFinite(angular) ? { lineal, angularGradosS: angular } : { lineal: 0, angularGradosS: 0 };
}

export function locomocionEfectiva(c: PreferenciasConfort): { modo: "teletransporte" | "continua" | "ninguna"; aviso: string | null } {
    if (!c.movimientoReducido) return { modo: c.locomocion, aviso: null };
    return { modo: c.locomocion === "ninguna" ? "ninguna" : "teletransporte",
        aviso: c.locomocion === "continua" ? "El movimiento reducido está activo: no se camina de forma continua, se va por saltos." : null };
}

export const subtituloVisible = (c: PreferenciasConfort, s: Subtitulo | null | undefined): boolean =>
    Boolean(s && s.texto.trim().length > 0 && c.subtitulos);

export const textoSubtitulo = (s: Subtitulo): string =>
    `${s.quien === "astraura" ? "Astraura" : "En la transmisión"}: ${s.texto.trim()}`;

export const saltoDe = (yaw: number, dir: -1 | 1, c: PreferenciasConfort): number => siguienteGiro(yaw, dir, c);

export const disposicionDe = (c: PreferenciasConfort, alturaOjos: number, modo: ModoXR = "vr-inmersivo"): DisposicionTrinity =>
    disponerTrinity({ alturaOjos, postura: c.postura, manoDominante: c.manoDominante, modo, yawBase: 0, escala: c.escala });

export const PestanaComodidadContext = createContext<{ pestana: Pestana; elegir: (p: Pestana) => void }>({
    pestana: "horizon", elegir: () => undefined,
});
export interface PropsComodidad {
    subtitulo?: Subtitulo | null;
    alturaOjos?: number | null;
    modo?: ModoXR;
    /** Para que XR1010AS mueva también su propio rig al girar. */
    alGirar?: (yaw: number) => void;
    /** Pestañas de la postura de una mano (Horizon/Logic). */
    pestanas?: boolean;
    children?: ReactNode;
}

const sinEfecto = (): void => undefined;

export function Comodidad({ subtitulo = null, alturaOjos = null, modo = "vr-inmersivo", alGirar, pestanas = true, children }: PropsComodidad) {
    const { confort } = usePrefsXR();
    const c = useMemo(() => aplicarMovimientoReducido(confort), [confort]);
    const rig = useRef<THREE.Group>(null);
    const previo = useRef<MuestraMovimiento | null>(null);
    const dicho = useRef(false);
    const [opacidad, setOpacidad] = useState(0);
    const [pestana, setPestana] = useState<Pestana>("horizon");
    const [aviso, setAviso] = useState<string | null>(null);
    const girar = useCallback((dir: -1 | 1) => {
        const yaw = saltoDe(rig.current?.rotation.y ?? 0, dir, c);
        if (rig.current) rig.current.rotation.y = yaw;
        alGirar?.(yaw);
    }, [c, alGirar]);
    const contexto = useMemo<ContextoAcciones>(() => ({ recentrar: sinEfecto, salir: async () => undefined, abrirMenuMano: sinEfecto,
        abrirDock: sinEfecto, hablar: sinEfecto, atras: sinEfecto, seleccionar: sinEfecto, agarrar: sinEfecto, teletransporte: sinEfecto, girar }), [girar]);
    useEntradaXR(contexto);
    useEffect(() => {
        const { aviso: texto } = locomocionEfectiva(confort);
        if (texto && !dicho.current) { dicho.current = true; setAviso(texto); }
    }, [confort]);
    useFrame(({ camera }) => {
        const adelante = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const muestra = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: Math.atan2(adelante.x, -adelante.z), t: performance.now() };
        const v = velocidadDe(previo.current, muestra);
        previo.current = muestra;
        const siguiente = opacidadMalla(c, v);
        setOpacidad((antes) => (Math.abs(antes - siguiente) < 0.01 ? antes : siguiente));
    });
    const d = useMemo(() => disposicionDe(c, alturaOjos ?? 1.6, modo), [c, alturaOjos, modo]);
    const unaMano = pestanas && d.nodos.logic.visible === false && d.nodos.logic.agrupadoCon === "horizon";
    return (
        <PestanaComodidadContext.Provider value={{ pestana, elegir: setPestana }}>
            {children ? <group ref={rig}>{children}</group> : null}
            <Vineta opacidad={opacidad} />
            {subtituloVisible(c, subtitulo) && subtitulo ? (
                <FijadoALaMirada posicion={[0, -0.18, -1.5]}><Texto3D distancia={1.5}>{textoSubtitulo(subtitulo)}</Texto3D></FijadoALaMirada>
            ) : null}
            {aviso ? <FijadoALaMirada posicion={[0, -0.34, -1.5]}><Texto3D distancia={1.5} tono="textoSecundario">{aviso}</Texto3D></FijadoALaMirada> : null}
            {unaMano ? (
                <FijadoALaMirada posicion={[0, -0.42, -1.2]}>
                    <Container flexDirection="row" gap={8}>
                        {(["horizon", "logic"] as const).map((id) => (
                            <Container key={id} onClick={() => setPestana(id)} cursor="pointer" padding={6}
                                backgroundColor={id === pestana ? CRISTAL.borde.color : CRISTAL.fondoB.color}>
                                <Texto3D distancia={1.2}>{id === pestana ? `▶ ${id === "horizon" ? "Horizonte" : "Logic"}` : id === "horizon" ? "Horizonte" : "Logic"}</Texto3D>
                            </Container>
                        ))}
                    </Container>
                </FijadoALaMirada>
            ) : null}
        </PestanaComodidadContext.Provider>
    );
}
