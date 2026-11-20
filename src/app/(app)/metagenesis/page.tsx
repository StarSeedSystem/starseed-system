"use client";

/**
 * /metagenesis — la consola de MetaGenesis (el Genesis de los desarrolladores de StarSeed OS).
 * Usable desde cualquier neurona autorizada: red local (:9002), túnel cifrado y contenedores en la nube.
 */

import { CentroMando } from "@/components/mando/centro-mando";
import { CrearEnjambre } from "@/components/mando/crear-enjambre";
import { MetaGenesisRemoto } from "@/components/mando/metagenesis-remoto";
import { MetaGenesisAutonoma } from "@/components/metagenesis/metagenesis-autonoma";

export default function MetaGenesisPage() {
    return (
        <main className="mc-raiz min-h-screen bg-[#0A0F1D] px-4 py-6 text-slate-100 md:px-8">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-400/20 bg-gradient-to-r from-sky-500/10 via-[#0A0F1D] to-emerald-500/10 px-5 py-4 shadow-lg">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">
                            StarSeed OS · Control Autónomo
                        </span>
                    </div>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                        MetaGenesis · Dirección y Producción
                    </h1>
                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">
                        Consola unificada para dirigir agentes, canales sincronizados, flota gratuita, compilaciones y
                        pruebas desde esta Mac o cualquier contenedor remoto sin depender de aplicaciones gráficas abiertas.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <a
                        href="#mando-pestanas"
                        className="cursor-pointer rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 font-medium text-sky-100 hover:bg-sky-500/25"
                    >
                        Secciones y ajustes
                    </a>
                </div>
            </header>
            <MetaGenesisAutonoma />
            <MetaGenesisRemoto>
                <CentroMando />
                <div className="mx-auto mt-8 max-w-xl">
                    <CrearEnjambre />
                </div>
            </MetaGenesisRemoto>
        </main>
    );
}
