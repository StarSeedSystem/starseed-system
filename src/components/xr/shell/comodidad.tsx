"use client";
/**
 * StarSeed XR · COMODIDAD APLICADA (XR1010AF · contrato `architecture/starseed-xr.md` §3 j).
 * Lee `usePrefsXR().confort` y aplica viñeta según la velocidad de la cabeza, giro por saltos,
 * subtítulos de Astraura y de la transmisión, postura de una mano (pestañas de la Trinity) y
 * movimiento reducido (saltos, viñeta y sin caminar continuo). La lógica pura vive aquí y se
 * prueba sin WebGL; el lienzo solo pinta. La locomoción por defecto es el teletransporte.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { aplicarMovimientoReducido, opacidadVineta, siguienteGiro, type PreferenciasConfort } from "../../../lib/xr/confort";
import { TEXTO_MIN_DEG, disponerTrinity, type DisposicionTrinity } from "../../../lib/xr/espacio-trinity";
import type { ModoXR, Vec3 } from "../../../lib/xr/tipos";
import type { ContextoAcciones } from "./acciones-xr";
import { useEntradaXR } from "./use-entrada-xr";
import { usePrefsXR } from "./use-prefs-xr";
import { Texto3D } from "./panel-cristal";
import { Vineta } from "./vineta";
export interface PosaCabeza { posicion: Vec3; yaw: number }
export interface VelocidadCabeza { lineal: number; angularGradosS: number }
/** Velocidad de la cabeza/rig entre dos fotogramas; un delta roto o enorme no dispara la viñeta. */
export function velocidadDeCabeza(a: PosaCabeza, b: PosaCabeza, dtSegundos: number): VelocidadCabeza {
    const dt = Number.isFinite(dtSegundos) && dtSegundos > 0 ? Math.min(dtSegundos, 0.5) : 0;
    if (dt === 0) return { lineal: 0, angularGradosS: 0 };
    const d = Math.hypot(b.posicion[0] - a.posicion[0], b.posicion[1] - a.posicion[1], b.posicion[2] - a.posicion[2]);
    const r = Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)));
    return { lineal: d / dt, angularGradosS: (r * 180) / Math.PI / dt };
}
/** El movimiento reducido manda sobre todo: saltos, viñeta siempre y teletransporte. */
export const confortEfectivo = (c: PreferenciasConfort): PreferenciasConfort => aplicarMovimientoReducido(c);
export const giroDeAccion = (yaw: number, dir: -1 | 1, c: PreferenciasConfort): number => siguienteGiro(yaw, dir, c);

/** Opacidad de la viñeta en este fotograma (la cuenta y el tope de 0,85 son del núcleo). */
export function opacidadDeFotograma(c: PreferenciasConfort, anterior: PosaCabeza, actual: PosaCabeza, dt: number): number {
    return opacidadVineta(confortEfectivo(c), velocidadDeCabeza(anterior, actual, dt));
}

export interface OpcionesDisposicion { modo: ModoXR; alturaOjos: number; yawBase?: number }
/** Trinity según la postura: en `una-mano`, Logic se agrupa con Horizon en pestañas. */
export const disposicionDeConfort = (c: PreferenciasConfort, o: OpcionesDisposicion): DisposicionTrinity =>
    disponerTrinity({ alturaOjos: o.alturaOjos, postura: c.postura, manoDominante: c.manoDominante, modo: o.modo, yawBase: o.yawBase, escala: c.escala });

export interface VocesSubtitulo { astraura?: string | null; transmision?: string | null }
const limpio = (t?: string | null): string => (typeof t === "string" ? t.trim() : "");
/** Una sola línea con lo que dice Astraura y lo que se oye de la transmisión; `null` = sin subtítulos. */
export function subtituloDe(c: PreferenciasConfort, voces: VocesSubtitulo): string | null {
    if (!c.subtitulos) return null;
    const partes = [limpio(voces.astraura), limpio(voces.transmision)].filter(Boolean);
    return partes.length > 0 ? partes.join(" · ") : null;
}

export const AVISO_REDUCIDO = "El movimiento reducido está activo: giro por saltos, viñeta encendida y sin caminar continuo.";

