"use client";

/**
 * StarSeed OS — EntityErrorBoundary (Adenda 76 · G3)
 * ----------------------------------------------------------------------------
 * Límite de error LOCAL para las páginas de entidad social (grupo/[slug] y
 * pagina/[slug]). Estas vistas mezclan datos REALES de la nube (os_groups /
 * os_pages / entity_state / os_spaces …) con toolkits, calendario, biblioteca
 * y paneles educativos. Un único dato raro en cualquiera de esos árboles hijos
 * (un campo null que un componente aguas abajo no espera, una API del
 * navegador que lanza) podía tirar TODO el árbol de React y mostrar el temido
 * «Application error: a client-side exception has occurred» — la app entera en
 * blanco.
 *
 * Este límite CAPTURA esas excepciones de render y ofrece una recuperación
 * SUAVE (patrón de `exocortex-error-boundary`): un botón «Reintentar» que
 * RE-MONTA sólo el contenido (nueva `key`), sin recargar la página, más un
 * enlace de vuelta a un lugar seguro. El error se registra con `console.warn`
 * (no rompe la app ni spamea `console.error`).
 *
 * IMPORTANTE — respeta el flujo de control de Next.js: `notFound()` y
 * `redirect()` lanzan errores especiales (digest «NEXT_…») que NO son fallos
 * reales sino señales para el router. El boundary los RE-LANZA para que Next
 * los maneje (404 / redirección), en lugar de tragárselos y mostrar el
 * fallback. Sin esto, un grupo inexistente mostraría el cartel de error en vez
 * de la página 404.
 */

import React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

interface Props {
    children: React.ReactNode;
    /** Etiqueta de contexto para el log (p. ej. "grupo" o "página"). */
    label?: string;
    /** Ruta segura de vuelta (p. ej. "/hub" o "/network"). */
    backHref?: string;
    /** Texto del enlace de vuelta. */
    backLabel?: string;
    /** Acento para el botón de reintento (Crystal Liquid Glass). */
    accent?: string;
}

interface State {
    hasError: boolean;
    error: (Error & { digest?: string }) | null;
    /** Se incrementa en cada reintento para forzar el RE-MONTE del contenido. */
    retryKey: number;
}

/** ¿Es un error de flujo de control de Next.js (notFound/redirect)? Debe re-lanzarse. */
function isNextControlFlow(error: unknown): boolean {
    const digest = (error as { digest?: unknown } | null)?.digest;
    return typeof digest === "string" && digest.startsWith("NEXT_");
}

export class EntityErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, retryKey: 0 };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Los errores de flujo de Next (notFound/redirect) no son fallos: no los
        // logueamos y se re-lanzan en render() para que el router los maneje.
        if (isNextControlFlow(error)) return;
        const where = this.props.label ?? "entidad";
        // eslint-disable-next-line no-console
        console.warn(
            `[StarSeed] Excepción capturada en página de ${where} — recuperación suave:`,
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
            // notFound()/redirect(): re-lanzar para que Next muestre el 404 / redirija.
            if (isNextControlFlow(this.state.error)) throw this.state.error;

            const accent = this.props.accent || "#22d3ee";
            const backHref = this.props.backHref || "/hub";
            const backLabel = this.props.backLabel || "Volver al Hub";
            return (
                <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
                    <div
                        role="alert"
                        data-entity-error="1"
                        className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-background/40 px-6 py-12 text-center backdrop-blur-md shadow-2xl"
                    >
                        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-amber-400/30 bg-amber-400/10">
                            <AlertTriangle className="h-7 w-7 text-amber-300" />
                        </span>
                        <div className="space-y-1.5">
                            <h2 className="font-headline text-lg font-semibold text-foreground/95">
                                Algo se interrumpió al mostrar esta {this.props.label ?? "entidad"}
                            </h2>
                            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                                Se recuperó sin recargar la app. Pulsa «Reintentar» para volver a
                                montar el contenido; nada se ha perdido.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={this.handleRetry}
                                className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2"
                                style={{
                                    borderColor: `${accent}66`,
                                    background: `${accent}1f`,
                                    color: accent,
                                }}
                            >
                                <RefreshCw className="h-4 w-4" /> Reintentar
                            </button>
                            <Link
                                href={backHref}
                                className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                            >
                                <ArrowLeft className="h-4 w-4" /> {backLabel}
                            </Link>
                        </div>
                    </div>
                </div>
            );
        }
        // La `key` cambia SOLO al reintentar, forzando un árbol nuevo y limpio.
        return (
            <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>
        );
    }
}

export default EntityErrorBoundary;
