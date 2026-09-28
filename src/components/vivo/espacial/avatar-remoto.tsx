"use client";

/**
 * Avatar ligero de otra persona en la escena (L5 · 2026-09-28): cabeza-orbe con visor (hacia
 * dónde mira), cuerpo-cápsula que gira con ella y su nombre encima. Se mueve interpolando hacia
 * la última pose recibida (leída del mapa de la sesión en cada fotograma, fuera de React).
 * No aparece hasta tener una pose: nunca se pinta a nadie en un sitio inventado.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MetaAvatar, Pose } from "@/lib/vivo/espacial/avatares";
import { crearTexturaTexto } from "./texturas";

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");

const ETIQUETA_MODO: Record<MetaAvatar["modo"], string | null> = { "3d": null, vr: "en VR", ar: "en AR" };

function AvatarRemotoBase({
    meta,
    poses,
    reducido,
    eco,
}: {
    meta: MetaAvatar;
    poses: Map<string, { pose: Pose; recibida: number }>;
    reducido: boolean;
    eco: boolean;
}) {
    const raiz = useRef<THREE.Group>(null);
    const cabeza = useRef<THREE.Group>(null);
    const cuerpo = useRef<THREE.Group>(null);
    const primera = useRef(true);
    const etiqueta = useMemo(
        () => crearTexturaTexto(meta.nombre, { color: "#ffffff", fondo: "rgba(12,14,34,0.72)", etiqueta: ETIQUETA_MODO[meta.modo], anchoMax: 600 }),
        [meta.nombre, meta.modo],
    );
    useEffect(() => () => etiqueta?.textura.dispose(), [etiqueta]);

    useFrame((_, dt) => {
        const r = raiz.current;
        const c = cabeza.current;
        const b = cuerpo.current;
        if (!r || !c || !b) return;
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
            c.quaternion.copy(_q);
        } else {
            r.position.lerp(_p, k);
            c.quaternion.slerp(_q, k);
        }
        _e.setFromQuaternion(c.quaternion, "YXZ");
        b.rotation.set(0, _e.y, 0);
    });

    const seg = eco ? 12 : 24;
    return (
        <group ref={raiz} visible={false} name={`avatar:${meta.clave}`}>
            <group ref={cabeza}>
                <mesh>
                    <sphereGeometry args={[0.17, seg, Math.round(seg / 2)]} />
                    <meshStandardMaterial color={meta.color} emissive={meta.color} emissiveIntensity={0.35} roughness={0.35} metalness={0.2} />
                </mesh>
                {/* Visor: indica hacia dónde mira (la cámara mira hacia -Z). */}
                <mesh position={[0, 0.01, -0.13]}>
                    <boxGeometry args={[0.2, 0.07, 0.08]} />
                    <meshStandardMaterial color="#0b0d1f" roughness={0.2} metalness={0.6} />
                </mesh>
            </group>
            <group ref={cuerpo}>
                <mesh position={[0, -0.62, 0]}>
                    <capsuleGeometry args={[0.16, 0.5, 4, seg]} />
                    <meshStandardMaterial color={meta.color} emissive={meta.color} emissiveIntensity={0.25} transparent opacity={0.72} roughness={0.5} />
                </mesh>
            </group>
            {etiqueta && (
                <sprite position={[0, 0.45, 0]} scale={[0.28 * etiqueta.aspecto, 0.28, 1]}>
                    <spriteMaterial map={etiqueta.textura} transparent depthWrite={false} toneMapped={false} />
                </sprite>
            )}
        </group>
    );
}

export const AvatarRemoto = memo(AvatarRemotoBase);
