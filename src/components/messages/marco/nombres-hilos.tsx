"use client";

/**
 * Nombres de los hilos para quien no tiene la lista delante (2026-09-28): los Ajustes de
 * Mensajería enseñan «Chats personalizados» por su nombre, no por un id. La página de Mensajes
 * registra sus chats y el panel de Correos sus asuntos; fuera de ese marco el contexto está
 * vacío y cada cual cae a un nombre genérico honesto.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TipoHilo } from "@/lib/mensajeria/ajustes-tipos";

export interface NombreHilo {
    nombre: string;
    tipo: TipoHilo;
}

interface NombresHilosCtx {
    nombres: Record<string, NombreHilo>;
    registrar: (entradas: Record<string, NombreHilo>) => void;
}

const Contexto = createContext<NombresHilosCtx>({ nombres: {}, registrar: () => {} });

export function ProveedorNombresHilos({ children }: { children: ReactNode }) {
    const [nombres, setNombres] = useState<Record<string, NombreHilo>>({});
    const registrar = useCallback((entradas: Record<string, NombreHilo>) => {
        setNombres((prev) => {
            let cambia = false;
            for (const [id, n] of Object.entries(entradas)) {
                const p = prev[id];
                if (!p || p.nombre !== n.nombre || p.tipo !== n.tipo) {
                    cambia = true;
                    break;
                }
            }
            return cambia ? { ...prev, ...entradas } : prev;
        });
    }, []);
    const valor = useMemo(() => ({ nombres, registrar }), [nombres, registrar]);
    return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useNombresHilos(): NombresHilosCtx {
    return useContext(Contexto);
}

const GENERICO: Record<TipoHilo, string> = { dm: "Chat", grupo: "Grupo", correo: "Correo" };

/** Nombre legible de un hilo (o uno genérico con la cola del id si no lo conocemos). */
export function nombreDeHilo(nombres: Record<string, NombreHilo>, id: string): NombreHilo {
    return nombres[id] ?? { nombre: `Chat ${id.slice(0, 6)}`, tipo: "dm" };
}

export function nombreGenerico(tipo: TipoHilo): string {
    return GENERICO[tipo];
}
