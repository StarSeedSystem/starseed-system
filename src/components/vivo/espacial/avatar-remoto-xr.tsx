"use client";

/**
 * Conector del avatar por nivel (XR1010Z · contrato §3 d y h · 2026-10-29).
 * Lleva por fin a la escena compartida el avatar del shell XR: la forma que ve cada persona
 * remota la decide `elegirAvatar` con el nivel de calidad de la escena y el cupo de VRM
 * (las personas más cercanas ganan el VRM), y el dibujo lo hace `AvatarXR` (orbe + manos,
 * cabeza + manos o VRM; si el VRM falla, cae a cabeza sin romper la sala). La envoltura es
 * solo de movimiento (interpolación suave hacia la última pose recibida) y de su nombre.
 *
 * La pose que viaja hoy es la de la cámara (cabeza, sin manos): las manos van `null`, nunca
 * se inventa su sitio. Cuando una persona tenga un VRM de la Biblioteca preferido
 * (`perfilDeDatos`, pendiente) llega por aquí como `{ vrmUrl }`.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MetaAvatar, Pose } from "@/lib/vivo/espacial/avatares";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { AvatarXR, type PoseAvatarXR } from "@/components/xr/shell/avatar-xr";
import { crearTexturaTexto } from "./texturas";
import type { Vec3 } from "@/lib/vivo/espacial/modelo";

const ETIQUETA_MODO: Record<MetaAvatar["modo"], string | null> = { "3d": null, vr: "en VR", ar: "en AR" };

/** Nivel de calidad de este aparato para los avatares: en eco (equipo modesto) mínima; resto, media.
 *  XR1010AE lo sustituirá por el nivel dinámico con histéresis cuando se cablee en esta escena. */
export function nivelDeEscena(eco: boolean): NivelCalidad {
    return eco ? "minima" : "media";
}

/** Rango por cercanía (§3 h): 0 = la persona más cerca de ella misma que gana el cupo de VRM,
 *  1 la siguiente… Sin cámara u otra persona sin pose recibe el orden de llegada. */
export function rangoCercania(
    camara: { pos: Vec3 } | null,
    otros: readonly MetaAvatar[],
    posDe: (a: MetaAvatar) => Vec3 | null,
): Map<string, number> {
    const pares = otros.map((a) => {
        const p = posDe(a);
        return { clave: a.clave, d: p && camara ? distEl(p, camara.pos) : a.desde };
    });
    pares.sort((x, y) => x.d - y.d);
    const rango = new Map<string, number>();
    pares.forEach((p, i) => rango.set(p.clave, i));
    return rango;
}

function distEl(p: Vec3, q: Vec3): number {
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
}

/** Lo que `AvatarXR` ve: la cabeza es el sitio de la envoltura (ya interpolado), así orbe,
 *  cabeza y VRM comparten el mismo movimiento. */
const POSE_INTERNA: PoseAvatarXR = {
    cabeza: { p: [0, 0, 0], q: [0, 0, 0, 1] },
    izquierda: null,
    derecha: null,
};

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

interface PropsAvatarRemotoXR {
    meta: MetaAvatar;
    poses: Map<string, { pose: Pose; recibida: number }>;
    nivel: NivelCalidad;
    /** Cuántas personas visibles están más cerca de esta (rango por cercanía). */
    jugadoresVisibles: number;
    reducido: boolean;
}

function AvatarRemotoXRBase({ meta, poses, nivel, jugadoresVisibles, reducido }: PropsAvatarRemotoXR) {
    const raiz = useRef<THREE.Group>(null);
    const primera = useRef(true);
    const etiqueta = useMemo(
        () => crearTexturaTexto(meta.nombre, { color: "#ffffff", fondo: "rgba(12,14,34,0.72)", etiqueta: ETIQUETA_MODO[meta.modo], anchoMax: 600 }),
        [meta.nombre, meta.modo],
    );
    useEffect(() => () => etiqueta?.textura.dispose(), [etiqueta]);

    useFrame((_, dt) => {
        const r = raiz.current;
        if (!r) return;
        const e = poses.get(meta.clave);
        if (!e) {
            r.visible = false;
            primera.current = true;
            return;
        }
        r.visible = true;
        _p.set(e.pose.p[0], e.pose.p[1], e.pose.p[2]);
        _q.set(e.pose.q[0], e.pose.q[1], e.pose.q[2], e.pose.q[3]);
        const k = reducido || primera.current ? 1 : 1 - Math.exp(-dt * 10);
        primera.current = false;
        if (k >= 1) {
            r.position.copy(_p);
            r.quaternion.copy(_q);
        } else {
            r.position.lerp(_p, k);
            r.quaternion.slerp(_q, k);
        }
    });

    return (
        <group ref={raiz} visible={false} name={`avatar:${meta.clave}`}>
            {etiqueta && (
                <sprite position={[0, 0.45, 0]} scale={[0.28 * etiqueta.aspecto, 0.28, 1]}>
                    <spriteMaterial map={etiqueta.textura} transparent depthWrite={false} toneMapped={false} />
                </sprite>
            )}
            <AvatarXR pose={POSE_INTERNA} nivel={nivel} preferencia={null} color={meta.color} jugadoresVisibles={jugadoresVisibles} />
        </group>
    );
}

export const AvatarRemotoXR = memo(AvatarRemotoXRBase);
export default AvatarRemotoXR;
