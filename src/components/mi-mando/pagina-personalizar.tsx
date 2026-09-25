"use client";

/**
 * Personalizar — qué páginas ves y en qué orden, y el código de este panel.
 * ─────────────────────────────────────────────────────────────────────────────
 * Las reglas (Inicio fijo y primero, normalización, «gana lo más reciente»)
 * están en src/lib/mi-mando/paginas.ts y probadas; aquí solo se dibujan los
 * controles. Cada botón dice en su nombre accesible QUÉ página mueve, porque
 * un lector de pantalla que oye siete «Subir» seguidos no sabe cuál es cuál.
 */

import { ArrowDown, ArrowUp, Code2, Eye, EyeOff, RotateCcw, SlidersHorizontal } from "lucide-react";

import {
    ajustesPredeterminados,
    alternarPagina,
    estaVisible,
    moverPagina,
    normalizarAjustes,
    PAGINA_FIJA,
    PAGINAS,
} from "@/lib/mi-mando/paginas";
import { cn } from "@/lib/utils";

import { useMiMando } from "./contexto";
import { CabeceraPagina, CLASE_ACCION, Chip, Tarjeta } from "./piezas";
import type { PropsPersonalizar } from "./use-ajustes-mi-mando";

const URL_CODIGO = "https://github.com/StarSeedSystem/starseed-system/tree/main/src/components/mi-mando";

const TEXTO_ESTADO: Record<PropsPersonalizar["estado"], string> = {
    local: "Guardado en este dispositivo.",
    guardando: "Guardando en tu cuenta…",
    cuenta: "Guardado en este dispositivo y en tu cuenta.",
    error: "Guardado en este dispositivo; no se pudo copiar a tu cuenta (se reintentará con el próximo cambio).",
};

const BOTON_ICONO =
    "grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9";

export default function PaginaPersonalizar({ ajustes, cambiar, estado }: PropsPersonalizar) {
    const { anunciar } = useMiMando();
    const n = normalizarAjustes(ajustes);
    const nombre = (id: string) => PAGINAS.find((p) => p.id === id)?.etiqueta ?? id;

    const mover = (id: (typeof n.orden)[number], dir: -1 | 1) => {
        const nuevo = moverPagina(n, id, dir);
        if (nuevo === n || nuevo.orden.join() === n.orden.join()) return;
        cambiar(nuevo);
        const pos = nuevo.orden.indexOf(id) + 1;
        anunciar(`«${nombre(id)}» ahora está en la posición ${pos} de ${nuevo.orden.length}.`);
    };

    const alternar = (id: (typeof n.orden)[number]) => {
        const nuevo = alternarPagina(n, id);
        cambiar(nuevo);
        anunciar(`«${nombre(id)}» ${estaVisible(nuevo, id) ? "se muestra" : "queda oculta"}.`);
    };

    const restablecer = () => {
        cambiar({ ...ajustesPredeterminados(), actualizado: Date.now() });
        anunciar("Panel restablecido: todas las páginas visibles en el orden original.");
    };

    return (
        <div className="space-y-4">
            <CabeceraPagina
                titulo="Personalizar"
                texto="Elige qué páginas ves y en qué orden. Inicio siempre está, para que nunca te quedes sin camino de vuelta."
                accion={
                    <button type="button" onClick={restablecer} className={CLASE_ACCION}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Restablecer
                    </button>
                }
            />

            <Tarjeta titulo="Páginas del panel" icono={SlidersHorizontal} descripcion={TEXTO_ESTADO[estado]}>
                <ol className="space-y-2">
                    {n.orden.map((id, i) => {
                        const def = PAGINAS.find((p) => p.id === id);
                        if (!def) return null;
                        const fija = id === PAGINA_FIJA;
                        const visible = estaVisible(n, id);
                        return (
                            <li
                                key={id}
                                className={cn(
                                    "flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3",
                                    !visible && "opacity-60",
                                )}
                            >
                                <span className="w-5 text-center text-xs font-semibold text-white/45" aria-hidden>{i + 1}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-white">
                                        {def.etiqueta} {fija && <Chip>Siempre visible</Chip>}
                                        {!visible && <Chip>Oculta</Chip>}
                                    </p>
                                    <p className="text-[11px] text-white/55">{def.descripcion}</p>
                                </div>
                                {!fija && (
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            className={BOTON_ICONO}
                                            onClick={() => mover(id, -1)}
                                            disabled={i <= 1}
                                            aria-label={`Subir ${def.etiqueta}`}
                                        >
                                            <ArrowUp className="h-4 w-4" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            className={BOTON_ICONO}
                                            onClick={() => mover(id, 1)}
                                            disabled={i >= n.orden.length - 1}
                                            aria-label={`Bajar ${def.etiqueta}`}
                                        >
                                            <ArrowDown className="h-4 w-4" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            className={BOTON_ICONO}
                                            onClick={() => alternar(id)}
                                            aria-label={visible ? `Ocultar ${def.etiqueta}` : `Mostrar ${def.etiqueta}`}
                                        >
                                            {visible ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                                        </button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ol>
                <p className="mt-3 text-[11px] text-white/50">
                    Si ocultas esta misma página, vuelve aquí desde la tarjeta «Tu panel, a tu manera» de Inicio.
                </p>
            </Tarjeta>

            <Tarjeta titulo="Código abierto" icono={Code2}>
                <p className="text-xs leading-relaxed text-white/70">
                    Este panel es software libre: cualquiera puede leer cómo funciona, proponer mejoras o crear su propia versión.
                </p>
                <a
                    href={URL_CODIGO}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(CLASE_ACCION, "mt-3")}
                >
                    <Code2 className="h-3.5 w-3.5" aria-hidden />
                    Ver el código de Mi Puente de Mando
                    <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
            </Tarjeta>
        </div>
    );
}
