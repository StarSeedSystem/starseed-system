"use client";

// src/components/education/view-error-boundary.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Error boundary ligero para las vistas pesadas de Educación (Mapa 2D SVG y
// Red 3D r3f/three). Si el render de una vista lanza en cliente (contexto WebGL
// no disponible, datos inesperados, etc.) el usuario ve un mensaje legible + un
// botón de reintento EN LUGAR de una pantalla en blanco ("no abre"). Aísla el
// fallo a la vista: el resto de la página sigue viva.
// ─────────────────────────────────────────────────────────────────────────────

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
    children: ReactNode;
    /** Nombre humano de la vista, p.ej. "el Mapa 2D" o "la Red 3D". */
    label?: string;
}

interface State {
    error: Error | null;
    /** Se incrementa al reintentar para forzar el re-montaje del subárbol. */
    resetKey: number;
}

export class ViewErrorBoundary extends Component<Props, State> {
    state: State = { error: null, resetKey: 0 };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error) {
        // Deja rastro en consola para diagnóstico (no rompe la UI).
        // eslint-disable-next-line no-console
        console.error("[Educación] Fallo al renderizar una vista:", error);
    }

    private reset = () => {
        this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
    };

    render() {
        if (this.state.error) {
            return (
                <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-red-400/20 bg-red-950/20 p-6 text-center">
                    <AlertTriangle className="h-8 w-8 text-red-300/80" />
                    <div>
                        <p className="text-sm font-semibold text-red-100">
                            No se pudo abrir {this.props.label ?? "esta vista"}
                        </p>
                        <p className="mt-1 max-w-md break-words text-xs text-red-200/70">
                            {this.state.error.message || "Error inesperado en el cliente."}
                        </p>
                    </div>
                    <button
                        onClick={this.reset}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
                    >
                        <RotateCcw className="h-3.5 w-3.5" /> Reintentar
                    </button>
                </div>
            );
        }
        // La `key` fuerza a React a re-montar los hijos tras un reintento.
        return <div key={this.state.resetKey} className="contents">{this.props.children}</div>;
    }
}

export default ViewErrorBoundary;
