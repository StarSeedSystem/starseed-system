"use client";

/**
 * StarSeed XR · ESCENA VIVA (XR1010AS · contrato §3 h): monta la presencia y los avatares de
 * quien está en la sala (XR1010AC) sobre `useSesionEscena`, que abre el canal ya protegido por
 * `protegerConexion` (XR1010AD), y engancha el audio espacial (XR1010AB) a esas poses.
 * Cascarón fino: sin fila de sala no hay presencia (no se inventa) y el motor de audio solo
 * suena tras un gesto. La lógica pura vive en sus módulos probados; aquí solo se conecta.
 */
import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import type { NivelCalidad } from "@/lib/xr/tipos";
import type { Pose } from "@/lib/vivo/espacial/avatares";
import type { SesionEscena } from "@/lib/vivo/espacial/sesion";
import { AvatarRemotoXR, rangoCercania } from "@/components/vivo/espacial/avatar-remoto-xr";
import { useSesionEscena } from "@/components/vivo/espacial/use-sesion-escena";
import { refSalaDeUrl } from "./ejecutor-mundo";
import { useAudioEspacial } from "./use-audio-espacial";
import { usePrefsXR } from "./use-prefs-xr";

const SIN_POSES = new Map<string, { pose: Pose; recibida: number }>();
const POS = new Vector3();
const ROT = new Quaternion();

/** La fila viva que la URL ya nombra (`?mundo=` o `/sala-xr/<id>`); sin ella no hay presencia. */
function useRefSala(): string | null {
    const [refId, setRefId] = useState<string | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        setRefId(refSalaDeUrl(window.location.pathname, window.location.search));
    }, []);
    return refId;
}

/** Publica mi pose de cabeza (nunca manos inventadas): es lo que ven las demás personas. */
function EmisorPose({ sesion }: { sesion: SesionEscena }) {
    useFrame(({ camera }) => {
        camera.getWorldPosition(POS);
        camera.getWorldQuaternion(ROT);
        sesion.emitirPose({ p: [POS.x, POS.y, POS.z], q: [ROT.x, ROT.y, ROT.z, ROT.w] });
    });
    return null;
}

function Presencia({ nivel, refId }: { nivel: NivelCalidad; refId: string }) {
    const { confort } = usePrefsXR();
    const { sesion, avatares, adns } = useSesionEscena({ tipo: "espacio", id: refId });
    const otros = avatares.otros;
    const poses = sesion?.poses;
    const rangos = useMemo(
        () => rangoCercania(null, otros, (a) => poses?.get(a.clave)?.pose.p ?? null),
        [otros, poses],
    );
    const posesAudio = useMemo(
        () => otros.flatMap((a) => {
            const p = poses?.get(a.clave)?.pose.p;
            return p ? [{ id: a.clave, pos: p }] : [];
        }),
        [otros, poses],
    );
    // XR1010AB: oyente en la cabeza y cada voz en su avatar; sin fuentes de sala no suena nada.
    useAudioEspacial({ nivel, salaId: refId, poses: posesAudio });
    return (
        <>
            {sesion && <EmisorPose sesion={sesion} />}
            {otros.map((a) => (
                <AvatarRemotoXR
                    key={a.clave}
                    meta={a}
                    poses={poses ?? SIN_POSES}
                    nivel={nivel}
                    jugadoresVisibles={rangos.get(a.clave) ?? 0}
                    reducido={confort.movimientoReducido}
                    adn={a.adnRef ? adns[a.adnRef] ?? null : null}
                />
            ))}
        </>
    );
}

export function EscenaViva({ nivel }: { nivel: NivelCalidad }) {
    const refId = useRefSala();
    return refId ? <Presencia nivel={nivel} refId={refId} /> : null;
}

export default EscenaViva;
