"use client";
/**
 * UISPEC → UKIT (XR1010AN · contrato `architecture/starseed-xr.md` §3 b, escalón 2).
 *
 * Cualquier página declarada como `UiSpec` aparece sola en 3D. Valida ANTES de pintar:
 * una spec con problemas muestra la tarjeta «Esta página no se puede mostrar» y jamás
 * se dibuja nada inválido. La LÓGICA vive en `uispec-mapa.ts` (pura y probada); aquí
 * solo se dibuja con uikit, dentro del cristal de XR1010H.
 */
import { useMemo } from "react";
import { Container, Image, Text } from "@react-three/uikit";
import type { NodoCardinal } from "../../../lib/xr/tokens-3d";
import { PanelCristal, Texto3D, TonoTexto } from "./panel-cristal";
import { aEscena3D, type NodoEscena } from "./uispec-mapa";

export interface PropsUiSpec3D {
    /** La especificación tal y como llegó: se valida aquí, nunca se confía. */
    spec: unknown;
    /** ÚNICO efecto de un botón: emitir el id del bloque que lo pulsó. */
    onAccion: (id: string) => void;
    /** Cardinal del cristal (color del borde); por defecto Logic. */
    nodo?: NodoCardinal;
    /** Tamaño del panel cristal, en metros. */
    ancho?: number;
    alto?: number;
    /** Distancia de la persona al texto, en metros (mínimo angular del texto). */
    distancia?: number;
}

/** Renderiza el árbol neutro que produce `aEscena3D`. Nada define colores fuera de tokens. */
function Arbol({ arbol, distancia, onAccion }: { arbol: NodoEscena; distancia: number; onAccion: (id: string) => void }) {
    const p = arbol.props;
    const cadena = (clave: string): string => (typeof p[clave] === "string" ? (p[clave] as string) : "");
    const mapa = (nodos: NodoEscena[], clave?: (a: { props: Record<string, unknown> }) => string) =>
        nodos.map((hijo, i) => <Arbol key={clave ? clave(hijo) || i : i} arbol={hijo} distancia={distancia} onAccion={onAccion} />);
    switch (arbol.tipo) {
        case "columna":
            return <Container flexDirection="column" width="100%">{mapa(arbol.hijos)}</Container>;
        case "fila":
            return <Container flexDirection="row" flexWrap="wrap" width="100%">{mapa(arbol.hijos)}</Container>;
        case "texto": {
            const contenido = cadena("contenido");
            if (!contenido) return null;
            return (
                <Texto3D distancia={distancia} fontSize={p.nivel === 1 ? 32 : p.nivel === 2 ? 24 : undefined} tono={p.tono === "suave" ? "textoSecundario" : "texto"}>
                    {contenido}
                </Texto3D>
            );
        }
        case "boton":
            return (
                <Container
                    cursor="pointer"
                    onPointerDown={() => onAccion(String(p.bloque ?? ""))}
                    padding={10}
                    borderWidth={1}
                    borderColor="rgba(245, 247, 255, 0.4)"
                >
                    <Texto3D distancia={distancia} fontSize={20}>{cadena("etiqueta")}</Texto3D>
                </Container>
            );
        case "imagen":
            return cadena("url") ? <Image src={cadena("url")} width={48} height={48} /> : null;
        case "lista": {
            const elementos = Array.isArray(p.elementos) ? (p.elementos as unknown[]).filter((e): e is string => typeof e === "string") : [];
            const vacio = cadena("vacio");
            return (
                <Container flexDirection="column" width="100%">
                    {cadena("titulo") ? (
                        <Texto3D distancia={distancia} fontSize={24}>{cadena("titulo")}</Texto3D>
                    ) : null}
                    {elementos.length === 0 && vacio ? <Texto3D distancia={distancia} tono="textoSecundario">{vacio}</Texto3D> : null}
                    {elementos.map((e, i) => (
                        <Texto3D key={`el-${i}`} distancia={distancia}>{e}</Texto3D>
                    ))}
                </Container>
            );
        }
        case "tarjeta":
            return (
                <Container flexDirection="column" padding={16} width="100%">
                    {cadena("titulo") ? <Texto3D distancia={distancia} fontSize={26}>{cadena("titulo")}</Texto3D> : null}
                    {cadena("subtitulo") ? <Texto3D distancia={distancia} tono="textoSecundario" fontSize={20}>{cadena("subtitulo")}</Texto3D> : null}
                    {mapa(arbol.hijos)}
                </Container>
            );
        case "separador":
            return <Container height={4} width="100%"></Container>;
        default:
            return <Texto3D distancia={distancia} tono="textoSecundario" fontSize={18}>{cadena("motivo")}</Texto3D>;
    }
}

function SinVista({ avisos, distancia }: { avisos: string[]; distancia: number }) {
    return (
        <Container flexDirection="column" width="100%">
            <Texto3D distancia={distancia} fontSize={30}>Esta página no se puede mostrar</Texto3D>
            {avisos.map((aviso, i) => (
                <Texto3D key={`av-${i}`} distancia={distancia} tono="textoSecundario" fontSize={20}>{aviso}</Texto3D>
            ))}
        </Container>
    );
}

/** El panel de cristal completo: valida, y dibuja el árbol o la tarjeta de no-poder. */
export function UiSpec3D({ spec, onAccion, nodo = "logic", ancho = 0.8, alto = 0.55, distancia = 1.2 }: PropsUiSpec3D) {
    const { raiz, avisos } = useMemo(() => aEscena3D(spec), [spec]);
    return (
        <PanelCristal nodo={nodo} ancho={ancho} alto={alto} opacidadMinima={0.82}>
            <Container flexDirection="column" padding={32} width="100%" height="100%">
                {raiz ? <Arbol arbol={raiz} distancia={distancia} onAccion={onAccion} /> : <SinVista avisos={avisos} distancia={distancia} />}
            </Container>
        </PanelCristal>
    );
}
