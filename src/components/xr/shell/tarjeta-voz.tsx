"use client";
/**
 * StarSeed XR · TARJETA DE CONFIRMACIÓN 3D — Zenith (XR1010Q · contrato `architecture/starseed-xr.md`
 * §3 f). Cascarón fino: el modelo y las respuestas viven en `estado-tarjeta.ts` (puro, probado).
 * A 1,2 m delante de la persona, entrada `confirmar` con el estilo del nivel, texto ≥ 1° y botones
 * ≥ 3 cm («Confirmar» con el acento de Zenith). No se cierra sola: espera a la persona. Lo monta XR1010T.
 */
import { useCallback, useContext } from "react";
import { Container } from "@react-three/uikit";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import { OBJETIVO_MIN_TACTO_M } from "../../../lib/xr/espacio-trinity";
import { colorAcento, pixeles } from "./material-cristal";
import { Animado } from "./animado";
import { NivelCalidadContext, PanelCristal, Texto3D } from "./panel-cristal";
import { resolverRespuesta, type ModeloTarjeta, type RespuestaTarjeta } from "./estado-tarjeta";

/** Ancho de la tarjeta, en metros; los botones miden 4× el objetivo mínimo de tacto (≥ 3 cm). */
const ANCHO_TARJETA = 0.62;
const BOTON_ANCHO = 4 * OBJETIVO_MIN_TACTO_M;
const BOTON_ALTO = 2 * OBJETIVO_MIN_TACTO_M;

export interface PropsTarjetaVoz {
    /** Modelo preparado con `modeloTarjeta(resultadoVoz)` por quien trae la voz (XR1010T). */
    modelo: ModeloTarjeta | null;
    /** En la escena; por defecto colgada delante del mirada de Zenith. */
    posicion?: [number, number, number];
    /** Distancia de la persona, para el mínimo angular del texto (sirve 1,2 m). */
    distancia?: number;
    /** Acción resultante: «confirmar», «cambiar», «cancelar», {elegir} o null. */
    accion?: (respuesta: RespuestaTarjeta) => void;
}

interface PropsBoton {
    id: string;
    etiqueta: string;
    base: string;
    distancia: number;
    ancho?: number;
    pulsar: (id: string) => void;
}

function BotonXR({ id, etiqueta, base, distancia, ancho = BOTON_ANCHO, pulsar }: PropsBoton) {
    return (
        <Container
            cursor="pointer"
            width={pixeles(ancho)}
            height={pixeles(BOTON_ALTO)}
            borderRadius={pixeles(0.012)}
            backgroundColor={base}
            justifyContent="center"
            alignItems="center"
            onClick={() => pulsar(id)}
        >
            <Texto3D distancia={distancia}>{etiqueta}</Texto3D>
        </Container>
    );
}

/** Alto del cristal según lo que deba caber: título, líneas, opciones apiladas y botones. */
function altoDe(modelo: ModeloTarjeta): number {
    if (modelo.tipo === "confirmar") return 0.42 + modelo.lineas.length * 0.045;
    if (modelo.tipo === "preguntar") return 0.26 + 0.075 * modelo.opciones.length;
    return 0.14;
}

export function TarjetaVoz({ modelo, distancia = 1.2, accion, posicion = [0, 0.25, -1.2] }: PropsTarjetaVoz) {
    const nivel = useContext(NivelCalidadContext);
    const conAccion = Boolean(accion);
    const pulsar = useCallback(
        (id: string) => { if (accion) accion(resolverRespuesta(modelo, { tipo: "boton", id })); },
        [modelo, accion],
    );
    if (!modelo) return null;
    return (
        <group position={posicion}>
            <Animado evento="confirmar" estilo={PERFILES[nivel].transiciones} nivel={nivel} distancia={distancia}>
                <PanelCristal nodo="zenith" ancho={ANCHO_TARJETA} alto={altoDe(modelo)} curvatura={0.4} opacidadMinima={0.82}>
                    <Container width="100%" padding={pixeles(0.045)} flexDirection="column" alignItems="flex-start">
                        <Texto3D distancia={distancia} fontSize={pixeles(0.03)}>
                            {modelo.tipo === "confirmar" ? modelo.titulo : modelo.tipo === "preguntar" ? modelo.pregunta : modelo.mensaje}
                        </Texto3D>
                        {modelo.tipo === "confirmar" && (
                            <Container width="100%" marginTop={pixeles(0.02)} gap={pixeles(0.01)} flexDirection="column" alignItems="flex-start">
                                {modelo.lineas.map((l) => (
                                    <Texto3D key={l} distancia={distancia} tono="textoSecundario">{l}</Texto3D>
                                ))}
                            </Container>
                        )}
                        {modelo.tipo === "confirmar" && conAccion && (
                            <Container width="100%" marginTop={pixeles(0.03)} gap={pixeles(0.02)} flexDirection="row" justifyContent="center">
                                {modelo.acciones.includes("confirmar") && (
                                    <BotonXR id="confirmar" etiqueta="Confirmar" base={colorAcento("zenith")} distancia={distancia} pulsar={pulsar} />
                                )}
                                {modelo.acciones.includes("cambiar") && (
                                    <BotonXR id="cambiar" etiqueta="Cambiar" base={CRISTAL.fondoB.color} distancia={distancia} pulsar={pulsar} />
                                )}
                                {modelo.acciones.includes("cancelar") && (
                                    <BotonXR id="cancelar" etiqueta="Cancelar" base={CRISTAL.fondoB.color} distancia={distancia} pulsar={pulsar} />
                                )}
                            </Container>
                        )}
                        {modelo.tipo === "preguntar" && conAccion && (
                            <Container width="100%" marginTop={pixeles(0.02)} gap={pixeles(0.015)} flexDirection="column" alignItems="flex-start">
                                {modelo.opciones.map((o) => (
                                    <Container
                                        key={o.id}
                                        cursor="pointer"
                                        width="100%"
                                        height={pixeles(0.06)}
                                        paddingLeft={pixeles(0.02)}
                                        borderRadius={pixeles(0.01)}
                                        backgroundColor={CRISTAL.fondoB.color}
                                        justifyContent="center"
                                        onClick={() => pulsar(o.id)}
                                    >
                                        <Texto3D distancia={distancia}>{o.etiqueta}</Texto3D>
                                    </Container>
                                ))}
                                <BotonXR id="cancelar" etiqueta="Cancelar" base={CRISTAL.fondoB.color} distancia={distancia} ancho={0.2} pulsar={pulsar} />
                            </Container>
                        )}
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}
