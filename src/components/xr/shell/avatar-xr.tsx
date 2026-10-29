"use client";

/**
 * Avatar XR de una persona (contrato §3 d y h). El nivel de calidad manda la forma de avatar;
 * la pose que llega es `pose-avatar` de privacidad: solo cabeza + manos, NUNCA las 25 articulaciones.
 * El VRM se carga perezosamente (dos veces: aquí y en `cargar-vrm`) y si falla o tarda, la persona
 * se ve como cabeza + manos: la sala no se rompe jamás por un avatar.
 */
import { memo, useEffect, useState } from "react";
import type { Object3D } from "three";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { cargarVrm, elegirAvatar, urlVrmSegura, type FormaAvatarXR } from "./cargar-vrm";

export interface PoseMiembroXR { p: readonly [number, number, number]; q: readonly [number, number, number, number] }
export interface PoseAvatarXR {
    cabeza: PoseMiembroXR;
    /** `null` = esa mano no se ha visto aún; nunca se inventa su sitio. */
    izquierda: PoseMiembroXR | null;
    derecha: PoseMiembroXR | null;
}

interface AvatarXRProps {
    /* Última pose recibida por red (o null: no se pinta nada). */
    pose: PoseAvatarXR | null;
    nivel: NivelCalidad;
    /** VRM de la Biblioteca elegido por la persona; sin él se ve cabeza + manos. */
    preferencia: { vrmUrl?: string } | null;
    color: string;
    /** Cuántas personas visibles están más cerca (0 = el más cercano): decide el cupo de VRM. */
    jugadoresVisibles?: number;
}

function ManoXR({ pose, color }: { pose: PoseMiembroXR; color: string }) {
    return (
        <group position={[pose.p[0], pose.p[1], pose.p[2]]} quaternion={[pose.q[0], pose.q[1], pose.q[2], pose.q[3]]}>
            <mesh>
                <sphereGeometry args={[0.05, 12, 12]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.4} />
            </mesh>
        </group>
    );
}

function AvatarXRBase({ pose, nivel, preferencia, color, jugadoresVisibles = 0 }: AvatarXRProps) {
    const forma: FormaAvatarXR = elegirAvatar(nivel, preferencia, jugadoresVisibles);
    const [vrm, setVrm] = useState<Object3D | null>(null);
    const quiereVrm = forma === "vrm" && !!preferencia?.vrmUrl && urlVrmSegura(preferencia.vrmUrl);
    useEffect(() => {
        const url = preferencia?.vrmUrl;
        if (!quiereVrm || !url) return;
        let vivo = true;
        cargarVrm(url, undefined, nivel)
            .then((r) => { if (vivo) setVrm(r.ok ? r.raiz : null); })
            .catch(() => { if (vivo) setVrm(null); });
        return () => { vivo = false; };
    }, [quiereVrm, preferencia?.vrmUrl, nivel]);
    if (!pose) return null; // sin pose no se pintan personas en sitios inventados
    const sitio = [pose.cabeza.p[0], pose.cabeza.p[1], pose.cabeza.p[2]] as [number, number, number];
    const rumbo = [pose.cabeza.q[0], pose.cabeza.q[1], pose.cabeza.q[2], pose.cabeza.q[3]] as [number, number, number, number];

    // El VRM mira hacia donde apunta la cabeza (su lookAt toma la orientación recibida) y sus manos son
    // esferas de la pose. Composición: VRM + manos; si el VRM falla o tarda, cae a cabeza del color.
    if (vrm && quiereVrm)
        return (
            <>
                <group name="avatar-vrm" position={sitio} quaternion={rumbo}>
                    <primitive object={vrm} />
                </group>
                {pose.izquierda && <ManoXR pose={pose.izquierda} color={color} />}
                {pose.derecha && <ManoXR pose={pose.derecha} color={color} />}
            </>
        );

    // Orbe (nivel mínimo) o cabeza del color de la persona (baja, o VRM caído/tardío). Nunca se rompe la sala.
    return (
        <>
            <group name="avatar" position={sitio}>
                <mesh>
                    <sphereGeometry args={[0.17, 20, 20]} />
                    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.35} metalness={0.2} />
                </mesh>
            </group>
            {pose.izquierda && <ManoXR pose={pose.izquierda} color={color} />}
            {pose.derecha && <ManoXR pose={pose.derecha} color={color} />}
        </>
    );
}

export const AvatarXR = memo(AvatarXRBase);
export default AvatarXR;
