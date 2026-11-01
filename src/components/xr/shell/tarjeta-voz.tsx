"use client";

/**
 * StarSeed XR · TARJETA DE CONFIRMACIÓN 3D (XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 *
 * Cascarón fino de R3F/uikit: qué se muestra y qué significa la frase o el botón vive en
 * `estado-tarjeta.ts` (puro y probado). Se monta a 1,2 m delante en cristal de Zenith, con la
 * entrada animada según el nivel de calidad. NO se cierra sola: espera a la persona. La monta
 * XR1010T, que le pasa el `ResultadoVoz` del orbe y la frase hablada nueva.
 */
import { useContext, useEffect, useRef } from "react";
import { Container } from "@react-three/uikit";
import type { ResultadoVoz } from "../../../lib/xr/intenciones-voz";
import { NivelCalidadContext, PanelCristal, Texto3D } from "./panel-cristal";
import { Animado } from "./animado";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { OBJETIVO_MIN_TACTO_M } from "../../../lib/xr/espacio-trinity";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import { colorAcento, pixeles } from "./material-cristal";
import { destinatariosDe, modeloTarjeta, resolverRespuesta, type RespuestaTarjeta } from "./estado-tarjeta";

/** Distancia de la tarjeta delante de la persona, en metros (contrato §3 f). */
const DISTANCIA = 1.2;
/** Alto de cada objetivo táctil: nunca por debajo de 3 cm (contrato §3 a). */
const ALTO_BOTON_M = OBJETIVO_MIN_TACTO_M + 0.015;
const ANCHO_BOTON_M = 0.14;

export interface PropsTarjetaVoz {
    resultado: ResultadoVoz | null;
    /** Última frase hablada: la tarjeta la resuelve con `resolverRespuesta` y espera la decisión. */
    frase?: string;
    alResponder: (r: RespuestaTarjeta) => void;
}

const altoPanel = (opciones: number, lineas: number): number => 0.17 + 0.036 * lineas + 0.062 * opciones;

function Boton3D({ etiqueta, onClick, acento }: { etiqueta: string; onClick: () => void; acento?: string }) {
    return (
        <Container
            cursor="pointer"
            onClick={onClick}
            width={pixeles(ANCHO_BOTON_M)}
            height={pixeles(ALTO_BOTON_M)}
            alignItems="center"
            justifyContent="center"
            backgroundColor={acento ?? CRISTAL.fondoB.color}
            borderWidth={1}
            borderColor={CRISTAL.borde.color}
            borderRadius={8}
        >
            <Texto3D distancia={DISTANCIA}>{etiqueta}</Texto3D>
        </Container>
    );
}

export default function TarjetaVoz({ resultado, frase, alResponder }: PropsTarjetaVoz) {
    const nivel = useContext(NivelCalidadContext);
    const modelo = modeloTarjeta(resultado);
    const resuelta = useRef<string | null>(null);
    useEffect(() => {
        // Voz: la frase nueva se resuelve contra el modelo VIGENTE; sin tarjeta se la espera
        // (no se gasta) para que «banda» no consuma por adelantado la pregunta que va a aparecer.
        const f = frase?.trim();
        if (!f || resuelta.current === f || !modelo) return;
        resuelta.current = f;
        const r = resolverRespuesta(modelo, { tipo: "voz", frase: f });
        if (r) alResponder(r);
    }, [frase, modelo, alResponder]);
    if (!modelo) return null;
    const envios = modelo.tipo === "confirmar" && resultado?.ok ? destinatariosDe(resultado.pasos) : [];
    const lineas =
        modelo.tipo === "confirmar"
            ? envios.length
                ? [...modelo.lineas, `Esto se enviará a: ${envios.join(", ")}`]
                : modelo.lineas
            : [];
    const opciones = modelo.tipo === "preguntar" ? modelo.opciones.length : 0;
    const lineasTotales = modelo.tipo === "confirmar" ? lineas.length : 0;
    return (
        <group position={[0, 0, -DISTANCIA]}>
            <Animado evento="entrada" estilo={PERFILES[nivel].transiciones} nivel={nivel} distancia={DISTANCIA}>
                <PanelCristal nodo="zenith" ancho={0.58} alto={altoPanel(opciones, lineasTotales)} opacidadMinima={0.82}>
                    <Container padding={16} gap={10} width="100%" height="100%" flexDirection="column" alignItems="center">
                        <Texto3D distancia={DISTANCIA} fontSize={pixeles(0.03)}>
                            {modelo.tipo === "confirmar" ? modelo.titulo : modelo.tipo === "preguntar" ? modelo.pregunta : "No lo he entendido"}
                        </Texto3D>
                        {modelo.tipo === "confirmar" && lineas.map((l: string) => <Texto3D key={l} distancia={DISTANCIA}>{l}</Texto3D>)}
                        {modelo.tipo === "error" && (
                            <Texto3D distancia={DISTANCIA} tono="textoSecundario">
                                {modelo.mensaje}
                            </Texto3D>
                        )}
                        {modelo.tipo === "confirmar" && (
                            <Container gap={8} flexDirection="row">
                                <Boton3D etiqueta="Confirmar" acento={colorAcento("zenith")} onClick={() => alResponder("confirmar")} />
                                <Boton3D etiqueta="Cambiar" onClick={() => alResponder("cambiar")} />
                                <Boton3D etiqueta="Cancelar" onClick={() => alResponder("cancelar")} />
                            </Container>
                        )}
                        {modelo.tipo === "preguntar" && (
                            <>
                                    {modelo.opciones.map((o) => (
                                    <Boton3D key={o.id} etiqueta={o.etiqueta} onClick={() => alResponder({ elegir: o.id })} />
                                ))}
                                <Texto3D distancia={DISTANCIA} fontSize={pixeles(0.02)} tono="textoSecundario">
                                    o di el nombre, «el segundo» o «cancela»
                                </Texto3D>
                            </>
                        )}
                        {modelo.tipo === "error" && (
                            <Texto3D distancia={DISTANCIA} fontSize={pixeles(0.02)} tono="textoSecundario">
                                Escuchando… repite la frase
                            </Texto3D>
                        )}
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}
