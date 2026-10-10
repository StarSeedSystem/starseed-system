"use client";

/**
 * Red de seguridad del lienzo 3D: si WebGL revienta al pintar (contexto perdido,
 * memoria de vídeo agotada, driver roto), el mapa NO se lleva por delante la
 * página: avisa al contenedor, que enseña el radar plano con los mismos datos.
 */

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError: (motivo: string) => void;
}

export class LimiteEscena extends Component<Props, { fallo: boolean }> {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error: unknown) {
    const motivo = error instanceof Error && error.message ? error.message.slice(0, 160) : "error desconocido al pintar la escena";
    this.props.onError(motivo);
  }

  render() {
    return this.state.fallo ? null : this.props.children;
  }
}

export default LimiteEscena;
