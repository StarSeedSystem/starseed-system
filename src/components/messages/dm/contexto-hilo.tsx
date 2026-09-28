"use client";

/**
 * Contexto del chat abierto: lo que comparten la cabecera, las burbujas y el panel de
 * información sin pasarlo de mano en mano (carpetas, visor, «ir al mensaje»…). Un solo
 * `useCarpetasHilo` por chat, no uno por burbuja.
 */
import { createContext, useContext } from "react";
import type { CarpetaHilo, ItemCarpeta, VisibilidadCarpeta } from "@/lib/mensajeria/carpetas-tipos";
import type { AjustesEfectivos } from "@/lib/mensajeria/ajustes-tipos";
import type { DmMessage } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";

/** Lo que devuelve `useCarpetasHilo` (contrato C7). */
export interface ApiCarpetasHilo {
    carpetas: CarpetaHilo[];
    listo: boolean;
    error: string | null;
    crear(nombre: string, visibilidad: VisibilidadCarpeta, color?: string): Promise<CarpetaHilo | null>;
    renombrar(id: string, nombre: string): Promise<void>;
    eliminar(id: string): Promise<void>;
    agregarItem(carpetaId: string, item: Omit<ItemCarpeta, "id" | "agregado" | "por">): Promise<void>;
    quitarItem(carpetaId: string, itemId: string): Promise<void>;
    publicarEnBiblioteca(carpetaId: string): Promise<string | null>;
}

/** Sub-vistas del panel de información. */
export type VistaInfo = "inicio" | "archivos" | "carpetas" | "ajustes" | "miembros";

export type NuevoItemCarpeta = Omit<ItemCarpeta, "id" | "agregado" | "por">;

export interface ContextoHiloValor {
    hiloId: string;
    miUid: string | null;
    esGrupo: boolean;
    perfiles: Record<string, OsProfile>;
    /** Mensajes cargados (todos, también los ocultos por «vaciar»). */
    mensajes: DmMessage[];
    efectivos: AjustesEfectivos;
    carpetas: ApiCarpetasHilo;
    /** Nombre visible de un remitente. */
    nombreDe(userId: string | null | undefined): string;
    abrirVisor(mensajeId: string): void;
    irAlMensaje(mensajeId: string): void;
}

export const ContextoHilo = createContext<ContextoHiloValor | null>(null);

export function useContextoHilo(): ContextoHiloValor | null {
    return useContext(ContextoHilo);
}
