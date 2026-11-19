"use client";

/**
 * AvisoCambioOrigen — «El origen cambió: se trajeron tus datos» (CTL1119F).
 * Contrato: architecture/apps-autonomas-sin-internet.md §2.2 · lógica: src/lib/control-remoto/canal.ts.
 *
 * Global (layout raíz), diminuto. Solo en la app de escritorio servida por su servidor local:
 * detecta si se volvió al puerto principal tras un rescate, comprueba si la clave del aparato
 * existe y, si no, ofrece botón para crearla de nuevo. Registra `origen cambio de= a= causa= migrado=`.
 */

import { useEffect, useState } from "react";
import { Database, X, RefreshCw } from "lucide-react";
import { esServidorLocal } from "@/lib/nativa/sin-conexion";
import {
    leerEstadoOrigen,
    registrarCambioOrigen,
    claveAparatoExiste,
    recrearClaveAparato,
    type EstadoOrigenLocal,
} from "@/lib/control-remoto/canal";

export function AvisoCambioOrigen() {
    const [aviso, setAviso] = useState<{
        mostrar: boolean;
        principal: number;
        actual: number;
        claveExiste: boolean;
        resumen: string;
        creando: boolean;
    } | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        let vivo = true;

        async function comprobar() {
            try {
                const enLocal = esServidorLocal(window.location);
                if (!enLocal) return;

                const estado = await leerEstadoOrigen();
                if (!estado || !estado.principal || !estado.ultimo_puerto) return;

                const { principal, ultimo_puerto, cambios, ultimo_rescate } = estado;
                if (principal === ultimo_puerto && cambios > 0 && ultimo_rescate) {
                    const claveExiste = await claveAparatoExiste();
                    if (vivo) {
                        setAviso({
                            mostrar: true,
                            principal,
                            actual: ultimo_puerto,
                            claveExiste,
                            resumen: ultimo_rescate,
                            creando: false,
                        });
                    }
                }
            } catch {
                // Sin acceso a Tauri o error: no hay nada que contar.
            }
        }

        comprobar();
        return () => {
            vivo = false;
        };
    }, []);

    if (!aviso) return null;

    const cerrar = () => setAviso(null);

    const crearClave = async () => {
        if (aviso.creando) return;
        setAviso((a) => a ? { ...a, creando: true } : null);
        try {
            const { uidActual } = await import("@/lib/consumo/usuario");
            const cuenta = await uidActual();
            if (!cuenta) throw new Error("sin-cuenta");
            const nombre = navigator.platform || "Neurona";
            const r = await recrearClaveAparato(nombre, cuenta);
            if (r.ok) {
                registrarCambioOrigen(aviso.actual, aviso.principal, "recreacion-clave", true);
                setAviso((a) => a ? { ...a, claveExiste: true, creando: false } : null);
            } else {
                setAviso((a) => a ? { ...a, creando: false } : null);
            }
        } catch {
            setAviso((a) => a ? { ...a, creando: false } : null);
        }
    };

    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="aviso-cambio-origen"
            className="pointer-events-auto fixed bottom-24 left-1/2 z-[9988] flex w-[min(36rem,92vw)] -translate-x-1/2 items-start gap-2.5 rounded-2xl border border-white/10 bg-black/70 px-3.5 py-2.5 text-xs text-white/90 shadow-lg backdrop-blur-md"
        >
            <Database aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <div className="min-w-0 flex-1">
                <p className="font-medium text-white">Origen del servidor local: vuelta al puerto principal</p>
                <p className="mt-0.5 leading-relaxed text-white/70">
                    {aviso.resumen}
                    {aviso.claveExiste ? " La clave del aparato ya existe." : " La clave del aparato no se pudo traer."}
                </p>
            </div>
            <div className="flex items-center gap-1.5">
                {!aviso.claveExiste && (
                    <button
                        type="button"
                        onClick={crearClave}
                        disabled={aviso.creando}
                        aria-label={aviso.creando ? "Creando clave del aparato…" : "Crear clave del aparato de nuevo"}
                        className="cursor-pointer rounded-md bg-sky-500/80 px-2 py-1 font-medium text-black transition-colors hover:bg-sky-400 disabled:opacity-50 disabled:cursor-wait min-h-[2rem]"
                    >
                        {aviso.creando ? (
                            <>
                                <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin inline-block mr-1" />
                                Creando…
                            </>
                        ) : (
                            "Crear clave"
                        )}
                    </button>
                )}
                <button
                    type="button"
                    onClick={cerrar}
                    aria-label="Cerrar el aviso de cambio de origen"
                    className="cursor-pointer rounded-full p-0.5 text-white/60 transition-colors duration-200 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}