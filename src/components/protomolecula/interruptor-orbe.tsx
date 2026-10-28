"use client";

/**
 * Interruptor de la orbe de la Protomolécula para el lienzo de creación (Trinidad izquierda, Horizon).
 * Una sola puerta (`fijarOrbeActivada`) para encenderla o apagarla aquí o pedírselo a Astraura desde
 * cualquier medio, y un botón «Abrir» que pide abrir su lienzo. Escucha los cambios de fuera para
 * reflejarlos al instante (Astraura, otra neurona, otra pestaña).
 */

import { useCallback, useEffect, useState } from "react";
import { Atom, ExternalLink } from "lucide-react";
import {
    PROTO_ORB_ABRIR_EVENT,
    PROTO_ORB_FAB_EVENT,
    PROTO_ORB_FAB_KEY,
    fijarOrbeActivada,
    leerActivada,
} from "@/lib/protomolecula/orbe-bus";
import { cn } from "@/lib/utils";

function almacenLocal(): Storage | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

export function InterruptorOrbeProtomolecula() {
    const [activada, setActivada] = useState(true);

    useEffect(() => {
        const almacen = almacenLocal();
        if (almacen) setActivada(leerActivada(almacen));

        const alAvisar = (evento: Event) => {
            const detalle = (evento as CustomEvent<{ activada?: unknown }>).detail;
            if (typeof detalle?.activada === "boolean") {
                setActivada(detalle.activada);
                return;
            }
            const actual = almacenLocal();
            if (actual) setActivada(leerActivada(actual));
        };
        const alCambiarAlmacen = (evento: StorageEvent) => {
            if (evento.key !== null && evento.key !== PROTO_ORB_FAB_KEY) return;
            const actual = almacenLocal();
            if (actual) setActivada(leerActivada(actual));
        };

        window.addEventListener(PROTO_ORB_FAB_EVENT, alAvisar);
        window.addEventListener("storage", alCambiarAlmacen);
        return () => {
            window.removeEventListener(PROTO_ORB_FAB_EVENT, alAvisar);
            window.removeEventListener("storage", alCambiarAlmacen);
        };
    }, []);

    const alternar = useCallback((siguiente: boolean) => {
        setActivada(fijarOrbeActivada(siguiente));
    }, []);

    const abrir = useCallback(() => {
        window.dispatchEvent(new CustomEvent(PROTO_ORB_ABRIR_EVENT, { cancelable: true }));
    }, []);

    return (
        <section
            aria-label="Orbe de la Protomolécula"
            className="flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] p-3"
        >
            <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-emerald-300/35 bg-emerald-500/15"
            >
                <Atom className="h-5 w-5 text-lime-200" />
            </span>

            <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium leading-tight text-emerald-50">Orbe de la Protomolécula</h3>
                <p className="mt-0.5 text-[11px] leading-snug text-emerald-100/60">
                    Actívala aquí o pídeselo a Astraura desde cualquier medio
                </p>
            </div>

            <button
                type="button"
                role="switch"
                aria-checked={activada}
                aria-label="Orbe de la Protomolécula"
                onClick={() => alternar(!activada)}
                onKeyDown={(evento) => {
                    if (evento.key !== " " && evento.key !== "Enter") return;
                    evento.preventDefault();
                    alternar(!activada);
                }}
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-lime-300/70"
            >
                <span
                    aria-hidden="true"
                    className={cn(
                        "relative h-6 w-11 rounded-full transition-colors duration-200",
                        activada ? "bg-emerald-500" : "bg-white/20",
                    )}
                >
                    <span
                        className={cn(
                            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
                            activada && "translate-x-5",
                        )}
                    />
                </span>
            </button>

            <button
                type="button"
                onClick={abrir}
                disabled={!activada}
                className={cn(
                    "inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-emerald-300/40 px-3 text-xs font-medium text-emerald-50 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-lime-300/70",
                    activada
                        ? "cursor-pointer hover:bg-emerald-500/20"
                        : "cursor-not-allowed opacity-40",
                )}
            >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Abrir
            </button>
        </section>
    );
}
