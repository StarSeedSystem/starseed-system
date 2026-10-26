"use client";

/**
 * DemoPaso — la demostración animada de un paso de la guía completa, cargada a demanda.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025U · GUIA1025U) El catálogo único (`lib/onboarding/guia-completa.ts`) da a cada paso la CLAVE de su
 * demostración; esta pieza la dibuja. Las tres familias salen de archivos distintos y ninguna pesa para
 * quien no llega a ese paso, así que se cargan con `import()` la primera vez que se piden:
 *
 *   · `demos-sistema.tsx`   — Protomolécula, malla, capas de conciencia, neuronas y cerebro;
 *   · `demos-red.tsx`       — los tres pilares, Librería y Biblioteca, Genesis, personalización segura;
 *   · `aurora-guide-demos.tsx` (`StepDemo`) — orbe, Trinity, escritorio, dashboard, Astraura, perfil, cerebro;
 *   · `demo-gestos-hibridos.tsx` — la práctica real de gestos.
 *
 * Esto importa también por el peso del arranque: `AuroraGuide` cuelga del layout raíz, y antes arrastraba
 * `aurora-guide-demos` (y con él la práctica de gestos) a todas las rutas.
 *
 * Mientras llega, un marco quieto de la misma altura (nada salta); si la carga falla (sin red, un trozo
 * viejo en caché) el paso sigue sin demostración, nunca rompe la guía. Con `reduce` cada demo se queda en
 * su fotograma quieto, como ya hacían.
 */

import { Component, Suspense, lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";

import { origenDeDemo, type ClaveDemo } from "@/lib/onboarding/guia-completa";

interface PropsDemo {
    accent: string;
    reduce: boolean;
}
type Cargador = () => Promise<{ default: ComponentType<PropsDemo> }>;

function cargadorDe(clave: ClaveDemo): Cargador {
    const origen = origenDeDemo(clave);
    if (origen === "sistema") {
        return async () => {
            const { DEMOS_SISTEMA } = await import("./demos-sistema");
            return { default: DEMOS_SISTEMA[clave as keyof typeof DEMOS_SISTEMA] as ComponentType<PropsDemo> };
        };
    }
    if (origen === "red") {
        return async () => {
            const { DEMOS_RED } = await import("./demos-red");
            return { default: DEMOS_RED[clave as keyof typeof DEMOS_RED] as ComponentType<PropsDemo> };
        };
    }
    if (clave === "gestos-hibridos") {
        // La práctica real, directa: no necesita pasar por el despachador de `StepDemo`.
        return async () => {
            const { DemoGestosHibridos } = await import("./demo-gestos-hibridos");
            return { default: DemoGestosHibridos };
        };
    }
    return async () => {
        const { StepDemo } = await import("./aurora-guide-demos");
        const Demo = ({ accent, reduce }: PropsDemo) => <StepDemo stepKey={clave} accent={accent} reduce={reduce} />;
        return { default: Demo };
    };
}

const PEREZOSAS = new Map<ClaveDemo, LazyExoticComponent<ComponentType<PropsDemo>>>();
function perezosaDe(clave: ClaveDemo): LazyExoticComponent<ComponentType<PropsDemo>> {
    let c = PEREZOSAS.get(clave);
    if (!c) {
        c = lazy(cargadorDe(clave));
        PEREZOSAS.set(clave, c);
    }
    return c;
}

/** El marco quieto de mientras llega la demostración (misma altura que las demos del SVG). */
function MarcoDemo() {
    return (
        <div
            aria-hidden
            data-testid="demo-cargando"
            className="h-28 w-full rounded-2xl border border-white/10 bg-white/[0.03]"
        />
    );
}

/** Si la demostración no carga, el paso sigue sin ella. */
class SinDemoSiFalla extends Component<{ children: ReactNode }, { fallo: boolean }> {
    state = { fallo: false };
    static getDerivedStateFromError() {
        return { fallo: true };
    }
    render() {
        return this.state.fallo ? null : this.props.children;
    }
}

export interface DemoPasoProps {
    /** La clave de demostración del paso (`PasoGuia.demo`); `null` = el paso no tiene. */
    clave: ClaveDemo | null;
    accent: string;
    reduce: boolean;
}

export function DemoPaso({ clave, accent, reduce }: DemoPasoProps) {
    if (!clave) return null;
    const Demo = perezosaDe(clave);
    return (
        <div data-demo={clave}>
            <SinDemoSiFalla key={clave}>
                <Suspense fallback={<MarcoDemo />}>
                    <Demo accent={accent} reduce={reduce} />
                </Suspense>
            </SinDemoSiFalla>
        </div>
    );
}

export default DemoPaso;
