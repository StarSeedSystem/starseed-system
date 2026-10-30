"use client";
/**
 * StarSeed XR · TARJETA DE CONFIRMACIÓN 3D (XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 *
 * Panel de cristal (XR1010H) a 1,2 m delante con la confirmación de `entenderVoz`, la pregunta de
 * «¿cuál?» o el error; entra con `Animado` (evento `confirmar`, estilo del nivel de calidad). Título
 * grande, líneas de `Texto3D` (≥ 1° de arco), botones ≥ 3 cm y opciones apiladas cuando es pregunta.
 * El color del botón confirmar es el acento de Zenith y ninguna animación la cierra sola: espera a la
 * persona. La lógica de qué botón hace qué vive en `estado-tarjeta.ts` (pura, probada). Cascarón fino.
 */
import { useContext, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import { colorAcento, pixeles } from "./material-cristal";
import { NivelCalidadContext, PanelCristal, Texto3D } from "./panel-cristal";
import { Animado } from "./animado";
import {
    medidasTarjeta,
    resolverRespuesta,
    type AccionTarjeta,
    type Entrada,
    type ModeloTarjeta,
    type Respuesta,
} from "./estado-tarjeta";

export interface PropsTarjetaVoz {
    modelo: ModeloTarjeta | null;
    /** Nombres a los que lo confirmado se envía (lo marca `saleDeLaCuenta` en XR1010T). */
    enviaA?: string[];
    nivel?: NivelCalidad;
    distancia?: number;
    onRespuesta?: (r: Respuesta | null) => void;
}

const ETIQUETA: Record<AccionTarjeta, string> = { confirmar: "Confirmar", cambiar: "Cambiar", cancelar: "Cancelar" };

function Boton3D(p: { etiqueta: string; distancia: number; acento?: boolean; alPulsar: () => void }) {
    return (
        <Container
            width={190}
            height={54}
            borderRadius={27}
            borderWidth={2}
            borderColor={p.acento ? CRISTAL.borde.color : CRISTAL.textoSecundario}
            backgroundColor={p.acento ? colorAcento("zenith") : CRISTAL.fondoB.color}
            cursor="pointer"
            onClick={p.alPulsar}
        >
            <Texto3D distancia={p.distancia} fontSize={34}>{p.etiqueta}</Texto3D>
        </Container>
    );
}

export function TarjetaVoz({ modelo, enviaA = [], nivel, distancia = 1.2, onRespuesta }: PropsTarjetaVoz) {
    const delContexto = useContext(NivelCalidadContext);
    const n = nivel ?? delContexto;
    if (!modelo) return null;
    const { ancho, alto } = medidasTarjeta(modelo, enviaA);
    const contestar = (entrada: Entrada) => onRespuesta?.(resolverRespuesta(modelo, entrada));
    let contenido: ReactNode = null;
    if (modelo.tipo === "error") {
        contenido = <Texto3D distancia={distancia}>{modelo.mensaje}</Texto3D>;
    } else if (modelo.tipo === "preguntar") {
        contenido = (
            <>
                <Texto3D distancia={distancia} fontSize={44}>{modelo.pregunta.slice(-260)}</Texto3D>
                {modelo.opciones.map((o) => (
                    <Container key={o.id} height={46} width="100%" backgroundColor={CRISTAL.fondoB.color}
                        borderColor={CRISTAL.borde.color} borderWidth={2} borderRadius={14} cursor="pointer"
                        onClick={() => contestar({ tipo: "boton", id: o.id })}>
                        <Texto3D distancia={distancia} fontSize={34}>{o.etiqueta}</Texto3D>
                    </Container>
                ))}
                {onRespuesta && <Boton3D etiqueta="Cancelar" distancia={distancia} alPulsar={() => contestar({ tipo: "boton", id: "cancelar" })} />}
            </>
        );
    } else {
        const sale = modelo.tipo === "confirmar" && enviaA.length > 0;
        contenido = (
            <>
                <Texto3D distancia={distancia} fontSize={50}>{modelo.titulo}</Texto3D>
                {modelo.lineas.map((l, i) => (
                    <Texto3D key={i} distancia={distancia}>{l}</Texto3D>
                ))}
                {sale && <Texto3D distancia={distancia} tono="textoSecundario">{`Esto se enviará a: ${enviaA.join(", ")}`}</Texto3D>}
                {onRespuesta && (
                    <Container flexDirection="row" gap={14} marginTop={6}>
                        {modelo.acciones.map((a) => (
                            <Boton3D key={a} etiqueta={ETIQUETA[a]} distancia={distancia} acento={a === "confirmar"}
                                alPulsar={() => contestar({ tipo: "boton", id: a })} />
                        ))}
                    </Container>
                )}
            </>
        );
    }
    return (
        <group position={[0, 0.05, -distancia]}>
            <Animado evento="confirmar" estilo={PERFILES[n].transiciones} nivel={n} distancia={distancia}>
                <PanelCristal nodo="zenith" ancho={ancho} alto={alto} curvatura={0.6}>
                    <Container flexDirection="column" width={pixeles(ancho)} height={pixeles(alto)}
                        paddingTop={22} paddingLeft={26} paddingRight={26} paddingBottom={20} gap={14}>
                        {contenido}
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}

export default TarjetaVoz;
