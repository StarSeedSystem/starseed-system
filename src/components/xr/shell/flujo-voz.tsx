"use client";

/**
 * StarSeed XR · FLUJO DE VOZ (XR1010T · contrato §3 f). Une `useVozXR` (micrófono), `TarjetaVoz`
 * (confirmación), `ejecutarMundo`/`ejecutarCompartir` (acciones reales) con la máquina pura
 * `maquina-voz.ts`. Aquí solo se aplican sus efectos; ninguna decisión vive en el componente.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Container } from "@react-three/uikit";
import type { ResultadoVoz } from "../../../lib/xr/intenciones-tipos";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { modeloTarjeta, type RespuestaTarjeta } from "./estado-tarjeta";
import { ejecutarCompartir, type ContextoCompartir } from "./ejecutor-compartir";
import { ejecutarMundo, type ContextoMundo } from "./ejecutor-mundo";
import { FLUJO_INICIAL, siguiente, type Efecto, type EnfoqueVoz, type EstadoFlujo, type EventoFlujo } from "./maquina-voz";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { TarjetaVoz } from "./tarjeta-voz";
import { useVozXR } from "./use-voz-xr";

export interface PropsFlujoVoz {
    mundo: ContextoMundo;
    compartir: ContextoCompartir;
    enfoque?: EnfoqueVoz | null;
    mundoActual?: { id: string; nombre: string } | null;
    moleculaConFoco?: boolean;
    nivel?: NivelCalidad;
    /** Vuelve a entender la misma frase con el candidato ya señalado (XR1010AS lo aporta). */
    reentender?: (frase: string, enfoque: EnfoqueVoz) => ResultadoVoz;
}

export function FlujoVoz({ mundo, compartir, enfoque, mundoActual, moleculaConFoco, nivel, reentender }: PropsFlujoVoz) {
    const voz = useVozXR({ enfoque, mundoActual, moleculaConFoco });
    const [flujo, setFlujo] = useState<EstadoFlujo>(FLUJO_INICIAL);
    const [aviso, setAviso] = useState<string | null>(null);
    const estadoRef = useRef<EstadoFlujo>(FLUJO_INICIAL);
    const aplicarRef = useRef<(efectos: Efecto[]) => Promise<void>>(async () => {});
    const despachar = useCallback((evento: EventoFlujo) => {
        const r = siguiente(estadoRef.current, evento);
        estadoRef.current = r.estado;
        setFlujo(r.estado);
        void aplicarRef.current(r.efectos);
    }, []);
    const aplicar = useCallback(async (efectos: Efecto[]) => {
        for (const ef of efectos) {
            if (ef.tipo === "avisar") setAviso(ef.mensaje);
            else if (ef.tipo === "mostrar-tarjeta") setAviso(null);
            else if (ef.tipo === "entender") {
                if (ef.frase && ef.enfoque && reentender) despachar({ tipo: "resultado", resultado: reentender(ef.frase, ef.enfoque) });
                else setAviso("No puedo volver a entender la orden sin el contexto de voz.");
            } else if (ef.tipo === "deshacer") {
                for (const u of ef.pasos) {
                    try { await u(); } catch { setAviso("No se pudo deshacer del todo; revisa el resultado."); }
                }
            } else {
                const i = ef.paso.intencion;
                if (i.tipo === "invitar" || i.tipo === "subir") {
                    const r = await ejecutarCompartir(ef.paso, { ...compartir, confirmado: true });
                    despachar(r.ok ? { tipo: "paso-ok", resumen: r.resumen } : { tipo: "paso-fallo", motivo: r.motivo });
                } else if (i.tipo === "sistema") {
                    despachar({ tipo: "paso-ok", resumen: `Orden del sistema: ${i.orden}.` });
                } else {
                    const r = await ejecutarMundo(ef.paso, mundo);
                    despachar(r.ok ? { tipo: "paso-ok", resumen: r.resumen, deshacer: r.deshacer } : { tipo: "paso-fallo", motivo: r.motivo });
                }
            }
        }
    }, [compartir, despachar, mundo, reentender]); aplicarRef.current = aplicar;
    const ultimo = useRef<object | null>(null);
    useEffect(() => {
        const r = voz.resultado;
        if (!r || r === ultimo.current) return;
        ultimo.current = r;
        if (r.via === "intencion") despachar({ tipo: "resultado", resultado: r.resultado });
        else if (r.via === "preguntar") setAviso(r.pregunta);
    }, [despachar, voz.resultado]);
    const escuchando = voz.estado.estado === "escuchando";
    const modelo = flujo.tipo === "tarjeta" ? modeloTarjeta(flujo.resultado) : null;
    return (
        <group>
            <group position={[0, -0.32, -1]}>
                <Container flexDirection="row" gap={12} alignItems="center">
                    <Container cursor="pointer" paddingX={14} paddingY={8} backgroundColor={CRISTAL.fondoB.color} onClick={() => voz.hablar(!escuchando)}>
                        <Texto3D distancia={1.2}>{escuchando ? "Escuchando… (toca para parar)" : "Hablar"}</Texto3D>
                    </Container>
                    {flujo.tipo !== "reposo" && (
                        <Container cursor="pointer" paddingX={14} paddingY={8} backgroundColor={CRISTAL.fondoB.color} onClick={() => { voz.cancelar(); despachar({ tipo: "cancelar" }); }}>
                            <Texto3D distancia={1.2}>Cancelar</Texto3D>
                        </Container>
                    )}
                </Container>
                {voz.parcial && <Texto3D distancia={1.2} tono="textoSecundario">{voz.parcial}</Texto3D>}
            </group>
            {modelo && (
                <TarjetaVoz
                    tarjeta={modelo}
                    pasos={flujo.tipo === "tarjeta" ? flujo.pasos : undefined}
                    nivel={nivel}
                    alResponder={(respuesta: RespuestaTarjeta) => despachar({ tipo: "respuesta", respuesta })}
                />
            )}
            {aviso && (
                <group position={[0, 0.28, -1.2]}>
                    <PanelCristal nodo="zenith" ancho={0.5} alto={0.16}>
                        <Container flexDirection="row" gap={10} padding={12} alignItems="center">
                            <Texto3D distancia={1.2}>{aviso}</Texto3D>
                            {flujo.tipo === "hecho" && flujo.deshacer.length > 0 && (
                                <Container cursor="pointer" paddingX={10} paddingY={6} backgroundColor={CRISTAL.fondoB.color} onClick={() => despachar({ tipo: "deshacer" })}>
                                    <Texto3D distancia={1.2}>Deshacer</Texto3D>
                                </Container>
                            )}
                        </Container>
                    </PanelCristal>
                </group>
            )}
        </group>
    );
}

export default FlujoVoz; // PENDIENTE-DE: XR1010AS lo monta en Zenith.
