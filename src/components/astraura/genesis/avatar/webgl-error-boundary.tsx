"use client";

/**
 * webgl-error-boundary.tsx — segunda red de seguridad, además de la sonda.
 *
 * `hooks.ts::useTieneWebGL` prueba un contexto ANTES de montar el `<Canvas>`
 * real, pero pasar esa sonda no es garantía absoluta (contexto perdido justo
 * al crear el real, un driver que falla solo con ciertos flags, etc.). Un
 * error boundary es la única forma de capturar un fallo de MONTAJE de React
 * (no de runtime dentro de un frame — eso ya lo protege R3F) y caer al
 * respaldo en vez de dejar un hueco roto. Tiene que ser clase: React no
 * ofrece (todavía) un hook equivalente a `componentDidCatch`.
 */

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  respaldo: ReactNode;
}

interface State {
  fallo: boolean;
}

export class LimiteErrorWebGL extends Component<Props, State> {
  state: State = { fallo: false };

  static getDerivedStateFromError(): State {
    return { fallo: true };
  }

  componentDidCatch(error: unknown): void {
    if (process.env.NODE_ENV !== "production") {
      // Solo diagnóstico en desarrollo — en producción se degrada en silencio,
      // con dignidad, al SVG: no es un error del usuario ni algo que "arreglar".
      // eslint-disable-next-line no-console
      console.warn("[AvatarSer] el Canvas WebGL falló tras montarse; usando el respaldo SVG.", error);
    }
  }

  render(): ReactNode {
    return this.state.fallo ? this.props.respaldo : this.props.children;
  }
}

export default LimiteErrorWebGL;
