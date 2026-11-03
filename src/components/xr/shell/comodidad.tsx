"use client";

/**
 * StarSeed XR · COMODIDAD APLICADA (XR1010F · contrato §3 j). Cascarón fino que reúne lo que marea:
 * velocidad de la cabeza → viñeta; giro por saltos (`useEntradaXR` gira el rig con `siguienteGiro`);
 * subtítulos ≥ 1° de Astraura y de la transmisión; movimiento reducido manda (aviso UNA vez).
 * Lógica en funciones puras probadas; el cableado a la escena: XR1010AS.
 */
import { useCallback, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { altoMinimoTexto, aplicarMovimientoReducido, opacidadVineta, siguienteGiro, type PreferenciasConfort } from "../../../lib/xr/confort";
import { disponerTrinity, type DisposicionTrinity } from "../../../lib/xr/espacio-trinity";
import type { ModoXR } from "../../../lib/xr/tipos";
import type { ContextoAcciones } from "./acciones-xr";
import { usePrefsXR } from "./use-prefs-xr";
import { useEntradaXR } from "./use-entrada-xr";
import { Vineta } from "./vineta";
import { Texto3D } from "./panel-cristal";

// ----- Lógica pura (probada sin WebGL) -----
/** Muestra de la cabeza (m, rad, s) y sus velocidades: lineal (m/s) y angular (°/s). */
export interface MuestraCabeza { x: number; y: number; z: number; yaw: number; t: number }
export interface Movimiento { lineal: number; angularGradosS: number }
/** Velocidad de la cabeza entre dos muestras; `dt` acotado a 1 ms–0,25 s para que una pausa no dé picos. */
export function velocidadCabeza(anterior: MuestraCabeza | null, actual: MuestraCabeza): Movimiento {
    if (!anterior) return { lineal: 0, angularGradosS: 0 };
    const dt = Math.min(0.25, Math.max(0.01, actual.t - anterior.t));
    const lineal = Math.hypot(actual.x - anterior.x, actual.y - anterior.y, actual.z - anterior.z) / dt;
    const dyaw = actual.yaw - anterior.yaw;
    return { lineal, angularGradosS: (Math.abs(Math.atan2(Math.sin(dyaw), Math.cos(dyaw))) / dt) * (180 / Math.PI) };
}
/** La disposición para el rig con el confort: `disponerTrinity` centraliza postura, una mano y pestañas. */
export const disposicionConfort = (modo: ModoXR, c: PreferenciasConfort, alturaOjos: number): DisposicionTrinity =>
    disponerTrinity({ modo, postura: c.postura, manoDominante: c.manoDominante, alturaOjos, escala: c.escala });
/** El giro por saltos mueve el rig: nuevo yaw (rad) según el ángulo configurado. */
export const yawTrasSalto = (yaw: number, dir: -1 | 1, c: PreferenciasConfort): number => siguienteGiro(yaw, dir, c);
/** Teletransporte manda si hay movimiento reducido; el aviso se dice UNA vez (`yaDicho`). */
export function locomocionVigente(c: PreferenciasConfort, yaDicho: boolean): { locomocion: PreferenciasConfort["locomocion"]; aviso: string | null } {
    const aviso = c.movimientoReducido && c.locomocion === "continua" && !yaDicho ? "Movimiento reducido: el desplazamiento continuo pasa a teletransporte." : null;
    return { locomocion: aplicarMovimientoReducido(c).locomocion, aviso };
}
/** El texto del subtítulo: Astraura primero; si no, lo que se oye; vacío no se pinta. */
export const textoSubtitulo = (preferido: boolean, fraseAstraura: string | null, deTransmision: string | null): string | null =>
    preferido ? ((fraseAstraura ?? "").trim() || (deTransmision ?? "").trim() || null) : null;

/** Línea del subtítulo: alto (≥ textoMinGrados a `distancia`) y ligeramente bajo la mirada. */
export interface LineaSubtitulo { alto: number; y: number }
export const BAJADA_SUBTITULO_M = 0.12;
export const lineaSubtitulo = (c: PreferenciasConfort, alturaOjos: number, distancia = 1.5): LineaSubtitulo =>
    ({ alto: altoMinimoTexto(distancia, c.textoMinGrados), y: alturaOjos - BAJADA_SUBTITULO_M });
/** Estado de un fotograma: aviso (UNA vez, dura `DURACION_AVISO_S`), viñeta. */
export interface EstadoConfort { anterior: MuestraCabeza | null; dicho: boolean; texto: string | null; hasta: number; opacidad: number }
export const CONFOR_INICIAL: EstadoConfort = { anterior: null, dicho: false, texto: null, hasta: 0, opacidad: 0 };
export const DURACION_AVISO_S = 4;
/** Un fotograma completo, puro: nueva muestra de cabeza → viñeta (0–0,85), aviso de locomoción una sola vez. */
export function pasoConfort(s: EstadoConfort, mue: MuestraCabeza, c: PreferenciasConfort): EstadoConfort {
    const opacidad = opacidadVineta(c, velocidadCabeza(s.anterior, mue));
    const viñeta = Math.abs(s.opacidad - opacidad) > 0.02 ? opacidad : s.opacidad;
    const { aviso: nuevo } = locomocionVigente(c, s.dicho);
    if (nuevo) return { anterior: mue, dicho: true, texto: nuevo, hasta: mue.t + DURACION_AVISO_S, opacidad: viñeta };
    const texto = s.dicho && mue.t < s.hasta ? s.texto : null;
    return { anterior: mue, dicho: s.dicho, texto, hasta: s.hasta, opacidad: viñeta };
}

// ----- Cascarón fino -----
const FRENTE = new THREE.Vector3(0, 0, -1), ROTADO = new THREE.Vector3();
/** ¿Cierra el campo de visión? Solo en inmersivo: en pantalla y AR de mano no hay por qué tapar nada. */
const enInmersivo = (modo: ModoXR): boolean => modo === "vr-inmersivo" || modo === "ar-passthrough";


export interface PropsComodidad {
    modo: ModoXR;
    /** El contexto compartido de acciones; aquí SOLO se sustituye `girar` por el salto del confort. */
    ctx: ContextoAcciones;
    /** Grupo del rig (XROrigin) que gira por saltos; si falta, el padre de la cámara. */
    riga?: THREE.Object3D | null;
    /** Altura de ojos efectiva (m) para el subtítulo. */
    alturaOjos?: number;
    /** Lo que dice Astraura (voz) y lo que se oye de la transmisión (subtítulos). */
    fraseAstraura?: string | null;
    textoTransmision?: string | null;
}

export function Comodidad({ modo, ctx, riga = null, alturaOjos = 1.6, fraseAstraura = null, textoTransmision = null }: PropsComodidad) {
    const { confort } = usePrefsXR();
    const camara = useThree((s) => s.camera);
    const aplicado = useMemo(() => aplicarMovimientoReducido(confort), [confort]);
    const [estado, setEstado] = useState<EstadoConfort>(() => CONFOR_INICIAL);

    const girar = useCallback((dir: -1 | 1) => {
        const destino = riga ?? camara.parent;
        if (destino) destino.rotation.y = yawTrasSalto(destino.rotation.y, dir, aplicado);
    }, [aplicado, riga, camara]);
    useEntradaXR(useMemo(() => ({ ...ctx, girar }), [ctx, girar]));

    useFrame((fotograma) => {
        const cam = fotograma.camera;
        ROTADO.copy(FRENTE).applyQuaternion(cam.quaternion);
        const m: MuestraCabeza = { x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw: Math.atan2(ROTADO.x, -ROTADO.z), t: fotograma.clock.elapsedTime };
        setEstado((antes) => pasoConfort(antes, m, aplicado));
    });

    const linea = lineaSubtitulo(aplicado, alturaOjos);
    const tamano = { distancia: 1.5, grados: aplicado.textoMinGrados } as const;
    const texto = textoSubtitulo(aplicado.subtitulos, fraseAstraura, textoTransmision);
    return (
        <>
            <Vineta opacidad={enInmersivo(modo) ? estado.opacidad : 0} />
            {estado.texto ? (
                <group position={[0, linea.y - linea.alto, -1.5]}>
                    <Texto3D {...tamano} fontSize={linea.alto * 0.8}>{estado.texto}</Texto3D>
                </group>
            ) : null}
            {texto ? (
                <group position={[0, linea.y, -1.5]}>
                    <Texto3D {...tamano} fontSize={linea.alto}>{texto}</Texto3D>
                </group>
            ) : null}
        </>
    );
}
