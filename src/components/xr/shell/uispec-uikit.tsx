"use client";

/** StarSeed XR · UISPEC EN 3D (XR1010AN · contrato §3 b, escalón 2). Cascarón fino: valida con
 * `prepararVista` (puro) y pinta el árbol neutro con Container, Text e Image de uikit dentro de
 * un PanelCristal (XR1010H). Un spec inválido NUNCA se pinta; el texto nunca baja de 1°. */
import type { ReactNode } from "react";
import { Container, Image } from "@react-three/uikit";
import { CRISTAL, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import { colorAcento, colorConAlfa } from "./material-cristal";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { prepararVista, type NodoEscena3D } from "./uispec-mapa";

export interface PropsUiSpec3D {
  spec: unknown;
  /** Cada botón emite aquí el id (o el id de la acción) del bloque que la persona tocó. */
  onAccion: (id: string) => void;
  /** `nodo`: cardinal de la Trinity donde vive la página (por defecto, Anchor); `distancia`: metros. */
  nodo?: NodoCardinal;
  distancia?: number;
  ancho?: number;
  alto?: number;
}

const TITULO_PROBLEMA = "Esta página no se puede mostrar";
const PASO = 16;
const acento = (n: NodoCardinal): string => colorConAlfa(colorAcento(n), 0.55);
/** Margen interior, en px de uikit (1000 px = 1 m): uikit lo lleva por lado. */
const padding = { paddingTop: PASO, paddingBottom: PASO, paddingLeft: PASO, paddingRight: PASO };
const borde = (grosor: number, color: string) => ({
  borderTopWidth: grosor, borderBottomWidth: grosor, borderLeftWidth: grosor, borderRightWidth: grosor, borderColor: color,
});
/** Tamaños angulares: un título manda, el cuerpo acompaña; el mínimo lo pone Texto3D. */
const tamanoDe = (nivel: unknown): number => (nivel === 1 ? 72 : nivel === 2 ? 56 : 44);
const tituloDe = (props: Record<string, unknown>): string | undefined =>
  typeof props.titulo === "string" ? props.titulo : undefined;

interface PropsArbol { p: NodoEscena3D; onAccion: (id: string) => void; distancia: number; nodo: NodoCardinal }

function ArbolTresD({ p, onAccion, distancia, nodo }: PropsArbol): ReactNode {
  const hijos = p.hijos.map((hijo, i) => (
    <ArbolTresD key={`b${i}`} p={hijo} onAccion={onAccion} distancia={distancia} nodo={nodo} />
  ));
  const titulo = tituloDe(p.props);
  switch (p.tipo) {
    case "columna":
    case "tarjeta":
      return (
        <Container
          flexDirection="column" gapRow={PASO / 2} gapColumn={PASO / 2}
          backgroundColor={p.tipo === "tarjeta" ? CRISTAL.fondoB.color : undefined}
          {...(p.tipo === "tarjeta" ? { ...padding, ...borde(1, CRISTAL.borde.color) } : {})}
        >
          {titulo && <Texto3D distancia={distancia} fontSize={tamanoDe(1)}>{titulo}</Texto3D>}
          {hijos}
        </Container>
      );
    case "fila":
      return <Container flexDirection="row" flexWrap="wrap" gapRow={PASO / 2} gapColumn={PASO / 2}>{hijos}</Container>;
    case "lista":
      return (
        <Container flexDirection="column" gapRow={8} gapColumn={8} {...padding} {...borde(1, CRISTAL.borde.color)}>
          {titulo && <Texto3D distancia={distancia} fontSize={tamanoDe(2)}>{titulo}</Texto3D>}
          {(Array.isArray(p.props.elementos) ? p.props.elementos : []).map((e, i) => (
            <Texto3D key={`e${i}`} distancia={distancia}>{typeof e === "string" ? e : ""}</Texto3D>
          ))}
          {p.props.vacio !== undefined && (
            <Texto3D distancia={distancia} tono="textoSecundario">{String(p.props.vacio)}</Texto3D>
          )}
          {hijos}
        </Container>
      );
    case "texto":
      return typeof p.props.contenido === "string" && p.props.contenido ? (
        <Texto3D distancia={distancia} fontSize={tamanoDe(p.props.nivel)}>{p.props.contenido}</Texto3D>
      ) : null;
    case "boton": {
      const accion = p.props.accion;
      if (typeof accion !== "string" || !accion) return null; // un botón sin efecto real no se pinta
      const etiqueta = typeof p.props.etiqueta === "string" ? p.props.etiqueta : accion;
      return (
        <Container cursor="pointer" onClick={() => onAccion(accion)} {...padding} {...borde(2, acento(nodo))}>
          <Texto3D distancia={distancia}>{etiqueta}</Texto3D>
        </Container>
      );
    }
    case "imagen": {
      const src = p.props.src;
      return typeof src === "string" && src.startsWith("https://") ? <Image src={src} width={72} height={72} /> : null;
    }
    case "separador":
      return <Container width="100%" height={2} backgroundColor={CRISTAL.borde.color} />;
    case "nopintable":
      return (
        <Texto3D distancia={distancia} tono="textoSecundario">
          {`próximamente: ${typeof p.props.motivo === "string" ? p.props.motivo : ""}`}
        </Texto3D>
      );
    default:
      return null;
  }
}

/** Una página declarativa del OS (`UiSpec`) pintada sola en el visor, con el cristal del contrato. */
export function UiSpec3D({ spec, onAccion, nodo = "Anchor", distancia = 1.2, ancho = 0.52, alto = 0.74 }: PropsUiSpec3D) {
  const vista = prepararVista(spec);
  if (!vista.raiz) {
    return (
      <PanelCristal nodo={nodo} ancho={0.46} alto={0.32} opacidadMinima={0.82}>
        <Container flexDirection="column" gapRow={8} gapColumn={8} {...padding}>
          <Texto3D distancia={distancia} fontSize={tamanoDe(1)}>{TITULO_PROBLEMA}</Texto3D>
          {vista.problemas.slice(0, 4).map((problema) => (
            <Texto3D key={problema} distancia={distancia} tono="textoSecundario">{problema}</Texto3D>
          ))}
        </Container>
      </PanelCristal>
    );
  }
  return (
    <PanelCristal nodo={nodo} ancho={ancho} alto={alto}>
      <ArbolTresD p={vista.raiz} onAccion={onAccion} distancia={distancia} nodo={nodo} />
    </PanelCristal>
  );
}
