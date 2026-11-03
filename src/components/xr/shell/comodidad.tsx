"use client";

/**
 * StarSeed XR · COMODIDAD (XR1010AF · contrato §3 j). (1) velocidad de la cabeza por fotograma →
 * viñeta; (2) giro por saltos de `useEntradaXR` con `siguienteGiro`; (3) subtítulos (≥1°) de
 * Astraura y de la transmisión; (4) postura de una mano; (5) movimiento reducido manda: saltos,
 * sin caminar continuo, y la locomoción continua pedida se avisa UNA vez. Lógica pura arriba.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ANGULOS_SALTO, CONFORT_DEFECTO, aplicarMovimientoReducido, opacidadVineta, siguienteGiro, type AnguloSalto, type PreferenciasConfort } from "../../../lib/xr/confort";
import { disponerTrinity, type DisposicionTrinity } from "../../../lib/xr/espacio-trinity";
import type { ContextoAcciones } from "./acciones-xr";
import { useEntradaXR } from "./use-entrada-xr";
import { usePrefsXR } from "./use-prefs-xr";
import { Texto3D } from "./panel-cristal";
import { Vineta } from "./vineta";
export interface PoseCabeza { yaw: number; x: number; y: number; z: number }
export interface VelocidadCabeza { lineal: number; angularGradosS: number }
/** Velocidad lineal (m/s) y angular (grados/s) entre dos poses; dt ≤ 0 o sin pose previa da 0. */
export function velocidadCabeza(pose?: PoseCabeza | null, nueva?: PoseCabeza | null, dtSegundos = 0): VelocidadCabeza {
    if (!pose || !nueva || !Number.isFinite(dtSegundos) || dtSegundos <= 0) return { lineal: 0, angularGradosS: 0 };
    const dYaw = Math.atan2(Math.sin(nueva.yaw - pose.yaw), Math.cos(nueva.yaw - pose.yaw));
    return { lineal: Math.hypot(nueva.x - pose.x, nueva.y - pose.y, nueva.z - pose.z) / dtSegundos, angularGradosS: (Math.abs(dYaw) * 180) / (Math.PI * dtSegundos) };
}
/** Un salto de giro sobre la rejilla del confort, devuelto en (−π, π] para no desbordar. */
export function girarEnRejilla(yaw: number, dir: -1 | 1, anguloSalto: number): number {
    const paso = ((ANGULOS_SALTO as readonly number[]).includes(anguloSalto) ? anguloSalto : CONFORT_DEFECTO.anguloSalto) as AnguloSalto;
    const destino = siguienteGiro(yaw, dir, { ...CONFORT_DEFECTO, anguloSalto: paso });
    return Math.atan2(Math.sin(destino), Math.cos(destino));
}
/** Locomoción que MANDA: el movimiento reducido deja la continua en teletransporte, y lo dice una vez. */
export function locomocionEfectiva(c: PreferenciasConfort): { locomocion: "teletransporte" | "continua" | "ninguna"; aviso: string | null } {
    return {
        locomocion: aplicarMovimientoReducido(c).locomocion,
        aviso: c.movimientoReducido && c.locomocion === "continua" ? "El movimiento reducido manda: la locomoción continua queda en teletransporte y el giro, por saltos." : null,
    };
}

