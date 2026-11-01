"use client";

/**
 * StarSeed XR · TARJETA DE CONFIRMACIÓN 3D (XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 * Panel de cristal de Zenith a 1,2 m frente a la persona: confirma, cambia o cancela la orden que
 * sale de la cuenta; si Astraura preguntó («¿Cuál? Banda (6) · Banda vieja (3)») las opciones se
 * apilan como botones y la respuesta por voz la cablea XR1010T. NO se cierra sola: espera a la
 * persona. La lógica vive en `estado-tarjeta.ts` (pura, probada); aquí solo cristal y tokens.
 */
import { useCallback, useContext } from "react";
import { Container } from "@react-three/uikit";
import type { PasoVoz } from "../../../lib/xr/intenciones-voz";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import { Animado } from "./animado";
import { NivelCalidadContext, PanelCristal, Texto3D } from "./panel-cristal";
import { colorAcento } from "./material-cristal";
import { nombresDeEnvio, resolverRespuesta, type ModeloTarjeta, type RespuestaTarjeta } from "./estado-tarjeta";

/** 3,6 cm: por encima del objetivo táctil de 3 cm del contrato (§3 a). */
const ALTURA_BOTON = 36;

export interface PropsTarjetaVoz {
    tarjeta: ModeloTarjeta;
    /** Pasos de la orden: sostienen la línea «Esto se enviará a: …» si sale de la cuenta. */
    pasos?: PasoVoz[];
    /** Distancia frente a la persona, en metros; 1,2 por defecto (contrato §3 f). */
    distancia?: number;
    nivel?: NivelCalidad;
    /** Puerta única de la respuesta; nada se ejecuta dentro de esta tarjeta. */
    alResponder?: (r: RespuestaTarjeta) => void;
}

/** Botón de la tarjeta: toda selección pasa por `resolverRespuesta`, la única fuente de verdad. */
function BotonTarjeta({
    modelo, id, etiqueta, acento, distancia, alResponder,
}: {
    modelo: ModeloTarjeta;
    id: string;
    etiqueta: string;
    acento?: boolean;
    distancia: number;
    alResponder?: (r: RespuestaTarjeta) => void;
}) {
    const pulsar = useCallback(() => alResponder?.(resolverRespuesta(modelo, { tipo: "boton", id })), [modelo, id, alResponder]);
    return (
        <Container
            onClick={pulsar}
            cursor="pointer"
            height={ALTURA_BOTON}
            minWidth={110}
            paddingX={12}
            alignItems="center"
            justifyContent="center"
            backgroundColor={acento ? colorAcento("zenith") : CRISTAL.fondoB.color}
        >
            <Texto3D distancia={distancia} fontSize={20}>{etiqueta}</Texto3D>
        </Container>
    );
}

/** Alto del contenido en px de uikit (1000 px = 1 m): título, líneas, opciones, botones y relleno. */
function altoContenidoPx(tarjeta: ModeloTarjeta, conEnvio: boolean): number {
    const lineas = tarjeta.tipo === "confirmar" ? tarjeta.lineas.length : tarjeta.tipo === "error" ? 1 : 0;
    return (
        56 +
        lineas * 26 +
        (tarjeta.tipo === "preguntar" ? tarjeta.opciones.length * 44 : 0) +
        (conEnvio ? 26 : 0) +
        (tarjeta.tipo === "confirmar" ? 46 : 0)
    );
}

/** La tarjeta espera a la persona: sin temporizador, sin cierre automático. */
export function TarjetaVoz({ tarjeta, pasos, distancia = 1.2, nivel, alResponder }: PropsTarjetaVoz) {
    const nivelContexto = useContext(NivelCalidadContext);
    if (!tarjeta) return null;
    const nivelEfectivo = nivel ?? nivelContexto;
    const nombres = pasos && pasos.length ? nombresDeEnvio(pasos) : [];
    const titulo = tarjeta.tipo === "confirmar" ? tarjeta.titulo : tarjeta.tipo === "preguntar" ? tarjeta.pregunta : "";
    const etiquetaDe = (a: string): string => (a === "confirmar" ? "Confirmar" : a === "cambiar" ? "Cambiar" : "Cancelar");
    return (
        <group position={[0, 0, -distancia]}>
            <Animado evento="confirmar" estilo={PERFILES[nivelEfectivo].transiciones} nivel={nivelEfectivo} distancia={distancia}>
                <PanelCristal nodo="zenith" ancho={0.46} alto={altoContenidoPx(tarjeta, nombres.length > 0) / 1000} curvatura={1.2}>
                    <Container flexDirection="column" gap={8} paddingY={16} paddingX={20}>
                        <Texto3D distancia={distancia} fontSize={30}>{titulo}</Texto3D>
                        {tarjeta.tipo === "confirmar" &&
                            tarjeta.lineas.map((l, i) => (
                                <Texto3D key={i} distancia={distancia}>{l}</Texto3D>
                            ))}
                        {tarjeta.tipo === "error" && (
                            <Texto3D distancia={distancia} tono="textoSecundario">{tarjeta.mensaje}</Texto3D>
                        )}
                        {nombres.length > 0 && (
                            <Texto3D distancia={distancia} tono="textoSecundario">{`Esto se enviará a: ${nombres.join(", ")}`}</Texto3D>
                        )}
                        {tarjeta.tipo === "preguntar" &&
                            tarjeta.opciones.map((o) => (
                                <BotonTarjeta key={o.id} modelo={tarjeta} id={o.id} etiqueta={o.etiqueta} distancia={distancia} alResponder={alResponder} />
                            ))}
                        {tarjeta.tipo === "confirmar" && (
                            <Container flexDirection="row" gap={12} marginTop={4}>
                                {tarjeta.acciones.map((a) => (
                                    <BotonTarjeta key={a} modelo={tarjeta} id={a} etiqueta={etiquetaDe(a)} acento={a === "confirmar"} distancia={distancia} alResponder={alResponder} />
                                ))}
                            </Container>
                        )}
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}

export default TarjetaVoz;
