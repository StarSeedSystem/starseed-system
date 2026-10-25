"use client";

/**
 * PuertaSesion — lo que ve quien llega a una página que pide cuenta sin tenerla.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025B · Alex 2026-10-25) Antes cada página pintaba su propia tarjeta suelta «Tu perfil ·
 * Inicia sesión con tu cuenta…» sobre un fondo vacío. Ahora todas pintan ESTA puerta:
 *
 *   · DETRÁS, la página como sería con datos vacíos (el perfil por defecto con su portada, su avatar vacío,
 *     «Tu nombre», «@usuario», las pestañas y las secciones), difuminada y con un velo, sin que se pueda
 *     tocar (`aria-hidden` + `inert` + `pointer-events-none`);
 *   · DELANTE, centrada, la tarjeta «Te damos la bienvenida a StarSeed OS» con sus tres acciones —las mismas
 *     del aviso de abajo del primer arranque—: «Entrar o crear cuenta» abre LA ventana de acceso
 *     (`ventana-acceso.tsx`) en la cuenta, «Ver la introducción» la abre desde el principio, y «Explorar
 *     sin cuenta» deja la marca y lleva a los escritorios.
 *
 * Mientras la puerta está a la vista avisa al primer arranque (`puerta-visible.ts`) para que NO pinte
 * además su aviso de abajo: la tarjeta es la misma y ya está en el centro.
 *
 * Con sesión, la página no monta la puerta: pinta lo suyo, como siempre. La puerta no decide nada de la
 * sesión; quien la usa le pasa la decisión (`if (!user) return <PuertaSesion … />`).
 */

import { Suspense, lazy, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { TarjetaBienvenida } from "@/components/onboarding/tarjeta-bienvenida";
import { abrirPrimerArranque } from "@/lib/onboarding/primer-arranque";
import { explorarSinCuenta } from "@/lib/onboarding/explorar-sin-cuenta";
import { registrarPuerta } from "@/lib/onboarding/puerta-visible";
import type { VistaPreviaId } from "@/components/auth/vista-previa-sesion";

// La vista previa se carga aparte: las páginas con sesión nunca la descargan.
const VistaPrevia = lazy(() => import("@/components/auth/vista-previa-sesion"));

export interface PuertaSesionProps {
    /** Qué página se difumina detrás: el perfil por defecto o una vista neutra de la página que la usa. */
    vista?: VistaPreviaId;
    /** Cómo se llama la página que pide sesión («Tu perfil», «Tu cuenta»…): el título que lee un lector de pantalla. */
    nombrePagina: string;
    className?: string;
}

export function PuertaSesion({ vista = "perfil", nombrePagina, className }: PuertaSesionProps) {
    const router = useRouter();

    // Mientras esta puerta esté a la vista, el aviso de abajo del primer arranque no sale.
    useEffect(() => registrarPuerta(), []);

    const entrar = useCallback(() => abrirPrimerArranque("acceso", "signin"), []);
    const introduccion = useCallback(() => abrirPrimerArranque("intro"), []);
    const explorar = useCallback(() => explorarSinCuenta(router), [router]);

    return (
        <section
            data-testid="puerta-sesion"
            data-vista={vista}
            aria-label={`${nombrePagina}: inicia sesión para verla`}
            className={cn(
                "relative isolate flex min-h-[min(40rem,calc(100dvh-8rem))] w-full items-center justify-center overflow-hidden rounded-3xl",
                className,
            )}
        >
            <h1 className="sr-only">{nombrePagina}</h1>

            {/* Detrás: la página con datos vacíos, difuminada y sin poder tocarse. */}
            <div
                aria-hidden="true"
                // `inert` saca del foco y de la lectura todo lo de dentro (las pestañas de la vista previa).
                inert
                data-testid="puerta-vista-previa"
                className="pointer-events-none absolute inset-0 select-none overflow-hidden"
            >
                <div className="h-full w-full scale-[1.03] blur-[7px]">
                    <Suspense fallback={null}>
                        <VistaPrevia vista={vista} />
                    </Suspense>
                </div>
            </div>
            {/* El velo: apaga lo de detrás para que la tarjeta mande. */}
            <div aria-hidden="true" data-testid="puerta-velo" className="pointer-events-none absolute inset-0 bg-background/60" />

            {/* Delante, centrada: la tarjeta de bienvenida. */}
            <div className="relative z-10 flex w-full justify-center p-4">
                <TarjetaBienvenida variante="puerta" onEntrar={entrar} onIntroduccion={introduccion} onExplorar={explorar} />
            </div>
        </section>
    );
}

export default PuertaSesion;