export interface Subtitulo { texto: string; origen: "astraura" | "transmision"; momento: number }
export const DURACION_SUBTITULO_MS = 6_000;
/** Subtítulo vigente según preferencia y tiempo; caduca a los 6 s para no tapar la escena. */
export function subtituloVisible(c: PreferenciasConfort, sub: Subtitulo | null, ahora: number): Subtitulo | null {
    if (!c.subtitulos || !sub || !Number.isFinite(ahora)) return null;
    return ahora >= sub.momento && ahora - sub.momento <= DURACION_SUBTITULO_MS ? sub : null;
}
/** Disposición de la Trinity según el confort: «una-mano» agrupa Horizon y Logic en pestañas. */
export function disposicionComodidad(c: PreferenciasConfort, alturaOjos: number): DisposicionTrinity {
    return disponerTrinity({ alturaOjos, postura: c.postura, manoDominante: c.manoDominante, modo: "vr-inmersivo", escala: c.escala });
}
export interface PropsComodidad {
    ultimaFrase?: string | null; // última frase de Astraura o de la transmisión; la rellena XR1010AS
    origenFrase?: "astraura" | "transmision";
    alturaOjos?: number; // en metros; por defecto 1,6
    children?: ReactNode; // lo que rodea al rig; los giros por saltos lo llevan consigo
}
const SILENCIO: Omit<ContextoAcciones, "girar" | "teletransporte"> = {
    recentrar: () => {}, salir: async () => {}, abrirMenuMano: () => {}, abrirDock: () => {},
    hablar: () => {}, atras: () => {}, seleccionar: () => {}, agarrar: () => {},
};
export function Comodidad({ ultimaFrase, origenFrase = "astraura", alturaOjos = 1.6, children }: PropsComodidad) {
    const { confort } = usePrefsXR();
    const efectivo = useMemo(() => aplicarMovimientoReducido(confort), [confort]); // el movimiento reducido manda
    const camara = useThree((s) => s.camera);
    const elRig = useRef<THREE.Group>(null), subtituloRef = useRef<THREE.Group>(null);
    const posePrevia = useRef<PoseCabeza | null>(null), instantePrevio = useRef(0);
    const [movimiento, setMovimiento] = useState({ lineal: 0, angularGradosS: 0 });
    const [frase, setFrase] = useState<Subtitulo | null>(null);
    const [avisoLocomocion, setAvisoLocomocion] = useState<string | null>(null);

    useEffect(() => { if (ultimaFrase) setFrase({ texto: ultimaFrase, origen: origenFrase, momento: Date.now() }); }, [ultimaFrase, origenFrase]);
    useEffect(() => {
        const aviso = locomocionEfectiva(confort).aviso; // solo se dice UNA vez
        if (!aviso) return;
        setAvisoLocomocion(aviso);
        const t = setTimeout(() => setAvisoLocomocion(null), 5_000);
        return () => clearTimeout(t);
    }, [confort]);

    const contexto = useMemo<ContextoAcciones>(() => ({
        girar: (dir) => { // giro por saltos con `siguienteGiro` y el ángulo configurado
            const rig = elRig.current; if (rig) rig.rotation.y = girarEnRejilla(rig.rotation.y, dir, efectivo.anguloSalto);
        },
        teletransporte: () => {}, // el punto destino lo señala la integración (XR1010AS)
        ...SILENCIO,
    }), [efectivo]);
    useEntradaXR(contexto);

    useFrame(() => {
        const ahora = performance.now(); // (1) velocidad de la cabeza por fotograma → viñeta
        const dt = instantePrevio.current ? (ahora - instantePrevio.current) / 1_000 : 0;
        instantePrevio.current = ahora;
        const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camara.quaternion);
        const nueva: PoseCabeza = { yaw: Math.atan2(frente.x, -frente.z), x: camara.position.x, y: camara.position.y, z: camara.position.z };
        setMovimiento(velocidadCabeza(posePrevia.current, nueva, dt));
        posePrevia.current = nueva;
        const grupo = subtituloRef.current; // (3) subtítulo a 1,5 m (o menos en una mano), bajo la mirada
        if (grupo) {
            const d = Math.min(1.5, disposicionComodidad(efectivo, alturaOjos).nodos.horizon.distancia) || 1.5;
            grupo.position.set(camara.position.x + frente.x * d, camara.position.y + frente.y * d - 0.08, camara.position.z + frente.z * d);
            grupo.quaternion.copy(camara.quaternion);
        }
    });

    const vivos = subtituloVisible(efectivo, frase, Date.now());
    const lema = vivos ? (vivos.origen === "astraura" ? `Astraura: ${vivos.texto}` : `Transmisión: ${vivos.texto}`) : null;
    return (
        <>
            <Vineta opacidad={opacidadVineta(efectivo, movimiento)} />
            <group ref={elRig}>{children}</group>
            <group ref={subtituloRef} visible={!!vivos || !!avisoLocomocion}>
                {lema && (
                    <Texto3D distancia={1.5} grados={efectivo.textoMinGrados} tono="texto">{lema}</Texto3D>
                )}
                {avisoLocomocion && (<Texto3D distancia={1.5} grados={efectivo.textoMinGrados} tono="textoSecundario">{avisoLocomocion}</Texto3D>)}
            </group>
        </>
    );
}
