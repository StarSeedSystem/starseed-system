"use client";

/**
 * StarSeed XR · TARJETA DE VOZ 3D (XR1010Q · contrato §3 f). Panel de cristal de XR1010H, a 1,2 m
 * delante, en Zenith: la tarjeta de confirmación, la pregunta de elección o el error del dictado.
 * No se cierra sola: espera a la persona. La LÓGICA vive en `estado-tarjeta.ts` (puro, probado);
 * aquí solo se pinta con los tokens de XR1010H y se anima con `Animado` (evento `confirmar`,
 * estilo del nivel de calidad). La monta XR1010T.
 */
import { Container } from "@react-three/uikit";
import type { NivelCalidad, Vec3 } from "../../../lib/xr/tipos";
import { CRISTAL, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import { OBJETIVO_MIN_TACTO_M } from "../../../lib/xr/espacio-trinity";
import { Animado } from "./animado";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { colorAcento, pixeles } from "./material-cristal";
import { resolverRespuesta, type ModeloTarjeta, type RespuestaTarjeta } from "./estado-tarjeta";

export interface PropsTarjetaVoz {
    modelo: ModeloTarjeta;
    /** Respuesta del botón pulsado («confirmar», «cambiar», «cancelar», {elegir}) o `null` si la entrada no cabe. */
    alResponder: (r: Exclude<RespuestaTarjeta, null>) => void;
    /** Nivel de calidad; por defecto «media». */
    nivel?: NivelCalidad;
    /** Distancia de la persona al panel, en metros (texto y objetivo de toque). */
    distancia?: number;
    /** Posición local del panel; por defecto 1,2 m delante. */
    posicion?: Vec3;
    /** Panel de nodo cardinal (toca los tokens); confirmar usa el acento de Zenith. */
    nodo?: NodoCardinal;
    opacidadMinima?: number;
}

/** Ancho fijo del panel, en metros. */
const ANCHO = 0.44;
/** Alto del botón: ≥ 3 cm para tocar con dedo (§3 a), con matiz de margen. */
const GROSOR_BOTON = OBJETIVO_MIN_TACTO_M + 0.002;

export function TarjetaVoz({
    modelo,
    alResponder,
    nivel = "media",
    distancia = 1.2,
    posicion,
    nodo = "zenith",
    opacidadMinima,
}: PropsTarjetaVoz) {
    if (!modelo) return null;
    const responder = (id: string): void => {
        const r = resolverRespuesta(modelo, { tipo: "boton", id });
        if (r) alResponder(r);
    };
    return (
        <group position={posicion ?? [0, 0, -1.2]}>
            <Animado evento="confirmar" estilo={PERFILES[nivel].transiciones} nivel={nivel} distancia={distancia}>
                <PanelCristal nodo={nodo} ancho={ANCHO} alto={altoDe(modelo)} opacidadMinima={opacidadMinima}>
                    <Container flexDirection="column" gap={pixeles(0.014)} padding={pixeles(0.022)}>
                        <Texto3D distancia={distancia} fontSize={pixeles(0.03)}>
                            {modelo.tipo === "confirmar" ? modelo.titulo : modelo.tipo === "preguntar" ? modelo.pregunta : modelo.mensaje}
                        </Texto3D>
                        {modelo.tipo === "confirmar" &&
                            modelo.lineas.map((l) => (
                                <Texto3D key={l} distancia={distancia} tono="textoSecundario">
                                    {l}
                                </Texto3D>
                            ))}
                        {modelo.tipo === "confirmar" && modelo.envia?.length ? (
                            <Texto3D distancia={distancia} fontSize={pixeles(0.014)} tono="textoSecundario">
                                {`Esto se enviará a: ${modelo.envia.join(", ")}`}
                            </Texto3D>
                        ) : null}
                        {modelo.tipo === "confirmar" ? (
                            <Container flexDirection="row" gap={pixeles(0.012)}>
                                <Boton alPulsar={() => responder("confirmar")} fondo={colorAcento("zenith")} principal distancia={distancia}>
                                    Confirmar
                                </Boton>
                                <Boton alPulsar={() => responder("cambiar")} fondo={CRISTAL.fondoB.color} distancia={distancia}>
                                    Cambiar
                                </Boton>
                                <Boton alPulsar={() => responder("cancelar")} fondo={CRISTAL.fondoB.color} distancia={distancia}>
                                    Cancelar
                                </Boton>
                            </Container>
                        ) : null}
                        {modelo.tipo === "preguntar" &&
                            modelo.opciones.map((o) => (
                                <Boton key={o.id} alPulsar={() => responder(o.id)} fondo={CRISTAL.fondoB.color} distancia={distancia}>
                                    {o.etiqueta}
                                </Boton>
                            ))}
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}

/** Alto del panel según el modelo, en metros (uikit lo lee en px). */
function altoDe(modelo: Exclude<ModeloTarjeta, null>): number {
    const oposi = modelo.tipo === "preguntar" ? modelo.opciones.length : 0;
    const extraEnvia = modelo.tipo === "confirmar" && modelo.envia?.length ? 0.045 : 0;
    return NORMALIZA(modelo.tipo) + oposi * 0.05 + extraEnvia;
}
const NORMALIZA = (t: "confirmar" | "preguntar" | "error"): number =>
    t === "confirmar" ? 0.28 : t === "preguntar" ? 0.16 : 0.13;

function Boton({ alPulsar, fondo, principal, distancia, children }: {
    alPulsar: () => void;
    fondo: string;
    principal?: boolean;
    distancia: number;
    children: string;
}) {
    const anchoTexto = pixeles(0.012);
    return (
        <Container
            onClick={alPulsar}
            cursor="pointer"
            backgroundColor={fondo}
            width={pixeles(0.13)}
            height={pixeles(GROSOR_BOTON)}
            justifyContent="center"
            alignItems="center"
        >
            <Texto3D distancia={distancia} fontSize={anchoTexto * 1.8} tono={principal ? "texto" : "textoSecundario"}>
                {children}
            </Texto3D>
        </Container>
    );
}
