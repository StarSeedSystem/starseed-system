"use client";

import { useMemo } from "react";
import {
    asignarColoresUnicos,
    estiloSeleccionUsuario,
    type ParticipanteSeleccion,
} from "@/lib/seleccion/colores-seleccion";

export interface SeleccionRemotaActiva {
    usuarioId: string;
    nombre: string;
    textoSeleccionado?: string;
    rango?: { x: number; y: number; w: number; h: number };
    colorPreferido?: string;
}

export interface CapaSeleccionCompartidaProps {
    participantes: readonly ParticipanteSeleccion[];
    selecciones?: readonly SeleccionRemotaActiva[];
    etiquetaContexto?: string;
    compacta?: boolean;
}

/**
 * Capa visual ligera para sesiones compartidas, transmisiones en vivo, sesiones de nodos,
 * canales y control remoto: muestra la leyenda con el color único de cada participante y,
 * cuando existen selecciones espaciales o de texto, las dibuja sin interceptar el puntero.
 */
export function CapaSeleccionCompartida({
    participantes,
    selecciones = [],
    etiquetaContexto = "Sesión compartida",
    compacta = false,
}: CapaSeleccionCompartidaProps) {
    const mapaColores = useMemo(() => {
        const lista = [...participantes];
        for (const sel of selecciones) {
            if (!lista.some((p) => p.id === sel.usuarioId)) {
                lista.push({
                    id: sel.usuarioId,
                    nombre: sel.nombre,
                    colorPreferido: sel.colorPreferido,
                });
            }
        }
        return asignarColoresUnicos(lista);
    }, [participantes, selecciones]);

    const entradas = Object.values(mapaColores);
    if (entradas.length === 0 && selecciones.length === 0) return null;

    return (
        <div
            data-testid="capa-seleccion-compartida"
            aria-label={`Colores de selección en ${etiquetaContexto}`}
            className="pointer-events-none flex flex-col gap-1.5"
        >
            {selecciones.some((s) => s.rango) ? (
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                    {selecciones.map((sel) => {
                        if (!sel.rango) return null;
                        const asignado = mapaColores[sel.usuarioId] ?? estiloSeleccionUsuario("#007FFF");
                        return (
                            <div
                                key={`${sel.usuarioId}-rango`}
                                style={{
                                    left: `${sel.rango.x * 100}%`,
                                    top: `${sel.rango.y * 100}%`,
                                    width: `${sel.rango.w * 100}%`,
                                    height: `${sel.rango.h * 100}%`,
                                    backgroundColor: asignado.fondo,
                                    borderColor: asignado.borde,
                                }}
                                className="absolute rounded border"
                            >
                                <span
                                    style={{ backgroundColor: asignado.borde, color: asignado.texto }}
                                    className="inline-block -translate-y-full rounded-t px-1.5 py-0.5 text-[10px] font-semibold"
                                >
                                    {sel.nombre}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {entradas.length > 0 ? (
                <div
                    className={`pointer-events-auto flex flex-wrap items-center gap-1.5 ${
                        compacta ? "text-[10px]" : "text-[11px]"
                    }`}
                >
                    <span className="text-white/50">{etiquetaContexto}:</span>
                    {entradas.map((u) => {
                        const selActiva = selecciones.find((s) => s.usuarioId === u.id && s.textoSeleccionado);
                        return (
                            <span
                                key={u.id}
                                data-testid={`chip-color-usuario-${u.id}`}
                                style={{
                                    backgroundColor: u.fondo,
                                    borderColor: u.borde,
                                    color: "#F8FAFC",
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium"
                                title={selActiva?.textoSeleccionado ? `${u.nombre}: «${selActiva.textoSeleccionado}»` : u.nombre}
                            >
                                <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: u.hex }}
                                    aria-hidden
                                />
                                <span>{u.nombre}</span>
                                {selActiva?.textoSeleccionado ? (
                                    <span className="max-w-32 truncate text-white/75">
                                        · «{selActiva.textoSeleccionado}»
                                    </span>
                                ) : null}
                            </span>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
