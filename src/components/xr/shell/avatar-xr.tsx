"use client";

/**
 * StarSeed XR · AVATAR DE OTRA PERSONA EN LA ESCENA (contrato §3 d y h · XR1010Z).
 * Cascarón fino de R3F: la decisión (`elegirAvatar`) y la carga (`cargarVrm`) viven en
 * `cargar-vrm.ts` (puro, probado en node). Sólo entra pose-avatar de privacidad — cabeza y
 * manos, NUNCA las 25 articulaciones — y se pinta una de tres formas:
 *  · `orbe-manos`: orbe del color de la persona + manos (esferas).
 *  · `cabeza-manos`: cabeza simple del color de la persona + manos.
 *  · `vrm`: VRM de la Biblioteca orientado con la cabeza recibida (lookAt) + manos.
 * Si el VRM tarda o falla se ve cabeza + manos: la sala nunca se rompe. Sin pose aun, no se pinta.
 */

import { memo, useEffect, useState } from "react";
import * as THREE from "three";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";
import { TOPES_VRM_MB, cargarVrm, elegirAvatar } from "./cargar-vrm";
import type { AvatarXR as FormaAvatar, PreferenciaAvatar } from "./cargar-vrm";

export interface PoseAvatarXR {
    /** Pose del aparato de la persona: posición (m) y cuaternión de su cabeza. */
    cabeza: { p: Vec3; q: [number, number, number, number] };
    /** Posición de cada mano en metros; `null` = esa mano no es visible ahora. */
    manoIzquierda: Vec3 | null;
    manoDerecha: Vec3 | null;
}

interface Props {
    pose: PoseAvatarXR | null;
    nivel: NivelCalidad;
    preferencia: PreferenciaAvatar | null;
    color: string;
    /** Su turno en la sala ordenado por cercanía (1 = la más cercana): pasado el tope de VRM del nivel se ve sin VRM. */
    orden?: number;
}

/** Suelta la memoria del VRM rechazado o sustituido (geometrías y materiales). */
function liberarEscena(escena: THREE.Object3D): void {
    escena.traverse((o) => {
        const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | Array<{ dispose(): void }> };
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material?.dispose();
    });
}

/** VRM perezoso: `cargar-vrm.ts` importa "@pixiv/three-vrm" dentro de la carga; aquí sólo se espera. */
function UsarVrm(url: string | undefined, nivel: NivelCalidad): THREE.Object3D | null {
    const [escena, poner] = useState<THREE.Object3D | null>(null);
    useEffect(() => {
        if (!url) {
            poner(null);
            return;
        }
        let vivo = true;
        let cargada: THREE.Object3D | null = null;
        const tope = nivel === "media" ? TOPES_VRM_MB["vrm-ligero"] : TOPES_VRM_MB.vrm;
        cargarVrm(url, undefined, { topeMB: tope }).then((r) => {
            if (r.ok && vivo) {
                cargada = r.escena as THREE.Object3D;
                poner(cargada);
            }
        });
        return () => {
            vivo = false;
            if (cargada) liberarEscena(cargada);
        };
    }, [url, nivel]);
    return escena;
}

/** Esfera de una mano (posición en el mundo). */
function Mano({ p, color }: { p: Vec3; color: string }) {
    return (
        <mesh position={p}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.4} metalness={0.1} />
        </mesh>
    );
}

function AvatarXRBase({ pose, nivel, preferencia, color, orden = 1 }: Props) {
    const forma: FormaAvatar = elegirAvatar(nivel, preferencia, orden);
    const escenaVrm = UsarVrm(forma === "vrm" ? preferencia?.vrmUrl : undefined, nivel);
    if (!pose) return null;
    const { cabeza, manoIzquierda, manoDerecha } = pose;
    if (forma === "vrm" && escenaVrm) {
        // El VRM se orienta con la pose de la cabeza recibida (lookAt hacia donde ella mira) y su
        // origen se deja en el suelo bajo la cabeza (un VRM 1.0 lleva su cabeza a ~1,45 m).
        const raizVrm: Vec3 = [cabeza.p[0], cabeza.p[1] - 1.45, cabeza.p[2]];
        return (
            <group name="avatar-xr">
                <primitive object={escenaVrm} position={raizVrm} quaternion={cabeza.q} />
                {manoIzquierda && <Mano p={manoIzquierda} color={color} />}
                {manoDerecha && <Mano p={manoDerecha} color={color} />}
            </group>
        );
    }
    // Orbe o cabeza + manos: cabeza del color de la persona; en orbe se ve más luminosa, como un punto de vida.
    return (
        <group name="avatar-xr">
            <group position={cabeza.p} quaternion={cabeza.q}>
                <mesh>
                    <sphereGeometry args={[0.17, 16, 12]} />
                    <meshStandardMaterial
                        color={color} emissive={color}
                        emissiveIntensity={forma === "orbe-manos" ? 0.65 : 0.35}
                        roughness={0.35} metalness={0.2}
                    />
                </mesh>
            </group>
            {manoIzquierda && <Mano p={manoIzquierda} color={color} />}
            {manoDerecha && <Mano p={manoDerecha} color={color} />}
        </group>
    );
}

export const AvatarXR = memo(AvatarXRBase);

