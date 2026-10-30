"use client";
/**
 * StarSeed XR · ORBE DE ASTRAURA — Zenith (XR1010O · contrato §3 a y f). Cascarón fino: la lógica vive
 * en `estado-orbe.ts` (puro); eventos del bus de Aurora, micrófono compartido y puente de XR1010P.
 */
import { useContext, useEffect, useReducer, useRef } from "react";
import { Container } from "@react-three/uikit";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { AURORA_STATE_EVENT, useAurora } from "../../aurora/aurora-provider";
import { acquireMicAnalyser, subscribeAuroraConversation, subscribeAuroraSpeak, type AuroraConversationDetail } from "../../../lib/aurora/aurora-orb-bus";
import { CRISTAL, paramsMaterial } from "../../../lib/xr/tokens-3d";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import { ESTADO_ORBE_INICIAL, parametrosVisuales, siguienteEstadoOrbe, type EventoOrbe } from "./estado-orbe";
import { NivelCalidadContext, PanelCristal, Texto3D } from "./panel-cristal";
import { usePrefsXR } from "./use-prefs-xr";

export type EmisorOrbe = (evento: EventoOrbe) => void;

export interface PropsOrbeAstraura {
  /** Posición en la escena; la Trinity de XR1010AS la coloca al norte (Zenith). */
  posicion?: [number, number, number];
  /** Puente fino de XR1010P: registra una fuente de eventos y devuelve su limpieza. */
  pipeline?: (emitir: EmisorOrbe) => () => void;
  /** Acción `hablar` de XR1010L: pulsar para hablar, soltar para enviar. */
  hablar?: (activo: boolean) => void;
}

const LINEAS_RESPUESTA = 3;

export function OrbeAstraura({ pipeline, hablar, posicion = [0, 0, 0] }: PropsOrbeAstraura) {
  const mallaRef = useRef<Mesh>(null);
  const [estado, emitir] = useReducer(siguienteEstadoOrbe, ESTADO_ORBE_INICIAL);
  const nivel = useContext(NivelCalidadContext);
  const { confort } = usePrefsXR();
  const aurea = useAurora();
  const respuesta = useRef<string>("");
  const analizador = useRef<Awaited<ReturnType<typeof acquireMicAnalyser>>>(null);
  const nivelPrevio = useRef(0); const refEstado = useRef(estado); refEstado.current = estado;
  const material = paramsMaterial(PERFILES[nivel].material, "zenith", { contrasteAlto: confort.contrasteAlto });
  const visor = parametrosVisuales(estado, confort.movimientoReducido);
  const escuchaActiva = aurea?.listening ?? false;

  useEffect(() => {
    const habla = subscribeAuroraSpeak((fase) => {
      if (fase === "start") emitir({ tipo: "habla-inicio", texto: respuesta.current || "…estoy pensando…" });
      if (fase === "end") emitir({ tipo: "habla-fin" });
    });
    const conversacion = subscribeAuroraConversation((d: AuroraConversationDetail) => {
      if (d.role !== "aurora") return;
      respuesta.current = d.text;
      if (refEstado.current.fase === "hablando") emitir({ tipo: "habla-inicio", texto: d.text });
    });
    return () => { habla(); conversacion(); };
  }, []);

  // Fases de escucha del motor de Aurora: eventos, nunca sondeos en bucle.
  useEffect(() => {
    if (escuchaActiva) emitir({ tipo: "escucha-inicio" });
    else if (refEstado.current.fase === "escuchando") emitir({ tipo: "escucha-fin" });
  }, [escuchaActiva]);

  // Puente fino de XR1010P (texto parcial, entendido/capa, error)
  useEffect(() => pipeline?.(emitir), [pipeline]);
  useEffect(() => {
    let quieto = false;
    void acquireMicAnalyser().then((a) => { if (!quieto) analizador.current = a; });
    return () => { quieto = true; analizador.current?.stop(); analizador.current = null; };
  }, []);

  // Repaso por el evento global de Aurora (cambios fuera del proveedor).
  const [, repintar] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener(AURORA_STATE_EVENT, repintar);
    return () => window.removeEventListener(AURORA_STATE_EVENT, repintar);
  }, []);
  useFrame(({ clock }) => {
    const malla = mallaRef.current;
    if (!malla) return;
    const a = analizador.current;
    if (a) {
      const nivelVoz = a.read().level;
      if (Math.abs(nivelVoz - nivelPrevio.current) > 0.02) {
        nivelPrevio.current = nivelVoz;
        if (refEstado.current.fase === "escuchando") emitir({ tipo: "voz", nivel: nivelVoz });
      }
    }
    malla.scale.setScalar(visor.radio * (1 + visor.pulso * 0.35 * Math.abs(Math.sin(clock.elapsedTime * 2.4))));
  });

  const parcial = estado.fase === "escuchando" || estado.fase === "pensando";
  return (
    <group position={posicion}>
      <mesh ref={mallaRef}>
        <sphereGeometry args={[1, 24, 24]} />
        {material.clase === "MeshBasicMaterial" ? (
          <meshBasicMaterial color={visor.color} transparent opacity={material.opacidad} />
        ) : (
          <meshStandardMaterial color={visor.color} transparent opacity={material.opacidad} emissive={visor.color} emissiveIntensity={visor.brillo} />
        )}
      </mesh>
      <group position={[0, -(visor.radio + 0.16), 0]}>
        <PanelCristal nodo="zenith" ancho={0.92} alto={0.22}>
          <Container flexDirection="column" marginTop={10} gap={8} width={860} height={180}>
            <Texto3D distancia={1.6}>
              {parcial ? estado.texto || "…escuchando…" : estado.texto.split("\n").slice(-LINEAS_RESPUESTA).join("\n")}
            </Texto3D>
            {estado.capa && <Texto3D distancia={1.6} tono="textoSecundario">{`capa ${estado.capa} de Astraura`}</Texto3D>}
          </Container>
        </PanelCristal>
        {hablar && (
          <Container width={280} height={72} marginTop={10} marginBottom={12} borderRadius={36} backgroundColor={CRISTAL.fondoB.color} cursor="pointer"
            onPointerDown={() => hablar(true)} onPointerUp={() => hablar(false)}>
            <Texto3D distancia={1.6}>{estado.fase === "escuchando" ? "Suelta para enviar" : "Mantén para hablar"}</Texto3D>
          </Container>
        )}
      </group>
    </group>
  );
}
