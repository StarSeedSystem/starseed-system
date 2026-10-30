"use client";
/** StarSeed XR · ORBE DE ASTRAURA (XR1010O · §3 a/f): cascarón de R3F sobre `estado-orbe.ts`.
 * Pinta el material barato del nivel, escucha el bus real de Aurora y dispara `hablar` (XR1010L). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import * as THREE from "three";
import { useAurora } from "@/components/aurora/aurora-provider";
import { acquireMicAnalyser, subscribeAuroraConversation, subscribeAuroraSpeak, type MicAnalyser } from "@/lib/aurora/aurora-orb-bus";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { CRISTAL, paramsMaterial, type ParamsMaterial } from "@/lib/xr/tokens-3d";
import type { CapaIA } from "@/lib/xr/intenciones-tipos";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { usePrefsXR } from "./use-prefs-xr";
import { Texto3D } from "./panel-cristal";
import { ejecutarAccion, type ContextoAcciones } from "./acciones-xr";
import { ESTADO_ORBE_INICIAL, lineasDe, parametrosVisuales, siguienteEstadoOrbe, type EstadoOrbe, type EventoOrbe } from "./estado-orbe";
export interface PropsOrbeAstraura {
    nivel?: NivelCalidad;
    acciones?: ContextoAcciones;
    estadoInicial?: EstadoOrbe;
    alCambiar?: (estado: EstadoOrbe) => void;
}
const ETIQUETA_CAPA: Record<CapaIA, string> = { reflejo: "Responde el reflejo", palabra: "Responde la palabra", razon: "Responde la razón" };
function MaterialOrbe({ params, color, brillo }: { params: ParamsMaterial; color: string; brillo: number }) {
    if (params.clase === "MeshBasicMaterial")
        return <meshBasicMaterial color={color} transparent={params.transparente} opacity={Math.min(1, params.opacidad * (0.7 + brillo * 0.3))} toneMapped={false} />;
    if (params.clase === "MeshStandardMaterial")
        return <meshStandardMaterial color={color} transparent={params.transparente} opacity={params.opacidad} roughness={params.rugosidad ?? 0.3} metalness={params.metalico ?? 0} emissive={color} emissiveIntensity={brillo} />;
    return <meshPhysicalMaterial color={color} transparent={params.transparente} opacity={params.opacidad} roughness={params.rugosidad ?? 0.2} transmission={params.transmision ?? 0} thickness={params.grosor ?? 0} ior={params.ior ?? 1.4} />;
}
export function OrbeAstraura({ nivel = "media", acciones, estadoInicial, alCambiar }: PropsOrbeAstraura) {
    const { confort } = usePrefsXR(); const reducido = confort.movimientoReducido;
    const aurora = useAurora();
    const [estado, setEstado] = useState<EstadoOrbe>(() => estadoInicial ?? ESTADO_ORBE_INICIAL);
    const [respuesta, setRespuesta] = useState("");
    const enviar = useCallback((ev: EventoOrbe) => setEstado((prev) => siguienteEstadoOrbe(prev, ev)), []);
    useEffect(() => { alCambiar?.(estado); }, [estado, alCambiar]);
    useEffect(() => {
        const bajaConversacion = subscribeAuroraConversation((d) => {
            if (d.role === "user") enviar({ tipo: "texto-parcial", texto: d.text });
            else setRespuesta(d.text);
        });
        const bajaVoz = subscribeAuroraSpeak((f) => {
            if (f === "start") enviar({ tipo: "habla-inicio" });
            else if (f === "end") enviar({ tipo: "habla-fin" });
        });
        return () => { bajaConversacion(); bajaVoz(); };
    }, [enviar]);
    const previo = useRef({ listening: false, speaking: false });
    useEffect(() => {
        if (!aurora) return;
        const sincronizar = () => {
            const e = aurora.getState();
            if (!e) return;
            const p = previo.current;
            if (e.listening !== p.listening) { p.listening = e.listening; enviar({ tipo: e.listening ? "escucha-inicio" : "escucha-fin" }); }
            if (e.speaking !== p.speaking) { p.speaking = e.speaking; enviar({ tipo: e.speaking ? "habla-inicio" : "habla-fin" }); }
            if (e.interim) enviar({ tipo: "texto-parcial", texto: e.interim });
        };
        const baja = aurora.subscribe(sincronizar); sincronizar(); return baja;
    }, [aurora, enviar]);
    const fase = estado.fase;
    useEffect(() => {
        if (fase !== "escuchando") return;
        let vivo = true; let analizador: MicAnalyser | null = null; let raf = 0; let ultimoMs = 0; let ultimoNivel = -1;
        const leer = () => {
            if (!vivo || !analizador) return;
            const { level } = analizador.read();
            if (Math.abs(level - ultimoNivel) > 0.02 || Date.now() - ultimoMs > 120) {
                ultimoNivel = level; ultimoMs = Date.now(); enviar({ tipo: "nivel-voz", nivel: level });
            }
            raf = requestAnimationFrame(leer);
        };
        void acquireMicAnalyser().then((a) => { if (!vivo) { a?.stop(); return; } analizador = a; if (a) leer(); });
        return () => { vivo = false; cancelAnimationFrame(raf); analizador?.stop(); };
    }, [fase, enviar]);
    const visual = parametrosVisuales(estado, reducido);
    const params = useMemo(() => paramsMaterial(PERFILES[nivel].material, "zenith", {
        reducirTransparencia: confort.reducirTransparencia, contrasteAlto: confort.contrasteAlto,
    }), [nivel, confort.reducirTransparencia, confort.contrasteAlto]);
    const malla = useRef<THREE.Mesh>(null); const estadoRef = useRef(estado); const pulsando = useRef(false);
    useEffect(() => { estadoRef.current = estado; }, [estado]);
    useFrame(({ clock }) => {
        const v = parametrosVisuales(estadoRef.current, reducido);
        if (!malla.current) return;
        malla.current.scale.setScalar(v.pulso === 0 ? 1 : 1 + Math.sin(clock.getElapsedTime() * (2 + v.pulso * 5)) * 0.05 * v.pulso);
    });
    const pulsar = (activo: boolean) => {
        if (activo === pulsando.current) return;
        pulsando.current = activo;
        enviar({ tipo: activo ? "escucha-inicio" : "escucha-fin" });
        if (acciones) ejecutarAccion("hablar", acciones, activo);
        else if (aurora) { if (activo) aurora.start(); else aurora.stop(); }
    };
    const lineas = lineasDe(estado.texto, 2);
    const lineasRespuesta = respuesta && respuesta !== estado.texto ? lineasDe(respuesta, 1) : [];
    return (
        <group name="orbe-astraura">
            <mesh ref={malla}>
                <sphereGeometry args={[visual.radio, 24, 16]} />
                <MaterialOrbe params={params} color={visual.color} brillo={visual.brillo} />
            </mesh>
            <group position={[0, -0.34, 0]}>
                <Container flexDirection="column" width={440} gap={4} alignItems="center">
                    {lineas.map((linea, i) => <Texto3D key={`parcial-${i}`} distancia={1.2}>{linea}</Texto3D>)}
                    {lineasRespuesta.map((linea, i) => <Texto3D key={`respuesta-${i}`} distancia={1.2} tono="textoSecundario">{linea}</Texto3D>)}
                    {estado.capa ? <Texto3D distancia={1.2} tono="textoSecundario">{ETIQUETA_CAPA[estado.capa]}</Texto3D> : null}
                    <Container paddingX={16} paddingY={8} borderRadius={10} borderWidth={1} borderColor={visual.color}
                        backgroundColor={CRISTAL.fondoA.color} cursor="pointer"
                        onPointerDown={() => pulsar(true)} onPointerUp={() => pulsar(false)} onPointerLeave={() => pulsar(false)}>
                        <Texto3D distancia={1.2}>{fase === "escuchando" ? "Suelta para enviar" : "Hablar"}</Texto3D>
                    </Container>
                </Container>
            </group>
        </group>
    );
}
export default OrbeAstraura;
