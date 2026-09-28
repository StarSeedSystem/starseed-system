"use client";

/**
 * Lo que necesita cualquier bloque de un programa para pintarse y actuar: el estado compartido,
 * quién soy, qué puedo hacer y cómo proponer una acción al diario. Un contexto evita pasar diez
 * propiedades por cada nivel.
 */
import { createContext, useContext } from "react";
import type { Datos } from "@/lib/vivo/juegos/tipos";
import type { BloqueProg, EstadoPrograma } from "@/lib/vivo/programas/tipos";

export interface ContextoPrograma {
    estado: EstadoPrograma;
    yoUid: string | null;
    yoNombre: string;
    /** Con sesión y con permiso de escritura: puede votar, marcar, apuntarse… */
    puedeParticipar: boolean;
    /** Además, puede cambiar la estructura (quien creó el programa, o cualquiera si está abierto). */
    puedeEstructura: boolean;
    /** Enseñar los controles de estructura de cada bloque. */
    modoEdicion: boolean;
    /** Propone una acción al diario; si las reglas no la permiten, avisa y devuelve false. */
    enviar: (k: string, d?: Datos) => boolean;
    /** Abre el editor de un bloque. */
    editarBloque: (b: BloqueProg) => void;
}

const Contexto = createContext<ContextoPrograma | null>(null);

export const ProveedorPrograma = Contexto.Provider;

export function usePrograma(): ContextoPrograma {
    const c = useContext(Contexto);
    if (!c) throw new Error("usePrograma se usa dentro de <RenderPrograma>.");
    return c;
}
