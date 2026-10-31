"use client";

/**
 * StarSeed XR · UISPEC EN EL VISOR (XR1010AN · contrato `architecture/starseed-xr.md` §3 b).
 *
 * Cascarón fino de uikit: validar, limpiar y mapear vive en `uispec-mapa.ts`, que es puro y
 * se prueba en node. Aquí solo se pinta el árbol dentro de cristal; un botón emite el id de
 * su bloque y nunca ejecuta código. Si la página no es válida, no se pinta nada suyo.
 */
import type { ReactNode } from "react";
import { Container, Image } from "@react-three/uikit";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { escenaSegura, type Nodo3D } from "./uispec-mapa";

export interface PropsUiSpec3D {
    spec: unknown;
    onAccion?: (id: string) => void;
}

const ANCHO = 1.2;
const ALTO = 0.8;

function texto(valor: unknown): string {
    return typeof valor === "string" ? valor : "";
}

function lista(valor: unknown): string[] {
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

export function UiSpec3D({ spec, onAccion }: PropsUiSpec3D) {
    const { raiz, problemas } = escenaSegura(spec);
    if (raiz === null) {
        return (
            <PanelCristal nodo="logic" ancho={ANCHO} alto={ALTO}>
                <Texto3D distancia={2}>Esta página no se puede mostrar</Texto3D>
                {problemas.map((p, i) => (
                    <Texto3D key={i} distancia={2} tono="textoSecundario">{p}</Texto3D>
                ))}
            </PanelCristal>
        );
    }
    return <>{pintar(raiz, "raiz", onAccion)}</>;
}

function pintar(nodo: Nodo3D, clave: string, onAccion?: (id: string) => void): ReactNode {
    switch (nodo.tipo) {
        case "columna":
        case "fila":
            return (
                <Container key={clave} flexDirection={nodo.tipo === "fila" ? "row" : "column"} gapColumn={8} gapRow={8}>
                    {nodo.hijos.map((h, i) => pintar(h, `${clave}.${i}`, onAccion))}
                </Container>
            );
        case "tarjeta": {
            const titulo = texto(nodo.props.titulo);
            const subtitulo = texto(nodo.props.subtitulo);
            return (
                <PanelCristal key={clave} nodo="logic" ancho={ANCHO} alto={ALTO}>
                    {titulo ? <Texto3D distancia={1.5}>{titulo}</Texto3D> : null}
                    {subtitulo ? <Texto3D distancia={1.8} tono="textoSecundario">{subtitulo}</Texto3D> : null}
                    {nodo.hijos.map((h, i) => pintar(h, `${clave}.${i}`, onAccion))}
                </PanelCristal>
            );
        }
        case "texto":
            return (
                <Texto3D key={clave} distancia={2} tono={nodo.props.tono === "suave" ? "textoSecundario" : "texto"}>
                    {texto(nodo.props.contenido)}
                </Texto3D>
            );
        case "lista": {
            const elementos = lista(nodo.props.elementos);
            const titulo = texto(nodo.props.titulo);
            return (
                <Container key={clave} flexDirection="column" gapRow={4}>
                    {titulo ? <Texto3D distancia={1.8}>{titulo}</Texto3D> : null}
                    {elementos.length === 0
                        ? <Texto3D distancia={2} tono="textoSecundario">{texto(nodo.props.vacio) || "Sin elementos."}</Texto3D>
                        : elementos.map((e, i) => <Texto3D key={i} distancia={2}>{e}</Texto3D>)}
                    {nodo.hijos.map((h, i) => pintar(h, `${clave}.${i}`, onAccion))}
                </Container>
            );
        }
        case "boton": {
            const id = texto(nodo.props.id) || nodo.bloqueId || "";
            const etiqueta = texto(nodo.props.etiqueta) || id;
            const handle = onAccion ? () => onAccion(id) : undefined;
            return (
                <Container
                    key={clave}
                    cursor={handle ? "pointer" : undefined}
                    onClick={handle}
                    paddingTop={8}
                    paddingBottom={8}
                    paddingLeft={16}
                    paddingRight={16}
                    backgroundColor={"#FFFFFF14"}
                >
                    <Texto3D distancia={1.5}>{etiqueta}</Texto3D>
                </Container>
            );
        }
        case "imagen": {
            const url = texto(nodo.props.url);
            if (url === "") return <Texto3D key={clave} distancia={2} tono="textoSecundario">Imagen no disponible</Texto3D>;
            return <Image key={clave} src={url} width={320} height={200} />;
        }
        case "separador":
            return <Container key={clave} width={320} height={1} backgroundColor={"#FFFFFF33"} />;
        default:
            return (
                <Texto3D key={clave} distancia={2} tono="textoSecundario">
                    {nodo.motivo ?? "Este bloque aún no tiene vista 3D"}
                </Texto3D>
            );
    }
}
