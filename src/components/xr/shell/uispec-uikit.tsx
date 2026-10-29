'use client';
import React from 'react';
import { PanelCristal, Texto3D } from "./panel-cristal";
import { UiSpec, validarUiSpec } from "../../../lib/nucleo/ui-spec";
import { aEscena3D, Nodo3D } from "./uispec-mapa";
import { Container } from "@react-three/uikit";
import { NodoCardinal } from "../../../lib/xr/tokens-3d";

interface Props {
  spec: UiSpec;
  onAccion?: (id: string) => void;
}

export function UiSpec3D({ spec, onAccion }: Props) {
  const { spec: validSpec, problemas } = validarUiSpec(spec);

  if (!validSpec) {
    return (
      <PanelCristal nodo="logic" ancho={1} alto={1}>
        <Texto3D distancia={2}>Esta página no se puede mostrar</Texto3D>
        {problemas.map(p => <Texto3D key={p} distancia={2}>{p}</Texto3D>)}
      </PanelCristal>
    );
  }

  const escena = aEscena3D(validSpec);
  return (
    <Container flexDirection="column">
      {escena.map(renderNodo)}
    </Container>
  );

  function renderNodo(nodo: Nodo3D): React.JSX.Element {
    switch (nodo.tipo) {
      case "tarjeta":
        return <PanelCristal key={nodo.bloqueId} nodo="logic" ancho={1} alto={1}>{nodo.hijos.map(renderNodo)}</PanelCristal>;
      case "columna":
        return <Container key={nodo.bloqueId} flexDirection="column">{nodo.hijos.map(renderNodo)}</Container>;
      case "fila":
        return <Container key={nodo.bloqueId} flexDirection="row">{nodo.hijos.map(renderNodo)}</Container>;
      case "texto":
        return <Texto3D key={nodo.bloqueId} distancia={2}>{String(nodo.props.contenido)}</Texto3D>;
      case "boton":
        return (
          <Container key={nodo.bloqueId} cursor="pointer" onClick={() => onAccion?.(nodo.bloqueId!)}>
            <Texto3D distancia={1.5}>{nodo.bloqueId}</Texto3D>
          </Container>
        );
      default:
        return <Texto3D key={nodo.bloqueId} distancia={2}>{nodo.motivo || "Bloque no soportado"}</Texto3D>;
    }
  }
}
