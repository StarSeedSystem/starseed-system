"use client";

/**
 * Contenido de la cortina Horizon (izquierda · verde): Centro de Creación.
 * Separado de side-curtains.tsx para que el armazón de las cortinas (gestos, cierre, accesibilidad) y su
 * contenido se puedan leer y cambiar por separado. Todas las áreas ABREN de verdad su destino (Adenda 63).
 *
 * Rediseño del 2026-10-25 (CRE1025A): arriba la tarjeta «Protomolécula» (interruptor de la orbe y sus ajustes),
 * después Crear, Pizarras y Zona de publicación en secciones plegables, sobre cristal oscuro esmeralda con una
 * flor de la vida muy tenue de fondo. Las piezas viven en `./horizon/`.
 */

import { ArrowLeft, Gem, Maximize2, Shapes } from "lucide-react";
import { InterruptorOrbeProtomolecula } from "@/components/protomolecula/interruptor-orbe";
import { usePerfilDispositivo } from "@/hooks/use-perfil-dispositivo";
import { usePanelCortina } from "./panel-cortina";
import { AccionesCrear } from "./horizon/acciones-crear";
import { RUTA_PAGINA_COMPLETA } from "./horizon/datos";
import { FlorDeLaVida } from "./horizon/flor-de-la-vida";
import { PizarrasActivas } from "./horizon/pizarras-activas";
import { Seccion } from "./horizon/seccion";
import { TarjetaProtomolecula } from "./horizon/tarjeta-protomolecula";
import { ZonaPublicacion } from "./horizon/zona-publicacion";

interface Props {
    ir: (href: string) => void;
    abrirEditor: () => void;
    /** Cierra la cortina y abre la Fragua de Widgets (`starseed:open-forge`). */
    abrirFragua: () => void;
    /** Abre una pizarra en su visor (Logic); sin id, la que acaba de crear `createBoard`. */
    abrirPizarra: (id?: string) => void;
}

export function ContenidoHorizon({ ir, abrirEditor, abrirFragua, abrirPizarra }: Props) {
    const panel = usePanelCortina();
    const { entrada } = usePerfilDispositivo();
    const pistaCierre = entrada === "raton"
        ? "o desliza con dos dedos hacia la izquierda · Esc"
        : "o desliza el panel hacia la izquierda";

    return (
        <div className="relative w-full h-full flex flex-col">
            {/* Cristal + tinte esmeralda + flor de la vida (contenidos en el panel, fijos mientras se desplaza) */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/55 via-transparent to-emerald-900/10 pointer-events-none" />
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
                <FlorDeLaVida className="absolute -right-28 -top-24 h-[28rem] w-[28rem] text-emerald-300/[0.07] motion-safe:animate-[spin_240s_linear_infinite]" />
                <FlorDeLaVida className="absolute -bottom-32 -left-32 h-[24rem] w-[24rem] text-lime-300/[0.05]" />
            </div>

            <div className="relative z-10 w-full flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar text-emerald-50 pt-16 md:pt-14 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-5 md:px-8">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
                    {/* Cabecera */}
                    <header className="flex flex-col items-center gap-3 text-center">
                        <div
                            data-ss-coreo="logo"
                            className="grid h-14 w-14 place-items-center rounded-full border border-emerald-300/40 bg-emerald-500/20 shadow-[0_0_28px_rgba(16,185,129,0.5)]"
                        >
                            <Gem className="h-7 w-7 text-lime-200" aria-hidden="true" />
                        </div>
                        <div>
                            <h2 className="font-headline text-2xl font-light uppercase tracking-widest md:text-3xl">Centro de Creación</h2>
                            <p className="mt-1 font-mono text-[11px] tracking-wider text-emerald-300/60">UNIVERSAL CANVAS HUB</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => ir(RUTA_PAGINA_COMPLETA)}
                            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full px-4 text-xs text-emerald-300/85 outline-none transition-colors duration-150 hover:bg-emerald-500/10 hover:text-emerald-200 focus-visible:ring-2 focus-visible:ring-lime-300/60"
                        >
                            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> Abrir página completa
                        </button>
                    </header>

                    <TarjetaProtomolecula ir={ir} />

                    <InterruptorOrbeProtomolecula />

                    <Seccion titulo="Crear" icono={Shapes}>
                        <AccionesCrear ir={ir} abrirEditor={abrirEditor} abrirFragua={abrirFragua} />
                    </Seccion>

                    <PizarrasActivas ir={ir} abrirPizarra={abrirPizarra} />

                    <ZonaPublicacion ir={ir} />

                    {/* Pie: cerrar con la misma animación que el gesto, y cómo hacerlo con el gesto. */}
                    <button
                        type="button"
                        onClick={() => panel?.cerrar()}
                        className="flex min-h-[44px] flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-1 border-t border-emerald-500/10 py-4 text-sm text-emerald-400/60 outline-none transition-colors duration-150 hover:text-emerald-200 focus-visible:ring-2 focus-visible:ring-lime-300/60"
                    >
                        <span className="flex items-center gap-2 uppercase tracking-wider">
                            <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Cerrar
                        </span>
                        <span className="text-[11px] normal-case tracking-normal text-emerald-300/45">{pistaCierre}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
