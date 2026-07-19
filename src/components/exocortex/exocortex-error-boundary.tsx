"use client";

/**
 * StarSeed OS — ExocortexErrorBoundary (Adenda 75 · B2)
 * ----------------------------------------------------------------------------
 * El Exocórtex (ventana Zenith · AuroraChatSection) mezcla streaming de IA,
 * adjuntos, voz (SpeechRecognition/TTS) y un árbol de conversación en vivo. En
 * Android un fallo transitorio de render (p. ej. un dato aún no hidratado, una
 * API de voz que lanza) podía tirar TODO el árbol de la cortina y parecer que
 * «se reinicia constantemente».
 *
 * Este límite de error CAPTURA esas excepciones y ofrece una recuperación
 * SUAVE: un botón «Reintentar» que RE-MONTA sólo el contenido (nueva `key`),
 * sin recargar la página. El error se registra con `console.warn` para
 * diagnóstico (no rompe la app ni spamea `console.error`).
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Etiqueta de contexto para el log (p. ej. "ventana Exocortex"). */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Se incrementa en cada reintento para forzar el RE-MONTE del contenido. */
  retryKey: number;
}

export class ExocortexErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log SUAVE (warn, no error): queda en consola para diagnóstico sin romper
    // la página ni disparar overlays de error en desarrollo.
    const where = this.props.label ?? "contenido";
    // eslint-disable-next-line no-console
    console.warn(
      `[Exocortex] Excepción capturada (${where}) — recuperación suave:`,
      error?.message ?? error,
      info?.componentStack ?? "",
    );
  }

  private handleRetry = () => {
    // Re-monta SOLO el contenido (nueva key) — nada de recargar la página.
    this.setState((s) => ({ hasError: false, error: null, retryKey: s.retryKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-exocortex-error="1"
          className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-cyan-500/25 bg-black/40 px-6 py-10 text-center"
        >
          <span className="grid place-items-center h-12 w-12 rounded-2xl border border-amber-400/30 bg-amber-400/10">
            <AlertTriangle className="h-6 w-6 text-amber-300" />
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-cyan-50">
              Algo se interrumpió en el Exocórtex
            </h3>
            <p className="max-w-sm text-sm text-cyan-100/60">
              Se recuperó sin recargar la página. Pulsa «Reintentar» para volver a
              montar el contenido; tu conversación sigue guardada.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/25 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          >
            <RefreshCw className="h-4 w-4" /> Reintentar
          </button>
        </div>
      );
    }
    // La `key` cambia SOLO al reintentar, forzando un árbol nuevo y limpio.
    return (
      <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>
    );
  }
}

export default ExocortexErrorBoundary;
