"use client";

/**
 * StarSeed XR · ORBE DE ASTRAURA EN 3D (XR1010O, contrato §3 a). Cascarón fino de R3F que vive
 * dentro del panel de Zenith (lo monta XR1010AS): una esfera con el material barato del nivel
 * (`paramsMaterial`), el texto parcial y la última respuesta (≤ 3 líneas, `Texto3D` de XR1010H),
 * y el botón «hablar» (pulsar = escuchar, soltar = enviar) que dispara la acción «hablar» de
 * XR1010L. La lógica es pura (`estado-orbe.ts`); los acontecimientos los alimenta XR1010P desde
 * el bus de Aurora (`subscribeAuroraConversation` / `subscribeAuroraSpeak`).
 */
import { useContext, useEffect, useState, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import { COLORES_NODO, CRISTAL, paramsMaterial } from "../../../lib/xr/tokens-3d";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import { NivelCalidadContext, Texto3D } from "./panel-cristal";
import { usePrefsXR } from "./use-prefs-xr";
import { acquireMicAnalyser, type MicAnalyser } from "@/lib/aurora/aurora-orb-bus";
import {
    conNivelVoz, etiquetaCapa, parametrosVisuales, siguienteEstadoOrbe, textoOrbe,
    ORBE_REPOSO, type EstadoOrbe, type EventoOrbe,
} from "./estado-orbe";

export interface PropsOrbeAstraura {
    /** Acción «hablar» (XR1010L): pulsar = empezar a escuchar, soltar = enviar lo oído. */
    hablar: (sube: boolean) => void;
    /** Suscripción a los acontecimientos del orbe: la alimenta XR1010P desde el bus de Aurora. */
    suscribir?: (alEvento: (ev: EventoOrbe) => void) => () => void;
    /** Distancia de la persona al panel de Zenith, en metros (1,8 en el núcleo). */
    distancia?: number;
}

export function OrbeAstraura({ hablar, suscribir, distancia = 1.8 }: PropsOrbeAstraura): ReactNode {
    const nivel = useContext(NivelCalidadContext);
    const { confort } = usePrefsXR();
    const reducido = confort.movimientoReducido;
    const [estado, setEstado] = useState<EstadoOrbe>(ORBE_REPOSO);

    // Los acontecimientos de la conversación llegan del exterior (XR1010P); aquí solo se reduce.
    useEffect(() => {
        if (!suscribir) return;
        return suscribir((ev) => setEstado((prev) => siguienteEstadoOrbe(prev, ev)));
    }, [suscribir]);

    // El analizador de micrófono (singleton del orbe de Aurora) SOLO vive mientras se escucha.
    const escuchando = estado.fase === "escuchando";
    useEffect(() => {
        if (!escuchando) return;
        let vivo = true;
        let soltarAnalizador: (() => void) | null = null;
        let reloj: ReturnType<typeof setInterval> | undefined;
        void (async () => {
            const analizador = await acquireMicAnalyser();
            if (!analizador) return; // sin permiso o en cooldown: el orbe respira igual, degrada con gracia
            if (!vivo) { analizador.stop(); return; }
            reloj = setInterval(() => setEstado((prev) => conNivelVoz(prev, analizador.read().level)), 120);
            soltarAnalizador = () => analizador.stop();
        })();
        return () => {
            vivo = false;
            if (reloj) clearInterval(reloj);
            soltarAnalizador?.();
        };
    }, [escuchando]);

    const v = parametrosVisuales(estado, reducido);
    const p = paramsMaterial(PERFILES[nivel].material, "zenith");
    const respuesta = textoOrbe(estado.texto);
    const mensaje = respuesta || (estado.fase === "reposo" ? "Pulsa «Hablar» y habla con Astraura." : "");
    return (
        <group>
            <mesh position={[0, -0.05, 0]}>
                <sphereGeometry args={[v.radio, reducido ? 14 : 28, reducido ? 10 : 20]} />
                {p.clase === "MeshPhysicalMaterial" ? (
                    <meshPhysicalMaterial color={v.color} transparent opacity={v.brillo}
                        transmission={p.transmision ?? 0.9} thickness={p.grosor ?? 0.12} roughness={p.rugosidad ?? 0.14} ior={p.ior ?? 1.35} />
                ) : p.clase === "MeshStandardMaterial" ? (
                    <meshStandardMaterial color={v.color} transparent opacity={v.brillo} roughness={p.rugosidad ?? 0.18} />
                ) : (
                    <meshBasicMaterial color={v.color} transparent opacity={v.brillo} />
                )}
            </mesh>
            {estado.capa ? <Texto3D distancia={distancia} fontSize={10}>{etiquetaCapa(estado.capa)}</Texto3D> : null}
            {mensaje ? <Container marginTop={10}><Texto3D distancia={distancia} tono="textoSecundario">{mensaje}</Texto3D></Container> : null}
            <Container
                cursor="pointer"
                backgroundColor={CRISTAL.fondoB.color}
                borderColor={COLORES_NODO.zenith.vivo} borderWidth={1}
                marginTop={12} paddingTop={8} paddingBottom={8} paddingLeft={16} paddingRight={16}
                onPointerDown={() => hablar(true)}
                onPointerUp={() => hablar(false)}
                onPointerLeave={() => hablar(false)}
            >
                <Texto3D distancia={distancia}>{escuchando ? "Suelta para enviar" : "Hablar"}</Texto3D>
            </Container>
        </group>
    );
}

export default OrbeAstraura;