/** Solo avisa cuando hay conflicto: la persona eligió continuo y el movimiento reducido lo anula. */
export function avisoMovimientoReducido(c: PreferenciasConfort): string | null {
    return c.movimientoReducido && (c.locomocion === "continua" || c.giro === "continuo") ? AVISO_REDUCIDO : null;
}
const NADA = (): void => undefined, SALIR = async (): Promise<void> => undefined;
const POS = new Vector3(), FRENTE = new Vector3();

export interface VistaComodidad { confort: PreferenciasConfort; disposicion: DisposicionTrinity; opacidad: number }
export interface PropsComodidad {
    modo: ModoXR; alturaOjos: number; yawActual: () => number; alGirar: (yawNuevo: number) => void;
    acciones?: Partial<ContextoAcciones>; astraura?: string | null; transmision?: string | null;
    children?: ReactNode | ((vista: VistaComodidad) => ReactNode);
}

/** Subtítulo a 1,5 m, un poco por debajo de la mirada y con el mínimo de 1° de arco. */
function LineaViva({ texto }: { texto: string }) {
    const camara = useThree((s) => s.camera), grupo = useRef<Group>(null);
    useFrame(() => {
        const g = grupo.current; if (!g) return;
        camara.getWorldPosition(g.position); camara.getWorldQuaternion(g.quaternion);
        g.translateY(-0.2); g.translateZ(-1.5);
    });
    return <group ref={grupo}><Texto3D distancia={1.5} grados={TEXTO_MIN_DEG}>{texto}</Texto3D></group>;
}

export function Comodidad(o: PropsComodidad) {
    const { confort } = usePrefsXR();
    const efectivo = useMemo(() => confortEfectivo(confort), [confort]);
    const efectivoRef = useRef(efectivo); efectivoRef.current = efectivo;
    const [yaw, setYaw] = useState(() => o.yawActual());
    const yawRef = useRef(yaw);
    const [opacidad, setOpacidad] = useState(0);
    const anterior = useRef<PosaCabeza | null>(null);
    const disposicion = useMemo(() => disposicionDeConfort(efectivo, { modo: o.modo, alturaOjos: o.alturaOjos, yawBase: yaw }), [efectivo, o.modo, o.alturaOjos, yaw]);
    const girar = useCallback((dir: -1 | 1) => {
        const nuevo = giroDeAccion(yawRef.current, dir, efectivoRef.current);
        yawRef.current = nuevo; setYaw(nuevo); o.alGirar(nuevo);
    }, [o]);
    useEntradaXR({ recentrar: NADA, salir: SALIR, abrirMenuMano: NADA, abrirDock: NADA, hablar: NADA, atras: NADA, seleccionar: NADA, agarrar: NADA, teletransporte: NADA, ...o.acciones, girar });
    useFrame((estado, delta) => {
        estado.camera.getWorldPosition(POS); estado.camera.getWorldDirection(FRENTE);
        const actual: PosaCabeza = { posicion: [POS.x, POS.y, POS.z], yaw: Math.atan2(FRENTE.x, -FRENTE.z) };
        const previa = anterior.current; anterior.current = actual;
        if (previa === null) return;
        const nueva = opacidadDeFotograma(efectivoRef.current, previa, actual, delta);
        setOpacidad((vieja) => (Math.abs(vieja - nueva) < 0.02 ? vieja : nueva));
    });
    const linea = subtituloDe(efectivo, { astraura: o.astraura, transmision: o.transmision });
    const aviso = avisoMovimientoReducido(confort);
    const avisado = useRef(false);
    const [avisoVisible, setAvisoVisible] = useState(false);
    useEffect(() => {
        if (aviso === null || avisado.current) return;
        avisado.current = true; setAvisoVisible(true);
        const reloj = window.setTimeout(() => setAvisoVisible(false), 6000);
        return () => window.clearTimeout(reloj);
    }, [aviso]);
    return (
        <>
            <Vineta opacidad={opacidad} />
            {typeof o.children === "function" ? o.children({ confort: efectivo, disposicion, opacidad }) : o.children}
            {linea !== null && <LineaViva texto={linea} />}
            {avisoVisible && aviso !== null && <LineaViva texto={aviso} />}
        </>
    );
}
