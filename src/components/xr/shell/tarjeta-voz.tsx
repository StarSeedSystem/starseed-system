"use client";

/**
 * StarSeed XR · TARJETA DE CONFIRMACIÓN 3D (XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 *
 * Tarjeta de cristal en Zenith, a 1,2 m delante. Cascarón fino: el modelo y las respuestas viven en
 * `estado-tarjeta.ts` (puro y probado). Tres botones ≥ 3 cm, el de confirmar con el acento de Zenith;
 * la voz que la persona dicta mientras la tarjeta espera se resuelve con el mismo modelo. No se cierra
 * sola: cada salida pasa por `onResultado`, que cablea XR1010T con los ejecutores.
 */
import { useContext, useEffect } from "react";
import { Container } from "@react-three/uikit";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { Animado } from "./animado";
import { NivelCalidadContext, PanelCristal, Texto3D } from "./panel-cristal";
import { colorAcento, pixeles } from "./material-cristal";
import { estiloDeNivel } from "./use-transicion";
import { usePrefsXR } from "./use-prefs-xr";
import { resolverRespuesta, type ModeloTarjeta, type Resolucion } from "./estado-tarjeta";

const DISTANCIA = 1.2;
const ANCHO_INTERIOR = 700;

export interface PropsTarjetaVoz {
    modelo: ModeloTarjeta | null;
    /** Última frase dictada mientras la tarjeta espera (voz de la sesión XR). */
    frase?: string | null;
    /** Única salida: botón o voz; el padre decide ejecutar, cambiar o cerrar. */
    onResultado: (r: Resolucion) => void;
}

/** Botón de cristal; 44 px de alto = 4,4 cm, por encima del mínimo de 3 cm del contrato. */
function Boton({ etiqueta, color, resolucion, onResultado }: { etiqueta: string; color: string; resolucion: Resolucion | null; onResultado: (r: Resolucion) => void }) {
    if (!resolucion) return null;
    return (
        <Container width={190} height={pixeles(0.044)} borderRadius={14} alignItems="center" justifyContent="center"
            backgroundColor={color} cursor="pointer" onPointerUp={() => onResultado(resolucion)}>
            <Texto3D distancia={DISTANCIA}>{etiqueta}</Texto3D>
        </Container>
    );
}

/** Alto estimado del panel (m) según el contenido: título, líneas, opciones y botones. */
export const altoPanel = (m: ModeloTarjeta): number => {
    if (m.tipo === "confirmar") return 0.16 + 0.03 * m.lineas.length;
    if (m.tipo === "preguntar") return m.opciones.length ? 0.15 + 0.05 * m.opciones.length : 0.19;
    return 0.18;
};

export function TarjetaVoz({ modelo, frase, onResultado }: PropsTarjetaVoz) {
    const nivel = useContext(NivelCalidadContext);
    const { confort } = usePrefsXR();
    const estilo = estiloDeNivel(nivel);
    const evento = modelo?.tipo === "confirmar" ? "confirmar" : "despliegue";
    useEffect(() => {
        if (!frase?.trim()) return;
        const r = resolverRespuesta(modelo, { tipo: "voz", frase });
        if (r) onResultado(r);
    }, [frase, modelo, onResultado]);
    if (!modelo) return null;
    return (
        <group position={[0, 0.12, -DISTANCIA]}>
            <Animado evento={evento} estilo={estilo} nivel={nivel} distancia={DISTANCIA} movimientoReducido={confort.movimientoReducido}>
                <PanelCristal nodo="zenith" ancho={0.74} alto={altoPanel(modelo)} curvatura={0.05}>
                    <Container flexDirection="column" width={ANCHO_INTERIOR} paddingTop={26} paddingLeft={26} paddingRight={26} paddingBottom={22} gap={12}>
                        {modelo.tipo === "confirmar" && (
                            <>
                                <Texto3D distancia={DISTANCIA} fontSize={40} fontWeight="bold">{modelo.titulo}</Texto3D>
                                {modelo.lineas.map((s, i) => (
                                    <Texto3D key={i} distancia={DISTANCIA} tono={i === modelo.lineas.length - 1 ? "textoSecundario" : "texto"}>
                                        {s}
                                    </Texto3D>
                                ))}
                                <Container flexDirection="row" gap={12} marginTop={8}>
                                    <Boton etiqueta="Confirmar" color={colorAcento("zenith")} resolucion="confirmar" onResultado={onResultado} />
                                    <Boton etiqueta="Cambiar" color={CRISTAL.fondoB.color} resolucion="cambiar" onResultado={onResultado} />
                                    <Boton etiqueta="Cancelar" color={CRISTAL.fondoB.color} resolucion="cancelar" onResultado={onResultado} />
                                </Container>
                            </>
                        )}
                        {modelo.tipo === "preguntar" && (
                            <>
                                <Texto3D distancia={DISTANCIA} fontSize={34} fontWeight="bold">{modelo.pregunta}</Texto3D>
                                {modelo.opciones.map((o, i) => (
                                    <Container key={o.id} width={ANCHO_INTERIOR} height={pixeles(0.042)} borderRadius={10}
                                        backgroundColor={CRISTAL.fondoB.color} cursor="pointer" onPointerUp={() => onResultado({ elegir: o.id })}>
                                        <Texto3D distancia={DISTANCIA}>{`${i + 1}. ${o.etiqueta}`}</Texto3D>
                                    </Container>
                                ))}
                            </>
                        )}
                        {modelo.tipo === "error" && <Texto3D distancia={DISTANCIA}>{modelo.mensaje}</Texto3D>}
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}
