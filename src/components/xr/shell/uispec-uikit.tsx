"use client";

/**
 * StarSeed XR · UiSpec en 3D (XR1010AN · contrato §3 b, escalón 2).
 * Cascarón fino de uikit: valida la spec con el núcleo, la traduce con `uispec-mapa.ts` y pinta
 * el árbol dentro de un `PanelCristal` (XR1010H). Los botones solo emiten el id del bloque; aquí
 * no se ejecuta código de la página. Motores pesados solo en este chunk (`/xr/os`).
 */
import { Container, Image } from "@react-three/uikit";
import { CRISTAL, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { escena3DDesde, type Nodo } from "./uispec-mapa";

export interface PropsUiSpec3D {
    spec: unknown;
    onAccion?: (id: string) => void;
    nodo?: NodoCardinal;
    distancia?: number;
}

const DISTANCIA_DEFECTO = 1.4;
const TAM_TITULO = 30;
const TAM_CUERPO = 20;
const GAP = 8;

type PropsNodo = { nodo: Nodo; distancia: number; onAccion?: (id: string) => void };

function Hijos({ nodos, distancia, onAccion }: { nodos: Nodo[]; distancia: number; onAccion?: (id: string) => void }) {
    return <>{nodos.map((nodo, i) => <Nodo3D key={`${nodo.tipo}-${i}`} nodo={nodo} distancia={distancia} onAccion={onAccion} />)}</>;
}

function Boton({ nodo, distancia, onAccion }: PropsNodo) {
    const id = typeof nodo.props.accion === "string" ? nodo.props.accion : "";
    if (!onAccion || !id) {
        return <Texto3D distancia={distancia} fontSize={TAM_CUERPO} tono="textoSecundario">Próximamente: acción sin conexión</Texto3D>;
    }
    return (
        <Container padding={GAP} borderRadius={GAP} backgroundColor={CRISTAL.borde.color} onClick={() => onAccion(id)}>
            <Texto3D distancia={distancia} fontSize={TAM_CUERPO}>{String(nodo.props.etiqueta ?? id)}</Texto3D>
        </Container>
    );
}

function Nodo3D({ nodo, distancia, onAccion }: PropsNodo) {
    switch (nodo.tipo) {
        case "texto":
            return <Texto3D distancia={distancia} fontSize={TAM_CUERPO}>{String(nodo.props.contenido ?? "")}</Texto3D>;
        case "boton":
            return <Boton nodo={nodo} distancia={distancia} onAccion={onAccion} />;
        case "imagen": {
            const src = typeof nodo.props.src === "string" ? nodo.props.src : "";
            return src
                ? <Image src={src} width={320} height={180} />
                : <Texto3D distancia={distancia} tono="textoSecundario">Imagen no disponible</Texto3D>;
        }
        case "separador":
            return <Container height={2} width="100%" backgroundColor={CRISTAL.borde.color} />;
        case "nopintable":
            return <Texto3D distancia={distancia} fontSize={TAM_CUERPO} tono="textoSecundario">Próximamente: {String(nodo.props.motivo ?? "sin vista 3D")}</Texto3D>;
        case "lista": {
            const elementos = Array.isArray(nodo.props.elementos) ? nodo.props.elementos.map(String) : [];
            return (
                <Container flexDirection="column" gap={GAP / 2} width="100%">
                    {typeof nodo.props.titulo === "string" ? <Texto3D distancia={distancia} fontSize={TAM_CUERPO}>{nodo.props.titulo}</Texto3D> : null}
                    {elementos.length === 0 ? <Texto3D distancia={distancia} tono="textoSecundario">{String(nodo.props.vacio ?? "Sin elementos.")}</Texto3D> : null}
                    {elementos.map((elemento, i) => <Texto3D key={`${nodo.tipo}-${i}`} distancia={distancia}>{elemento}</Texto3D>)}
                </Container>
            );
        }
        case "tarjeta":
            return (
                <Container flexDirection="column" gap={GAP} padding={GAP} width="100%">
                    {typeof nodo.props.titulo === "string" ? <Texto3D distancia={distancia} fontSize={TAM_TITULO}>{nodo.props.titulo}</Texto3D> : null}
                    {typeof nodo.props.subtitulo === "string" ? <Texto3D distancia={distancia} tono="textoSecundario">{nodo.props.subtitulo}</Texto3D> : null}
                    <Hijos nodos={nodo.hijos} distancia={distancia} onAccion={onAccion} />
                </Container>
            );
        case "fila":
        case "columna":
        default:
            return (
                <Container flexDirection={nodo.tipo === "fila" ? "row" : "column"} flexWrap={nodo.tipo === "fila" ? "wrap" : "no-wrap"} gap={GAP} width="100%">
                    <Hijos nodos={nodo.hijos} distancia={distancia} onAccion={onAccion} />
                </Container>
            );
    }
}

/** Pinta una página `UiSpec` en 3D; si no valida, lo dice y no pinta nada dudoso. */
export function UiSpec3D({ spec, onAccion, nodo = "horizon", distancia = DISTANCIA_DEFECTO }: PropsUiSpec3D) {
    const { arbol, problemas, spec: limpia } = escena3DDesde(spec);
    if (!arbol || !limpia) {
        return (
            <PanelCristal nodo={nodo} ancho={1.2} alto={0.5}>
                <Container flexDirection="column" gap={GAP} padding={GAP}>
                    <Texto3D distancia={distancia} fontSize={TAM_TITULO}>Esta página no se puede mostrar</Texto3D>
                    <Texto3D distancia={distancia} fontSize={TAM_CUERPO} tono="textoSecundario">{problemas[0] ?? "La especificación no es válida."}</Texto3D>
                </Container>
            </PanelCristal>
        );
    }
    return (
        <PanelCristal nodo={nodo} ancho={1.4} alto={1.0}>
            <Container flexDirection="column" gap={GAP} padding={GAP} width="100%">
                {limpia.titulo ? <Texto3D distancia={distancia} fontSize={TAM_TITULO}>{limpia.titulo}</Texto3D> : null}
                <Hijos nodos={arbol} distancia={distancia} onAccion={onAccion} />
            </Container>
        </PanelCristal>
    );
}
